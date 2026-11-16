import { Plugin } from "@opencode/plugin/tui"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createSignal } from "solid-js"

const configPath = path.join(os.homedir(), ".config", "opencode", "opencode.json")
const profilesDir = path.join(os.homedir(), ".config", "opencode", "profiles")
const prefix = "claudia-"
const assignment = (value: any) => {
  const raw = typeof value === "string" ? value : value?.model || ""
  const split = raw.lastIndexOf("#")
  const model = split > -1 ? raw.slice(0, split) : raw
  const variant = (typeof value === "object" && value?.variant) || (split > -1 ? raw.slice(split + 1) : "")
  return { model, ...(variant ? { variant } : {}) }
}
const configuredModel = (value: any) => `${assignment(value).model}${assignment(value).variant ? `#${assignment(value).variant}` : ""}`
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
const readConfig = () => JSON.parse(fs.readFileSync(configPath, "utf8"))
const writeJson = (file: string, data: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`) }
let refreshIndicator = () => {}

function listAgents() {
  const config = readConfig()
  return Object.entries(config.agents || {}).filter(([name, value]: [string, any]) => name.startsWith(prefix) && value?.mode === "subagent").map(([name, value]: [string, any]) => ({ name, config: value })).sort((a, b) => a.name.localeCompare(b.name))
}
function listProfiles() {
  if (!fs.existsSync(profilesDir)) return []
  return fs.readdirSync(profilesDir).filter((name) => name.startsWith(prefix) && name.endsWith(".json")).flatMap((name) => {
    const file = path.join(profilesDir, name)
    try { const data = JSON.parse(fs.readFileSync(file, "utf8")); data.agents ||= data.models || {}; return [{ file, data }] } catch { return [] }
  }).sort((a, b) => String(a.data.name || a.file).localeCompare(String(b.data.name || b.file)))
}
function identity(primary: any, agents: Record<string, any>) {
  return JSON.stringify({ primary: assignment(primary), agents: Object.fromEntries(listAgents().map(({ name }) => [name, assignment(agents?.[name])])) })
}
function activeProfile() {
  const config = readConfig(); const current = identity(config.agents?.claudia, config.agents || {})
  return listProfiles().find(({ data }) => identity(data.primary, data.agents || data.models || {}) === current)?.data.name || "Personalizado"
}
function models(ctx: any, current?: any) {
  const location = ctx.location || ctx.data.location.default()
  const currentAssignment = assignment(current)
  return (ctx.data.location.model.list(location) || []).map((model: any) => {
    const value = `${model.providerID}/${model.id}`
    const isCurrent = value === currentAssignment.model
    const variantInfo = isCurrent ? ` · current${currentAssignment.variant ? ` (${currentAssignment.variant})` : " (default)"}` : ""
    return { title: `${isCurrent ? "✓ " : ""}${value}`, value, description: `${model.name || model.providerID}${variantInfo}` }
  })
}
function variants(ctx: any, modelID: string) {
  const [providerID, ...rest] = modelID.split("/")
  const modelName = rest.join("/")
  const location = ctx.location || ctx.data.location.default()
  const providers = ctx.data.location.provider.list(location) || []
  const provider = providers.find((item: any) => item.id === providerID)
  return Object.keys(provider?.models?.[modelName]?.variants || {}).sort()
}
async function select(ctx: any, title: string, options: any[], placeholder?: string) {
  return await ctx.ui.dialog.select({ title, options, ...(placeholder ? { placeholder } : {}) })
}
async function chooseModel(ctx: any, title: string, current?: any) {
  const model = await select(ctx, title, models(ctx, current), "Search provider or model")
  if (!model) return
  const currentAssignment = assignment(current)
  const choices = [{ title: `Default model variant${!currentAssignment.variant ? " · current" : ""}`, value: "" }, ...variants(ctx, model).map((variant: string) => ({ title: `${variant}${variant === currentAssignment.variant ? " · current" : ""}`, value: variant }))]
  const variant = await select(ctx, `${title} · variant`, choices)
  if (variant === undefined) return
  return { model, ...(variant ? { variant } : {}) }
}
async function persist(ctx: any, config: any, message: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  fs.copyFileSync(configPath, `${configPath}.before-model-ui-${stamp}.bak`)
  writeJson(configPath, config)
  refreshIndicator()
  ctx.ui.toast.show({ title: "Claudia model manager", message: `${message} · OpenCode recargará la configuración guardada`, variant: "success" })
}
function assignmentLabel(value: any) {
  const current = assignment(value)
  return `${current.model || "Unassigned"}${current.variant ? ` · ${current.variant}` : ""}`
}
function sidebarSnapshot() {
  const config = readConfig()
  return {
    profile: activeProfile(),
    agents: listAgents().map(({ name, config: agent }) => ({
      name: name.replace(prefix, ""),
      model: assignmentLabel(agent.model),
    })),
  }
}
function profileSummary(data: any) {
  const agents = data.agents || data.models || {}
  return [`Claudia: ${assignmentLabel(data.primary)}`, ...listAgents().map(({ name }) => `${name.replace(prefix, "")}: ${assignmentLabel(agents[name])}`)].join(" · ")
}
async function assign(ctx: any) {
  const currentConfig = readConfig()
  const targets = [{ title: "claudia", value: "claudia", description: `Primary · ${assignmentLabel(currentConfig.agents?.claudia)}` }, ...listAgents().map(({ name, config }) => ({ title: name, value: name, description: `${assignmentLabel(config)} · ${config.description || "Subagent"}` }))]
  const target = await select(ctx, "Claudia · choose assignment", targets)
  if (!target) return
  const value = await chooseModel(ctx, `Assign model · ${target}`, readConfig().agents?.[target])
  if (!value) return
  const config = readConfig(); config.agents ||= {}; config.agents[target] ||= { mode: target === "claudia" ? "primary" : "subagent" }; config.agents[target].model = configuredModel(value)
  delete config.agents[target].variant
  await persist(ctx, config, `${target} → ${value.model}${value.variant ? ` · ${value.variant}` : ""}`)
  await assign(ctx)
}
async function profileMenu(ctx: any) {
  const action = await select(ctx, "Claudia · profiles", [
    { title: "Apply profile", value: "apply" }, { title: "Create from current", value: "create" },
    { title: "Edit profile models", value: "edit" }, { title: "Clone profile", value: "clone" },
    { title: "Rename profile", value: "rename" }, { title: "Delete profile", value: "delete" },
  ])
  if (!action) return mainMenu(ctx)
  if (action === "create") {
    const name = slug(await ctx.ui.dialog.prompt({ title: "Create Claudia profile", placeholder: "profile-name" }) || "")
    if (name) { const config = readConfig(); writeJson(path.join(profilesDir, `${prefix}${name}.json`), { name, description: "Created from current Claudia assignments", primary: assignment(config.agents?.claudia), agents: Object.fromEntries(listAgents().map(({ name: agentName }) => [agentName, assignment(config.agents?.[agentName])])) }); refreshIndicator(); ctx.ui.toast.show({ message: `Saved ${name}`, variant: "success" }) }
    return profileMenu(ctx)
  }
  const profiles = listProfiles()
  const selectedFile = await select(ctx, "Select Claudia profile", profiles.map(({ file, data }) => ({ title: `${data.name === activeProfile() ? "✓ " : ""}${data.name || path.basename(file, ".json")}`, value: file, description: profileSummary(data) })))
  const profile = profiles.find(({ file }) => file === selectedFile)
  if (!profile) return profileMenu(ctx)
  const data = profile.data; data.agents ||= data.models || {}
  if (action === "apply") {
    const config = readConfig(); config.agents ||= {}; config.agents.claudia ||= { mode: "primary" }; const primary = assignment(data.primary); config.agents.claudia.model = configuredModel(primary)
    delete config.agents.claudia.variant
    for (const [name, raw] of Object.entries(data.agents)) if (name.startsWith(prefix) && config.agents[name]) { const value = assignment(raw); config.agents[name].model = configuredModel(value); delete config.agents[name].variant }
    await persist(ctx, config, `Applied profile ${data.name}`); return profileMenu(ctx)
  }
  if (action === "delete") {
    const confirmed = await ctx.ui.dialog.confirm({ title: `Delete ${data.name}?`, message: "This removes only the saved profile, not the current configuration.", label: { confirm: "Delete", cancel: "Cancel" } })
    if (confirmed) { fs.unlinkSync(profile.file); refreshIndicator(); ctx.ui.toast.show({ message: `Deleted ${data.name}`, variant: "success" }) }
    return profileMenu(ctx)
  }
  if (action === "rename" || action === "clone") {
    const name = slug(await ctx.ui.dialog.prompt({ title: `${action === "clone" ? "Clone" : "Rename"} ${data.name}`, placeholder: "profile-name" }) || "")
    if (name) { const copy = action === "clone" ? JSON.parse(JSON.stringify(data)) : data; copy.name = name; if (action === "clone") copy.description = `Clone of ${data.name}`; const target = path.join(profilesDir, `${prefix}${name}.json`); if (action === "rename") fs.renameSync(profile.file, target); writeJson(target, copy); refreshIndicator(); ctx.ui.toast.show({ message: `${action === "clone" ? "Cloned" : "Renamed"} ${name}`, variant: "success" }) }
    return profileMenu(ctx)
  }
  if (action === "edit") {
    return editProfile(ctx, profile)
  }
  return profileMenu(ctx)
}
async function editProfile(ctx: any, profile: any) {
  const data = profile.data
  const targets = [{ title: "claudia", value: "claudia", description: assignmentLabel(data.primary) }, ...listAgents().map(({ name }) => ({ title: name, value: name, description: assignmentLabel(data.agents[name]) }))]
  const target = await select(ctx, `Edit profile · ${data.name}`, targets)
  if (!target) return profileMenu(ctx)
  const current = target === "claudia" ? data.primary : data.agents[target]
  const value = await chooseModel(ctx, `${data.name} · ${target}`, current)
  if (value) {
    if (target === "claudia") data.primary = value
    else data.agents[target] = value
    writeJson(profile.file, data)
    refreshIndicator()
    ctx.ui.toast.show({ title: "Profile updated", message: `${data.name} · ${target} → ${assignmentLabel(value)}`, variant: "success" })
  }
  return editProfile(ctx, profile)
}
async function mainMenu(ctx: any) {
  const action = await select(ctx, `Claudia · ${activeProfile()}`, [{ title: "Assign models", value: "assign", description: "Current model shown for each agent" }, { title: "Manage profiles", value: "profiles", description: "Apply, create, edit, clone, rename, or delete" }])
  if (action === "assign") return assign(ctx)
  if (action === "profiles") return profileMenu(ctx)
}

export default Plugin.define({
  id: "claudia.model-manager",
  setup(ctx) {
    const [profileLabel, setProfileLabel] = createSignal(`ClaudIA · Perfil: ${activeProfile()}`)
    const [sidebar, setSidebar] = createSignal(sidebarSnapshot())
    const [activityFrame, setActivityFrame] = createSignal(0)
    const [todosFrame, setTodosFrame] = createSignal(0)
    const todosCache = new Map<string, { frame: number; todos: any[] }>()
    const toolTodos = (part: any) => part?.type === "tool" && part?.name === "todowrite" && part?.state?.status === "completed" && Array.isArray(part?.state?.input?.todos) ? part.state.input.todos : undefined
    const refreshUI = () => {
      try {
        const snapshot = sidebarSnapshot()
        setProfileLabel(`ClaudIA · Perfil: ${snapshot.profile}`)
        setSidebar(snapshot)
      } catch {
        // Config may be briefly unreadable while OpenCode rewrites it.
      }
    }
    const activeChildren = (sessionID?: string) => {
      activityFrame()
      if (!sessionID) return []
      try {
        return (ctx.data.session.family(sessionID) || []).flatMap((childID: string) => {
          if (childID === sessionID) return []
          const child = ctx.data.session.get(childID)
          const status = ctx.data.session.status(childID)
          const state = typeof status === "string" ? status : status?.type
          if (!["active", "busy", "pending", "retry", "running", "streaming", "working"].includes(String(state).toLowerCase())) return []
          return [{ agent: child?.agent, id: childID }]
        })
      } catch {
        return []
      }
    }
    const sessionTodos = (sessionID?: string) => {
      const frame = todosFrame()
      if (!sessionID) return []
      const cached = todosCache.get(sessionID)
      if (cached?.frame === frame) return cached.todos
      try {
        const messages = ctx.data.session.message.list(sessionID) || []
        const revertMessageID = ctx.data.session.get(sessionID)?.revert?.messageID
        const revertIndex = revertMessageID ? messages.findIndex((message: any) => message.id === revertMessageID) : -1
        const relevantMessages = messages.slice(0, revertIndex === -1 ? messages.length : revertIndex)
        const calls = relevantMessages.flatMap((message: any) => message.content || []).map((part: any) => ({ part, todos: toolTodos(part) })).filter((call: any) => Array.isArray(call.todos))
        const last = calls.at(-1)
        const todos = last?.todos || []
        todosCache.set(sessionID, { frame, todos })
        return todos
      } catch {
        return []
      }
    }
    const taskProgress = (todos: any[]) => {
      const active = todos.filter((todo) => todo?.status !== "cancelled")
      if (!active.length) return { completed: 0, total: 0, percent: 0 }
      const completed = active.filter((todo) => todo?.status === "completed").length
      const percent = Math.round((completed / active.length) * 100)
      return { completed, total: active.length, percent }
    }
    const renderSidebar = (sessionID?: string) => {
      const current = sidebar()
      const running = activeChildren(sessionID)
      const progress = taskProgress(sessionTodos(sessionID))
      const scannerPosition = activityFrame() % 12
      const scannerCenter = scannerPosition <= 6 ? scannerPosition : 12 - scannerPosition
      const scanner = () => Array.from({ length: 7 }, (_, index) => {
        const distance = Math.abs(index - scannerCenter)
        const color = distance === 0 ? "brightRed" : distance === 1 ? "red" : "maroon"
        return <span style={{ fg: color }}>{distance === 0 ? "●" : distance === 1 ? "━" : "─"}</span>
      })
      const counts = new Map<string, number>()
      for (const task of running) if (task.agent) counts.set(task.agent, (counts.get(task.agent) || 0) + 1)
      return <box flexDirection="column" paddingTop={1}>
        <text><span style={{ fg: "#FFD400" }}>✦ </span><span style={{ fg: "#F2F4F8" }}>[[CLAUDIA AI-STACK]]</span></text>
        <text fg="#8995A6">PERFIL ACTIVO</text>
        <text><span style={{ fg: "green" }}>● </span><span style={{ fg: "brightYellow" }}>{current.profile}</span></text>
        {progress.total > 0 && <>
          <text><span style={{ fg: "brightGreen" }}>TAREA </span>{Array.from({ length: 12 }, (_, index) => <span style={{ fg: index < Math.round(progress.percent / 100 * 12) ? "brightGreen" : "green" }}>{index < Math.round(progress.percent / 100 * 12) ? "█" : "░"}</span>)}<span style={{ fg: "brightGreen" }}> {progress.percent}%</span></text>
          <text fg="#8995A6">{progress.completed} completadas · {Math.max(0, progress.total - progress.completed)} pendientes</text>
        </>}
        <text fg="#4B5665">────────────────────</text>
        <text><span style={{ fg: "magenta" }}>AGENTES</span><span style={{ fg: "#7F8A9A" }}>  {current.agents.length}</span>{running.length > 0 && <span style={{ fg: "brightBlue" }}>  ·  {running.length} EN MARCHA</span>}</text>
        {current.agents.map((agent) => {
          const count = counts.get(`claudia-${agent.name}`) || 0
          return <box flexDirection="column" paddingTop={1}>
            <text><span style={{ fg: count ? "brightBlue" : "#7F8A9A" }}>{count ? "◉ " : "▸ "}</span><span style={{ fg: count ? "brightBlue" : "#E7EAF0" }}>{agent.name}</span>{count > 0 && <><span>  </span>{scanner()}<span style={{ fg: "brightBlue" }}> ACTIVO{count > 1 ? ` ×${count}` : ""}</span></>}</text>
            <text><span style={{ fg: "#4B5665" }}>  └ </span><span style={{ fg: "#A8B2C1" }}>{agent.model}</span></text>
          </box>
        })}
      </box>
    }
    const stopEvents = ctx.data.listen(({ details }: any) => {
      const type = details?.type || ""
      if (!type.startsWith("session.") && !type.startsWith("message.") && !type.startsWith("tool.execute.")) return
      const eventData = details?.data || details?.properties || {}
      const info = eventData.info || eventData
      for (const id of [eventData.sessionID, eventData.session_id, info.sessionID, info.session_id, info.id, info.parentID]) {
        if (typeof id === "string") {
          try { ctx.data.session.invalidate(id) } catch {}
        }
      }
      setActivityFrame(activityFrame() + 1)
      setTodosFrame(todosFrame() + 1)
    })
    const activityTimer = setInterval(() => setActivityFrame(activityFrame() + 1), 130)
    refreshIndicator = refreshUI
    const watchers: fs.FSWatcher[] = []
    try {
      watchers.push(fs.watch(path.dirname(configPath), (_event, filename) => {
        if (!filename || filename.toString() === path.basename(configPath)) refreshUI()
      }))
      if (fs.existsSync(profilesDir)) watchers.push(fs.watch(profilesDir, refreshUI))
    } catch {
      // The manager still refreshes immediately after its own profile actions.
    }
    ctx.keymap.layer(() => ({ mode: "global", commands: [{ id: "claudia.model-manager.open", title: "Claudia: model and profile manager", group: "Claudia", palette: true, slash: { name: "claudia" }, run: () => mainMenu(ctx) }] }))
    ctx.ui.slot({ append: "home.footer.status", render: () => <text fg="#FFD400">{profileLabel()}</text> })
    ctx.ui.slot({ append: "sidebar.footer", render: () => <text fg="#FFD400">{profileLabel()}</text> })
    ctx.ui.slot({ append: "sidebar.content", render: ({ sessionID }: { sessionID?: string }) => renderSidebar(sessionID) })
    return () => {
      stopEvents()
      clearInterval(activityTimer)
      watchers.forEach((watcher) => watcher.close())
      refreshIndicator = () => {}
    }
  },
})
