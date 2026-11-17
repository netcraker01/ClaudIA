import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { readInstalledVersion } from "../claudia-model-manager-v2/installed-version.mjs"

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-version-test-"))
  const base = path.join(home, ".local", "share", "claudia")
  const versions = path.join(base, "versions")
  fs.mkdirSync(versions, { recursive: true })
  return {
    home,
    writeVersion(tag, contents = JSON.stringify({ version: tag })) {
      const dir = path.join(versions, tag)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, "package-manifest.json"), contents)
      return dir
    },
    activate(dir) {
      fs.symlinkSync(path.relative(base, dir), path.join(base, "active"), "dir")
    },
    cleanup() { fs.rmSync(home, { recursive: true, force: true }) },
  }
}

test("reads a valid installed version", () => {
  const f = fixture()
  try {
    f.activate(f.writeVersion("v0.1.4"))
    assert.equal(readInstalledVersion(f.home), "v0.1.4")
  } finally { f.cleanup() }
})

test("returns undefined for a missing manifest", () => {
  const f = fixture()
  try {
    f.activate(f.writeVersion("v0.1.4", "{}"))
    fs.unlinkSync(path.join(f.home, ".local", "share", "claudia", "active", "package-manifest.json"))
    assert.equal(readInstalledVersion(f.home), undefined)
  } finally { f.cleanup() }
})

test("returns undefined for malformed JSON or invalid versions", () => {
  const f = fixture()
  try {
    const dir = f.writeVersion("v0.1.4", "{")
    f.activate(dir)
    assert.equal(readInstalledVersion(f.home), undefined)
    fs.writeFileSync(path.join(dir, "package-manifest.json"), JSON.stringify({ version: "v01.1.4" }))
    assert.equal(readInstalledVersion(f.home), undefined)
  } finally { f.cleanup() }
})

test("follows active symlink switches between installed versions", () => {
  const f = fixture()
  try {
    const base = path.join(f.home, ".local", "share", "claudia")
    const first = f.writeVersion("v0.1.4")
    const second = f.writeVersion("v0.1.5")
    f.activate(first)
    assert.equal(readInstalledVersion(f.home), "v0.1.4")
    fs.renameSync(path.join(base, "active"), path.join(base, "active.old"))
    f.activate(second)
    assert.equal(readInstalledVersion(f.home), "v0.1.5")
  } finally { f.cleanup() }
})
