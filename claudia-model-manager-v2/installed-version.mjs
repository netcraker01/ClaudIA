import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const semver = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function readInstalledVersion(home = os.homedir()) {
  try {
    const manifestPath = path.join(home, ".local", "share", "claudia", "active", "package-manifest.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    return typeof manifest.version === "string" && semver.test(manifest.version) ? manifest.version : undefined
  } catch {
    return undefined
  }
}
