import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"))

function setup(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-media-"))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const configDir = path.join(home, ".config", "opencode")
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, "opencode.json"), JSON.stringify({ custom: true }) + "\n")
  // Installers require an Engram binary; a stub is enough for config-only checks.
  const bin = path.join(home, ".local", "bin")
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, "engram"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  return { home, configDir, configPath: path.join(configDir, "opencode.json") }
}

function run(home, installer) {
  return spawnSync(process.execPath, [path.join(root, installer)], {
    encoding: "utf8",
    env: { ...process.env, HOME: home }
  })
}

// Same selection rule as claudia-model-manager-v2/tui.tsx listAgents().
const menuSubagents = (config) =>
  Object.entries(config.agents || {})
    .filter(([name, value]) => name.startsWith("claudia-") && value?.mode === "subagent")
    .map(([name]) => name)

test("orchestration installer adds claudia-media as a /claudia-selectable subagent", (t) => {
  const s = setup(t)
  const result = run(s.home, "install-claudia-orchestration.mjs")
  assert.equal(result.status, 0, result.stderr)
  const config = readJSON(s.configPath)
  const media = config.agents["claudia-media"]
  assert.ok(media, "claudia-media missing")
  assert.equal(media.mode, "subagent")
  assert.ok(typeof media.model === "string" && media.model.length > 0, "model must be assigned")
  assert.ok(menuSubagents(config).includes("claudia-media"), "not listed by /claudia menu filter")
  assert.ok(media.system.includes("INTAKE GATE"), "brief gate missing")
  assert.ok(media.system.includes("NEEDS_BRIEF"), "NEEDS_BRIEF status missing")
  assert.ok(media.system.includes("Video is not supported yet"), "video scope missing")
  assert.ok(media.system.includes("Do not delegate"), "media must not delegate")
  const claudiaSubagentRules = config.agents.claudia.permissions
    .filter((rule) => rule.action === "subagent")
  assert.ok(claudiaSubagentRules.some((rule) => rule.resource === "claudia-media" && rule.effect === "allow"))
})

test("claudia-media generates images only with gpt_imagegen", (t) => {
  const s = setup(t)
  const result = run(s.home, "install-claudia-orchestration.mjs")
  assert.equal(result.status, 0, result.stderr)
  const media = readJSON(s.configPath).agents["claudia-media"]
  assert.ok(media.system.includes("gpt_imagegen"), "gpt_imagegen missing from prompt")
  assert.ok(media.system.includes("Never use generate_image"), "generate_image not prohibited in prompt")
  assert.ok(
    media.permissions.some((rule) => rule.action === "gpt_imagegen" && rule.effect === "allow"),
    "gpt_imagegen allow permission missing"
  )
  assert.ok(
    media.permissions.some((rule) => rule.action === "generate_image" && rule.effect === "deny"),
    "generate_image deny permission missing"
  )
})

test("claudia-media keeps its model across reinstall (menu assignment is not overwritten)", (t) => {
  const s = setup(t)
  assert.equal(run(s.home, "install-claudia-orchestration.mjs").status, 0)
  const config = readJSON(s.configPath)
  config.agents["claudia-media"].model = "anthropic/claude-haiku-5-5#low"
  fs.writeFileSync(s.configPath, JSON.stringify(config, null, 2) + "\n")
  const result = run(s.home, "install-claudia-orchestration.mjs")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readJSON(s.configPath).agents["claudia-media"].model, "anthropic/claude-haiku-5-5#low")
})

test("claudia-light stays single-agent and does not gain claudia-media", (t) => {
  const s = setup(t)
  const result = run(s.home, "install-claudia-light.mjs")
  assert.equal(result.status, 0, result.stderr)
  const config = readJSON(s.configPath)
  assert.equal(config.agents["claudia-media"], undefined)
  assert.equal(
    Object.values(config.agents).filter((agent) => agent?.mode === "subagent").length,
    0,
    "claudia-light must not define subagents"
  )
})

test("every canonical profile assigns a model to claudia-media", () => {
  const dir = path.join(root, "profiles")
  for (const file of fs.readdirSync(dir).filter((name) => /^claudia-.*\.json$/.test(name))) {
    const profile = readJSON(path.join(dir, file))
    assert.ok(profile.agents?.["claudia-media"]?.model, `${file} lacks claudia-media model`)
  }
})
