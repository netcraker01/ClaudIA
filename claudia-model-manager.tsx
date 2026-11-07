// @ts-nocheck
/** @jsxImportSource @opentui/solid */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createSignal } from "solid-js"

const id = "claudia-model-manager"
const configPath = path.join(os.homedir(), ".config", "opencode", "opencode.json")
const profilesDir = path.join(os.homedir(), ".config", "opencode", "profiles")
const agentPrefix = "claudia-"
let refreshIndicator = () => {}

function readConfig() { return JSON.parse(fs.readFileSync(configPath, "utf8")) }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }
function slug(value) { return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") }

function agents() {
  const config = readConfig()
  return Object.entries(config.agents || {}).filter(([name, value]) => name.startsWith(agentPrefix) && value?.mode === "subagent").map(([name, value]) => ({ name, config: value })).sort((a, b) => a.name.localeCompare(b.name))
}

function profiles() {
  if (!fs.existsSync(profilesDir)) return []
  return fs.readdirSync(profilesDir).filter((name) => name.startsWith("claudia-") && name.endsWith(".json")).map((name) => {
    const file = path.join(profilesDir, name)
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")); data.agents ||= data.models || {}
      if (data.primary && typeof data.primary === "string") data.primary = { model: data.primary }
      for (const [agentName, value] of Object.entries(data.agents)) if (typeof value === "string") data.agents[agentName] = { model: value }
      return { file, data }
    } catch { return null }
  }).filter(Boolean).sort((a, b) => String(a.data.name || a.file).localeCompare(String(b.data.name || b.file)))
}

function modelOptions(api, current) {
  const result = []
  for (const provider of api.state.provider || []) for (const [modelId, model] of Object.entries(provider.models || {})) {
    const value = `${provider.id}/${modelId}`
    const isCurrent = value === current?.model
    const variant = isCurrent ? ` · current${current.variant ? ` (${current.variant})` : " (default)"}` : ""
    result.push({ title: `${isCurrent ? "✓ " : ""}${value}`, value, description: `${model.name || provider.name || provider.id}${variant}` })
  }
  return result.sort((a, b) => a.title.localeCompare(b.title))
}

function variantsFor(api, modelId) {
  if (!modelId) return []
  const [providerId, ...rest] = modelId.split("/")
  const provider = (api.state.provider || []).find((item) => item.id === providerId)
  return Object.keys(provider?.models?.[rest.join("/")]?.variants || {}).sort()
}

function assignment(value) {
  if (!value) return { model: "" }
  const raw = typeof value === "string" ? value : value.model || ""
  const split = raw.lastIndexOf("#")
  const model = split > -1 ? raw.slice(0, split) : raw
  const variant = (typeof value === "object" && value.variant) || (split > -1 ? raw.slice(split + 1) : "")
  return { model, ...(variant ? { variant } : {}) }
}
function configuredModel(value) { const item = assignment(value); return `${item.model}${item.variant ? `#${item.variant}` : ""}` }

function profileIdentity(config) {
  return JSON.stringify({
    primary: assignment(config.agents?.claudia),
    agents: Object.fromEntries(agents().map(({ name }) => [name, assignment(config.agents?.[name])]))
  })
}

function storedProfileIdentity(data) {
  const agentsByName = data.agents || data.models || {}
  return JSON.stringify({
    primary: assignment(data.primary),
    agents: Object.fromEntries(agents().map(({ name }) => [name, assignment(agentsByName[name])]))
  })
}

function currentProfileName() {
  const config = readConfig()
  const current = profileIdentity(config)
  const match = profiles().find((profile) => storedProfileIdentity(profile.data) === current)
  return match?.data?.name || "Personalizado"
}

function persistConfig(api, config, message) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  fs.copyFileSync(configPath, `${configPath}.before-model-ui-${stamp}.bak`); writeJson(configPath, config)
  api.ui.toast({ title: "Claudia model manager", message: `${message} · OpenCode recargará la configuración guardada`, variant: "success" })
  refreshIndicator()
}

function saveCurrentAssignment(api, target, value) {
  const config = readConfig(); config.agents ||= {}; config.agents[target] ||= { mode: target === "claudia" ? "primary" : "subagent" }; config.agents[target].model = configuredModel(value); delete config.agents[target].variant
  persistConfig(api, config, `${target} → ${value.model}${value.variant ? ` · ${value.variant}` : ""}`); openCurrentTargetPicker(api)
}

function pickVariant(api, title, model, callback, onCancel, current) {
  const variants = variantsFor(api, model)
  if (variants.length === 0) return callback({ model })
  api.ui.dialog.replace(() => <api.ui.DialogSelect title={`${title} · variant`} options={[{ title: `Default model variant${!current?.variant ? " · current" : ""}`, value: "__default__", description: "Use the provider default" }, ...variants.map((variant) => ({ title: `${variant}${variant === current?.variant ? " · current" : ""}`, value: variant }))]} onSelect={(option) => callback({ model, ...(option.value !== "__default__" ? { variant: option.value } : {}) })} onCancel={onCancel} />)
}

function pickModel(api, title, current, callback, onCancel) { api.ui.dialog.replace(() => <api.ui.DialogSelect title={title} placeholder="Search provider or model" current={current?.model} options={modelOptions(api, current)} onSelect={(option) => option?.value && pickVariant(api, title, option.value, callback, onCancel, option.value === current?.model ? current : undefined)} onCancel={onCancel} />) }
function assignmentLabel(value) { const item = assignment(value); return `${item.model || "Unassigned"}${item.variant ? ` · ${item.variant}` : ""}` }
function profileSummary(data) { const byName = data.agents || data.models || {}; return [`Claudia: ${assignmentLabel(data.primary)}`, ...agents().map(({ name }) => `${name.replace(agentPrefix, "")}: ${assignmentLabel(byName[name])}`)].join(" · ") }
function openCurrentTargetPicker(api) {
  const config = readConfig()
  api.ui.dialog.replace(() => <api.ui.DialogSelect title="Claudia · assign models" options={[{ title: "claudia", value: "claudia", description: `Primary · ${assignmentLabel(config.agents?.claudia)}` }, ...agents().map(({ name, config: value }) => ({ title: name, value: name, description: `${assignmentLabel(value)} · ${value.description || "Subagent"}` }))]} onSelect={(option) => { const current = readConfig().agents?.[option.value]; pickModel(api, `Assign model · ${option.value}`, assignment(current), (value) => saveCurrentAssignment(api, option.value, value), () => openCurrentTargetPicker(api)) }} onCancel={() => openMainMenu(api)} />)
}

function profileDataFromCurrent(name, description) { const config = readConfig(); return { name, description, primary: assignment(config.agents?.claudia), agents: Object.fromEntries(agents().map(({ name: agentName, config: value }) => [agentName, assignment(value)])) } }
function saveProfile(api, name, description = "Claudia model profile", source) {
  const clean = slug(name); if (!clean) return; fs.mkdirSync(profilesDir, { recursive: true }); const data = source ? JSON.parse(JSON.stringify(source.data)) : profileDataFromCurrent(clean, description); data.name = clean; data.description = description; writeJson(path.join(profilesDir, `claudia-${clean}.json`), data); api.ui.toast({ title: "Profile saved", message: clean, variant: "success" }); openProfileMenu(api)
}
function promptProfileName(api, title, callback, onCancel) { api.ui.dialog.replace(() => <api.ui.DialogPrompt title={title} placeholder="profile-name" onConfirm={(value) => callback(value)} onCancel={onCancel} />) }

function applyProfile(api, profile) {
  const config = readConfig(); config.agents ||= {}; const primary = assignment(profile.data.primary); config.agents.claudia ||= { mode: "primary" }; config.agents.claudia.model = configuredModel(primary); delete config.agents.claudia.variant
  for (const [agentName, raw] of Object.entries(profile.data.agents || {})) { if (!agentName.startsWith(agentPrefix)) continue; const value = assignment(raw); config.agents[agentName] ||= { mode: "subagent" }; config.agents[agentName].model = configuredModel(value); delete config.agents[agentName].variant }
  persistConfig(api, config, `Applied profile ${profile.data.name}`); openProfileMenu(api)
}

function chooseProfile(api, title, callback, onCancel = () => openMainMenu(api)) { const list = profiles(); api.ui.dialog.replace(() => <api.ui.DialogSelect title={title} placeholder="Search profiles" options={list.map((profile) => ({ title: `${profile.data.name === currentProfileName() ? "✓ " : ""}${profile.data.name || path.basename(profile.file, ".json")}`, value: profile.file, description: profileSummary(profile.data) }))} onSelect={(option) => { const selected = list.find((item) => item.file === option?.value); if (selected) callback(selected) }} onCancel={onCancel} />) }

function openProfileEditor(api, profile) {
  const targets = [{ title: "claudia", value: "claudia", description: `Primary · ${assignmentLabel(profile.data.primary)}` }, ...agents().map(({ name }) => ({ title: name, value: name, description: assignmentLabel(profile.data.agents?.[name]) }))]
  api.ui.dialog.replace(() => <api.ui.DialogSelect title={`Edit profile · ${profile.data.name}`} options={targets} onSelect={(option) => { const target = option.value; const current = target === "claudia" ? assignment(profile.data.primary) : assignment(profile.data.agents?.[target]); pickModel(api, `${profile.data.name} · ${target}`, current, (value) => { if (target === "claudia") profile.data.primary = value; else { profile.data.agents ||= {}; profile.data.agents[target] = value }; writeJson(profile.file, profile.data); api.ui.toast({ title: "Profile updated", message: `${profile.data.name} · ${target}`, variant: "success" }); openProfileEditor(api, profile) }, () => openProfileEditor(api, profile)) }} onCancel={() => openProfileMenu(api)} />)
}

function openProfileMenu(api) {
  api.ui.dialog.replace(() => <api.ui.DialogSelect title="Claudia · profiles" options={[{ title: "Apply profile", value: "apply" }, { title: "Create from current", value: "create" }, { title: "Edit profile models", value: "edit" }, { title: "Clone profile", value: "clone" }, { title: "Rename profile", value: "rename" }, { title: "Delete profile", value: "delete" }]} onSelect={(option) => {
    if (option.value === "apply") chooseProfile(api, "Apply Claudia profile", (profile) => applyProfile(api, profile))
    if (option.value === "create") promptProfileName(api, "Create Claudia profile", (name) => saveProfile(api, name, "Created from current Claudia assignments"), () => openProfileMenu(api))
    if (option.value === "edit") chooseProfile(api, "Edit Claudia profile", (profile) => openProfileEditor(api, profile), () => openProfileMenu(api))
    if (option.value === "clone") chooseProfile(api, "Clone source profile", (profile) => promptProfileName(api, `Clone ${profile.data.name} as`, (name) => saveProfile(api, name, `Clone of ${profile.data.name}`, profile), () => openProfileMenu(api)), () => openProfileMenu(api))
    if (option.value === "rename") chooseProfile(api, "Rename profile", (profile) => promptProfileName(api, `Rename ${profile.data.name} as`, (name) => { const clean = slug(name); if (clean) { profile.data.name = clean; const target = path.join(profilesDir, `claudia-${clean}.json`); fs.renameSync(profile.file, target); writeJson(target, profile.data); api.ui.toast({ title: "Profile renamed", message: clean, variant: "success" }) }; openProfileMenu(api) }, () => openProfileMenu(api)), () => openProfileMenu(api))
    if (option.value === "delete") chooseProfile(api, "Delete Claudia profile", (profile) => api.ui.dialog.replace(() => <api.ui.DialogConfirm title={`Delete ${profile.data.name}?`} message="This removes only the saved profile, not the current configuration." onConfirm={() => { fs.unlinkSync(profile.file); api.ui.toast({ title: "Profile deleted", message: profile.data.name, variant: "success" }); openProfileMenu(api) }} onCancel={() => openProfileMenu(api)} />), () => openProfileMenu(api))
  }} onCancel={() => openMainMenu(api)} />)
}

function openMainMenu(api) { api.ui.dialog.replace(() => <api.ui.DialogSelect title={`Claudia · ${currentProfileName()}`} options={[{ title: "Assign models", value: "assign", description: "Current model shown for each agent" }, { title: "Manage profiles", value: "profiles", description: "Create, apply, edit, clone, rename, or delete" }]} onSelect={(option) => option.value === "assign" ? openCurrentTargetPicker(api) : openProfileMenu(api)} onCancel={() => api.ui.dialog.clear()} />) }
const tui = async (api) => {
  const [activeProfile, setActiveProfile] = createSignal(currentProfileName())
  refreshIndicator = () => setActiveProfile(currentProfileName())
  const profileLabel = () => `ClaudIA · Perfil: ${activeProfile()}`
  const disposeSlots = api.slots.register({
    id: `${id}-indicator`,
    order: 90,
    slots: {
      home_footer() { return <text fg="#FFD400">{profileLabel()}</text> },
      sidebar_footer() { return <text fg="#FFD400">{profileLabel()}</text> }
    }
  })
  api.lifecycle.onDispose(() => { disposeSlots(); refreshIndicator = () => {} })
  const dispose = api.command?.register?.(() => [{ title: "Claudia: model and profile manager", value: "claudia", description: "Manage Claudia assignments and profiles", category: "Claudia", slash: { name: "claudia" }, onSelect: () => openMainMenu(api) }])
  if (dispose) api.lifecycle.onDispose(dispose)
}
export default { id, tui }
