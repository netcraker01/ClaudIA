import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"))

function setup(t, cliConfig) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-image-preview-"))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const configDir = path.join(home, ".config", "opencode")
  fs.mkdirSync(configDir, { recursive: true })
  const configPath = path.join(configDir, "opencode.json")
  fs.writeFileSync(configPath, JSON.stringify({
    custom: true,
    mcp: { servers: { engram: { command: ["engram", "mcp"] } } }
  }) + "\n")
  const cliPath = path.join(configDir, "cli.json")
  if (cliConfig !== undefined) {
    fs.writeFileSync(cliPath, JSON.stringify(cliConfig) + "\n", { mode: 0o640 })
  }
  return { home, configDir, configPath, cliPath }
}

function install(s, installer) {
  return spawnSync(process.execPath, [path.join(root, installer)], {
    encoding: "utf8",
    env: { ...process.env, HOME: s.home }
  })
}

for (const installer of ["install-claudia-orchestration.mjs", "install-claudia-light.mjs"]) {
  test(`${installer}: creates CLI image previews on fresh install`, (t) => {
    const s = setup(t)
    const result = install(s, installer)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readJSON(s.cliPath).session.image_preview, true)
    assert.equal(fs.statSync(s.cliPath).mode & 0o777, 0o600)
    assert.equal(readJSON(s.configPath).custom, true)
    assert.equal(readJSON(s.configPath).session, undefined)
  })

  for (const preview of [undefined, false, true]) {
    test(`${installer}: preserves CLI preferences with image_preview=${preview}`, (t) => {
      const original = {
        plugins: ["./custom-plugin"],
        theme: { name: "custom" },
        prompt: { image_preview: false },
        session: { sidebar: "hide", thinking: "show", ...(preview === undefined ? {} : { image_preview: preview }) }
      }
      const s = setup(t, original)
      const before = fs.readFileSync(s.cliPath, "utf8")
      const result = install(s, installer)
      assert.equal(result.status, 0, result.stderr)
      const expected = structuredClone(original)
      expected.session.image_preview = true
      if (installer === "install-claudia-orchestration.mjs") expected.plugins.push("./claudia-model-manager")
      assert.deepEqual(readJSON(s.cliPath), expected)
      assert.equal(fs.statSync(s.cliPath).mode & 0o777, 0o640)
      const report = JSON.parse(result.stdout)
      assert.equal(fs.readFileSync(report.cliBackup, "utf8"), before)
      const first = fs.readFileSync(s.cliPath, "utf8")
      const repeated = install(s, installer)
      assert.equal(repeated.status, 0, repeated.stderr)
      assert.equal(fs.readFileSync(s.cliPath, "utf8"), first)
    })
  }

  test(`${installer}: rejects malformed CLI JSON before changing OpenCode config`, (t) => {
    const s = setup(t)
    fs.writeFileSync(s.cliPath, "{invalid")
    const before = fs.readFileSync(s.configPath, "utf8")
    const result = install(s, installer)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /SyntaxError/)
    assert.equal(fs.readFileSync(s.cliPath, "utf8"), "{invalid")
    assert.equal(fs.readFileSync(s.configPath, "utf8"), before)
  })
}
