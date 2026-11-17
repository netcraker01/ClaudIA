#!/usr/bin/env node

// Repair Engram and Key Manager access for the Claudia OpenCode V2 agents.
// Run this as the same OS user that runs OpenCode.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const configPath = path.join(os.homedir(), ".config", "opencode", "opencode.json")
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const keyManagerSource = path.join(packageDir, "skills", "key-manager")
const keyManagerTarget = path.join(os.homedir(), ".config", "opencode", "skills", "key-manager")
const keyManagerFiles = ["SKILL.md", "README.md", "key-manager.py"]
const requiredAgents = [
  "claudia",
  "claudia-simple",
  "claudia-explorer",
  "claudia-code",
  "claudia-system",
  "claudia-browser",
  "claudia-reviewer"
]
const requiredTools = [
  "mem_context",
  "mem_search",
  "mem_get_observation",
  "mem_save",
  "mem_session_summary"
]
// Keep this marker distinct from the older heading embedded in Claudia's
// prompt. That heading caused the previous repair to mistake a label for the
// full recovery protocol and skip installing it.
const recoveryMarker = "ENGRAM_SUBAGENT_RECOVERY_RULES_V4"
const projectResolutionMarker = "ENGRAM_PROJECT_RESOLUTION_V1"
const directToolsMarker = "ENGRAM_DIRECT_MCP_TOOLS_V1"
const projectResolutionProtocol = `${projectResolutionMarker}

Engram project ambiguity handling:
- OpenCode exposes direct MCP tools as engram_mem_context, engram_mem_search, engram_mem_get_observation, engram_mem_save, and engram_mem_session_summary. If another Engram/plugin instruction abbreviates them as mem_context or mem_search, use the matching engram_mem_* tool; an absent unprefixed alias is not an outage.
- If engram_mem_context or engram_mem_search returns multiple possible projects or says the project is ambiguous, Engram responded successfully; this is a project-selection issue, not an MCP outage. Never report the service/tool as unavailable for this response.
- Infer the project only when the active workspace and task identify it unambiguously. Otherwise Claudia must ask the user with the interactive question tool, offering the exact project names returned by Engram. Wait for the selection, then repeat engram_mem_context and engram_mem_search with that project before autonomy questions, planning, delegation, or task work.
- A subagent that gets this ambiguity returns NEEDS_PROJECT with the exact choices to Claudia. Claudia resolves it with the user and starts a fresh bounded assignment including the selected project. Do not guess or continue task work.`
const directToolsProtocol = `${directToolsMarker}

Engram direct MCP tool discovery:
- Engram is configured with codemode=false, so its tools are exposed as direct native MCP tools, not through the Code Mode/execute catalog.
- Never use the Code Mode catalog to decide whether Engram is available. Invoke engram_mem_context and engram_mem_search directly from the subagent's normal tool list.
- Only a missing direct tool in that native list or an actual direct invocation error counts as unavailable. An omitted Code Mode entry is not an error.`
const keyManagerMarker = "KEY_MANAGER_SUBAGENT_V1"
const privilegeMarker = "PRIVILEGE_REQUEST_V1"
const privilegeProtocol = `${privilegeMarker}

OS and external-path permission handling:
- OpenCode tool access does not grant Linux ownership, sudo, or remote-host privileges. If an OS permission or external path blocks the requested action, never loop or leave a generic BLOCKED message.
- A subagent returns NEEDS_PRIVILEGE with the exact resource/path, system error, and smallest proposed command. Claudia asks the user through the interactive question tool before using sudo or retrying with elevated privileges. Never run sudo silently.`
const keyManagerProtocol = `${keyManagerMarker}

Key Manager access and credential handoff (mandatory for every agent):
- Before a credential-dependent SSH, API, n8n, browser, server, or service action, load the \`key-manager\` skill through the native skill tool and use its metadata-only \`list\` operation. Do not assume a parent or earlier session completed the lookup.
- The agent that actually makes the connection must retrieve a matching credential with Key Manager \`get\` in its own trusted consumer flow and route it directly to the command or client that needs it. Never put a resolved secret in a prompt, delegation, handoff, terminal output, logs, URL, file, or Engram.
- Parent agents pass only the credential reference/name and non-secret task details. They never pass a resolved secret to a child.
- If the skill is unavailable or there is no matching entry, report the exact missing skill/credential reference and stop before connecting. Ask the parent to offer the local Key Manager \`--secret-stdin\` flow; never request or accept the secret in chat and never claim a lookup succeeded when it did not.`
const recoveryProtocol = `${recoveryMarker}

Engram subagent recovery (this rule overrides any earlier instruction that forbids repairing access):
- A report that tools are missing is not proof, and a global MCP connection does not prove child access. A Code Mode/execute catalog omission is not evidence either because Engram uses codemode=false and direct native MCP tools. Immediately launch one fresh, read-only probe with that same subagent, instructing it to directly call engram_mem_context and engram_mem_search. Do not wait for the user to ask again.
- If both direct calls succeed, tell the user briefly that access is confirmed and resume the original approved plan immediately. Do not repeat the original delegation just to test access.
- If a direct call fails, inspect only the active Engram MCP command/catalog, that child's exact permissions, and relevant OpenCode errors. Fix a concrete configuration fault if found, then make at most one final fresh probe with the same child. If it still fails, or no concrete fault can be fixed, report BLOCKED with the exact tool and actual error plus the needed corrective action.
- After a failed child probe, do not try another subagent as a fallback and do not continue the task from Claudia. Engram lookup by each child is mandatory; a parent lookup cannot substitute for it. Do not ask the user to say "continue" or repeat the request to bypass this requirement.
- Never treat an absent unprefixed alias, an ambiguous project response, or a model's unsupported claim as a connection failure. Never substitute Claudia's own Engram call for the required child probe, use another memory source, or call Engram via shell/Code Mode.
- Subagents must still perform their own Engram lookup before task work. They must report an actual direct-tool failure, not assume tools are missing because an unprefixed alias is absent, and must never substitute another memory source or call Engram through Bash/Code Mode.`

if (!fs.existsSync(configPath)) throw new Error(`OpenCode config not found: ${configPath}`)
for (const file of keyManagerFiles) {
  if (!fs.existsSync(path.join(keyManagerSource, file))) {
    throw new Error(`Key Manager package file not found: ${path.join(keyManagerSource, file)}; no changes were made.`)
  }
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
const agents = config.agents
if (!agents || requiredAgents.some((name) => !agents[name])) {
  throw new Error("Expected all seven Claudia V2 agents in config.agents; no changes were made.")
}
config.mcp ??= {}
config.mcp.servers ??= {}
const server = config.mcp.servers.engram
if (!server || !Array.isArray(server.command) || !server.command.length) {
  throw new Error("Engram MCP server or its command array is missing; no changes were made.")
}

const toolArg = `--tools=${requiredTools.join(",")}`
const extraArgs = server.command.slice(1).filter((arg) => arg !== "mcp" && !String(arg).startsWith("--tools="))
server.command = [server.command[0], "mcp", ...extraArgs, toolArg]
server.disabled = false
delete server.enabled
server.codemode = false

// Show task progress in the TUI for existing installs: enable the
// experimental todowrite tool.
config.experimental ??= {}
config.experimental.todo = true

for (const name of requiredAgents) {
  const agent = agents[name]
  agent.permissions ??= []
  agent.permissions = agent.permissions.filter((rule) => !(rule.action === "external_directory" && rule.resource === "*"))
  agent.permissions.push({ action: "external_directory", resource: "*", effect: "ask" })
  for (const tool of requiredTools) {
    const action = `engram_${tool}`
    if (!agent.permissions.some((rule) => rule.action === action && rule.resource === "*" && rule.effect === "allow")) {
      agent.permissions.push({ action, resource: "*", effect: "allow" })
    }
  }
  if (!agent.permissions.some((rule) => rule.action === "skill" && rule.resource === "key-manager" && rule.effect === "allow")) {
    agent.permissions.push({ action: "skill", resource: "key-manager", effect: "allow" })
  }
  const currentSystem = agent.system ?? ""
  if (!currentSystem.includes(keyManagerMarker)) {
    agent.system = `${currentSystem}\n\n${keyManagerProtocol}`.trim()
  }
  const updatedSystem = agent.system ?? ""
  if (!updatedSystem.includes(projectResolutionMarker)) {
    agent.system = `${updatedSystem}\n\n${projectResolutionProtocol}`.trim()
  }
  const systemWithProjectResolution = agent.system ?? ""
  if (!systemWithProjectResolution.includes(privilegeMarker)) {
    agent.system = `${systemWithProjectResolution}\n\n${privilegeProtocol}`.trim()
  }
  const systemWithPrivilege = agent.system ?? ""
  if (!systemWithPrivilege.includes(directToolsMarker)) {
    agent.system = `${systemWithPrivilege}\n\n${directToolsProtocol}`.trim()
  }
}
const claudiaSystem = agents.claudia.system ?? ""
if (!claudiaSystem.includes(recoveryMarker)) {
  agents.claudia.system = `${claudiaSystem}\n\n${recoveryProtocol}`.trim()
}
const todoMarker = "VISIBLE_PROGRESS_MANDATORY_V1"
const todoProtocol = `${todoMarker}

Visible task progress (mandatory for the orchestrator):
- OpenCode exposes the todowrite tool. As soon as a task has more than one step, create the full task list with todowrite before any execution: one granular item per plan step, one item per delegation to each subagent, and one item for final verification. This list is the user's only live view of progress, so it must never go stale.
- While working: exactly one item in_progress (the one being delegated or executed). After each subagent handoff, verification, or intermediate finding, update the list immediately. Mark completed only with verification evidence; cancelled only for items you will genuinely not do; never delete or renumber items silently.
- Subagents run in separate sessions and cannot update your list: map every handoff result to a list update yourself. All items must be completed or cancelled before the final report; a finished task never leaves in_progress or pending items behind.`
const claudiaSystemWithRecovery = agents.claudia.system ?? ""
if (!claudiaSystemWithRecovery.includes(todoMarker)) {
  agents.claudia.system = `${claudiaSystemWithRecovery}\n\n${todoProtocol}`.trim()
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const backupPath = `${configPath}.before-claudia-engram-repair-${stamp}.bak`
fs.copyFileSync(configPath, backupPath)
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
fs.mkdirSync(keyManagerTarget, { recursive: true })
const updatedKeyManagerFiles = []
for (const file of keyManagerFiles) {
  const source = path.join(keyManagerSource, file)
  const target = path.join(keyManagerTarget, file)
  if (fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(source))) continue
  if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.before-claudia-repair-${stamp}.bak`)
  fs.copyFileSync(source, target)
  if (file === "key-manager.py") fs.chmodSync(target, 0o755)
  updatedKeyManagerFiles.push(file)
}

console.log(JSON.stringify({
  status: "repaired",
  config: configPath,
  backup: backupPath,
  serverTools: requiredTools,
  agents: requiredAgents,
  keyManagerUpdatedFiles: updatedKeyManagerFiles,
  next: "Fully quit and restart OpenCode, then create a new Claudia session."
}, null, 2))
