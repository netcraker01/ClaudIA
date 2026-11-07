#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const configPath = path.join(os.homedir(), ".config", "opencode", "opencode.json")
if (!fs.existsSync(configPath)) throw new Error(`OpenCode config not found: ${configPath}`)

const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
const plugin = "@ex-machina/opencode-anthropic-auth@next"
config.plugins = Array.isArray(config.plugins) ? config.plugins : []
config.plugins = config.plugins.filter((entry) => {
  const id = String(Array.isArray(entry) ? entry[0] : entry?.package || entry)
  return !id.startsWith("@ex-machina/opencode-anthropic-auth")
})
config.plugins.push(plugin)

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const backupPath = `${configPath}.before-anthropic-auth-${stamp}.bak`
fs.copyFileSync(configPath, backupPath)
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

console.log(JSON.stringify({ status: "configured", plugin, config: configPath, backup: backupPath }, null, 2))
