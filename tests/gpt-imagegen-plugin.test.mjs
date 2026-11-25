import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const PLUGIN = "opencode-gpt-imagegen"

function setup(t, initial = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-gpt-plugin-"))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const configDir = path.join(home, ".config", "opencode")
  fs.mkdirSync(configDir, { recursive: true })
  const configPath = path.join(configDir, "opencode.json")
  fs.writeFileSync(configPath, JSON.stringify({ custom: true, ...initial }) + "\n")
  // Installers require an Engram binary; a stub is enough for config-only checks.
  const bin = path.join(home, ".local", "bin")
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, "engram"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  return { home, configPath }
}

function run(home) {
  return spawnSync(process.execPath, [path.join(root, "install-claudia-orchestration.mjs")], {
    encoding: "utf8",
    env: { ...process.env, HOME: home }
  })
}

const pluginId = (entry) => String(Array.isArray(entry) ? entry[0] : entry?.package || entry)
const countPlugin = (config) => config.plugins.filter((entry) => pluginId(entry).startsWith(PLUGIN)).length

test("installer adds opencode-gpt-imagegen once when absent", (t) => {
  const s = setup(t)
  const result = run(s.home)
  assert.equal(result.status, 0, result.stderr)
  const config = readJSON(s.configPath)
  assert.equal(countPlugin(config), 1)
  assert.ok(config.plugins.includes(PLUGIN), "plugin must be added as a plain string")
  // config.plugin (singular) is pre-existing installer behavior; it must never receive this plugin.
  assert.ok(!(config.plugin ?? []).some((entry) => pluginId(entry).startsWith(PLUGIN)), "plugin leaked into config.plugin")
})

test("existing object entry is kept intact and not duplicated", (t) => {
  const existing = { package: PLUGIN, options: { keep: true } }
  const s = setup(t, { plugins: [existing] })
  const result = run(s.home)
  assert.equal(result.status, 0, result.stderr)
  const config = readJSON(s.configPath)
  assert.equal(countPlugin(config), 1)
  assert.deepEqual(config.plugins.find((entry) => pluginId(entry).startsWith(PLUGIN)), existing)
})

test("reinstalling does not duplicate the plugin", (t) => {
  const s = setup(t)
  assert.equal(run(s.home).status, 0)
  assert.equal(run(s.home).status, 0)
  assert.equal(countPlugin(readJSON(s.configPath)), 1)
})
