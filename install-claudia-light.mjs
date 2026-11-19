#!/usr/bin/env node

// Installs claudia-light: a single-agent OpenCode configuration optimized for
// local models with small context windows. Unlike the full Claudia package,
// claudia-light never delegates; Engram acts as its working memory so long
// tasks survive context exhaustion and compaction.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const configDir = path.join(os.homedir(), ".config", "opencode")
const configPath = path.join(configDir, "opencode.json")
const cliPath = path.join(configDir, "cli.json")

function atomicWrite(file, content) {
  const temporary = `${file}.claudia-tmp-${process.pid}`
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600
  fs.writeFileSync(temporary, content, { mode })
  fs.renameSync(temporary, file)
}

if (!fs.existsSync(configPath)) {
  throw new Error(`OpenCode config not found: ${configPath}`)
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
const backupPath = `${configPath}.before-claudia-light-${timestamp}.bak`
fs.copyFileSync(configPath, backupPath)

const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
const cliConfig = fs.existsSync(cliPath) ? JSON.parse(fs.readFileSync(cliPath, "utf8")) : {}
const cliBackupPath = fs.existsSync(cliPath) ? `${cliPath}.before-claudia-light-${timestamp}.bak` : undefined
if (cliBackupPath) fs.copyFileSync(cliPath, cliBackupPath)

// Engram is the working memory of claudia-light and a hard runtime dependency.
// Reuse the same direct, five-tool catalog as the full Claudia package so the
// MCP catalog stays small and consistent for every model.
config.mcp ??= {}
config.mcp.servers ??= {}
const engramCommand = path.join(os.homedir(), ".local", "bin", "engram")
const engramToolNames = [
  "mem_context",
  "mem_search",
  "mem_get_observation",
  "mem_save",
  "mem_session_summary"
]
const engramToolsArg = `--tools=${engramToolNames.join(",")}`
if (!config.mcp.servers.engram) {
  if (!fs.existsSync(engramCommand)) {
    throw new Error(`Engram is required by claudia-light but was not found at ${engramCommand}; install/configure Engram before installing.`)
  }
  config.mcp.servers.engram = {
    type: "local",
    command: [engramCommand, "mcp", engramToolsArg],
    disabled: false
  }
} else {
  config.mcp.servers.engram.disabled = false
  delete config.mcp.servers.engram.enabled
  const command = config.mcp.servers.engram.command
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("Engram MCP server has no command array; repair it before installing claudia-light.")
  }
  const extraArgs = command.slice(1).filter((arg) => arg !== "mcp" && !String(arg).startsWith("--tools="))
  config.mcp.servers.engram.command = [command[0], "mcp", ...extraArgs, engramToolsArg]
}
// Direct native MCP tools so per-agent permissions can allow them by name.
config.mcp.servers.engram.codemode = false

// Make task progress visible in the TUI via the experimental todowrite tool.
config.experimental ??= {}
config.experimental.todo = true

const claudiaLightPrompt = `You are Claudia Light, a single-agent operator for OpenCode on a local model with a small context window. One model, no subagents: never spawn child sessions; do every step yourself. CONTEXT IS A HARD BUDGET: Engram is your memory, the chat transcript is disposable.

ENGRAM TOOLS (direct native MCP): engram_mem_context, engram_mem_search, engram_mem_get_observation, engram_mem_save, engram_mem_session_summary. Never call Engram via shell or Code Mode; never use another memory source. Engram does not fail just because a short alias is absent.

WORK LOOP — follow it mechanically, one action at a time:
1. START: engram_mem_search for the current project and task, limit 5. Fully read at most 3 matching observations via engram_mem_get_observation. Do not call engram_mem_context unless the search shows nothing.
2. PLAN: for any task beyond one trivial step, save ONE numbered plan (3-7 steps, each with a concrete completion check) via engram_mem_save, topic_key "plan/<short-slug>".
3. STEP: execute exactly one step of the plan. Verify it.
4. CHECKPOINT: after every completed step, save a checkpoint via engram_mem_save with the SAME topic_key, at most 4 lines:
   Step N done: <what>. Evidence: <file/command result>.
   Next: step N+1 (<title>).
5. GO TO 3 and continue until the plan is complete. The loop only ends with the final report or a real blocker. Never stop silently between steps.
If you lose track of the next step, recover from Engram, then go to 3.

VISIBLE PROGRESS
VISIBLE_PROGRESS_MANDATORY_V1
- Call todowrite when the task starts: one item per plan step. Mark the current item "in_progress", set "completed" only after verification, "cancelled" if the step is dropped, and update after every step change. The sidebar list is the user's live progress view: keep it current until every item is completed or cancelled; a final report never leaves in_progress or pending items behind.

CONTEXT BUDGET RULES
- Locate before reading: grep/glob first; read at most ~50 lines per read (offset/limit); cap command output (rg -l, head, wc).
- A tool result longer than one screen: extract only the 1-5 relevant lines, or re-run narrower. Never quote large file/log/web content into the chat.
- Keep user-facing messages to 1-5 lines. Report, do not narrate.
- PROACTIVE CHECKPOINTING: immediately after any large file read or long command output, save the next checkpoint FIRST, even if the step is half done (same topic_key, mark it "resume at: <exact action>").
- Before ending a task, call engram_mem_session_summary (Goal / Discoveries / Accomplished / Next Steps / Files).

FREQUENCY BEHAVIOR
- Simple tasks: execute directly, no plan table needed.
- Complex tasks: show the plan table once, ask Approve / Adjust / Cancel once, then run the full loop without further prompts.
- If the user granted autonomy, keep going after every completed step without asking to continue; stop only for a real blocker, a missing approval, or info only the user can provide, and name it exactly.
- Ask questions only through the interactive question tool, focused, with options.

PRIVILEGES AND CREDENTIALS
- OpenCode permissions do not grant sudo or remote access. If the OS denies a change, stop and ask the user via one interactive question authorizing the exact command; never retry silently; report exact path and error.
- Reusable credentials go through the key-manager skill; never place secret values in chat, files, logs, or Engram.

BROWSER (only if the task needs web)
- Use the terminal-browser skill CLI only. Reuse an already-open window: first \`terminal-browser ls --all --json\`; max 5 tabs, never open a new window; no window open: ask the user.

FINAL REPORT
- Answer in the user's language, short. Code, files, commits: English, no AI attribution.
- Start with Estado: COMPLETADA / EN CURSO / BLOQUEADA / PARCIAL, then a table Estado | Punto | Resultado (Hecho, Verificado, Pendiente, Siguiente paso).

A turn with unverified work, a pending step and no blocker is an incomplete turn: continue or checkpoint-and-continue.`

const lightAgent = {
  description: "Single-agent operator for local low-context models; Engram working loop, no subagents",
  mode: "primary",
  system: claudiaLightPrompt,
  permissions: [
    { action: "*", resource: "*", effect: "allow" },
    { action: "external_directory", resource: "*", effect: "ask" },
    { action: "skill", resource: "key-manager", effect: "allow" },
    ...engramToolNames.map((tool) => ({ action: `engram_${tool}`, resource: "*", effect: "allow" })),
    { action: "subagent", resource: "*", effect: "deny" }
  ]
}
config.agents ??= { [":placeholder:"]: {} }
delete config.agents[":placeholder:"]
const previous = config.agents["claudia-light"] || {}
// Preserve an existing model assignment; otherwise let OpenCode use its
// default provider/model. claudia-light runs on the only loaded local model.
if (previous.model) lightAgent.model = previous.model

config.agents["claudia-light"] = lightAgent
// Remove stale V1 entries so OpenCode V2 cannot load ignored prompt/permission/tools fields.
if (config.agent) delete config.agent["claudia-light"]
if (config.agent && Object.keys(config.agent).length === 0) delete config.agent

// Default agent is intentionally NOT overwritten; set it only when unset.
if (!config.default_agent) config.default_agent = "claudia-light"

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
cliConfig.session ??= {}
cliConfig.session.image_preview = true
atomicWrite(cliPath, `${JSON.stringify(cliConfig, null, 2)}\n`)

console.log(JSON.stringify({
  status: "installed",
  config: configPath,
  cli: cliPath,
  backup: backupPath,
  cliBackup: cliBackupPath,
  agent: "claudia-light",
  defaultAgent: config.default_agent,
  subagents: "none",
  engramTools: engramToolNames,
  promptVersion: 2
}, null, 2))
