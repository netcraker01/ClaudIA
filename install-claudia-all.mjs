#!/usr/bin/env node
// Restaura ClaudIA completo en un equipo nuevo: Engram, terminal-browser,
// Key Manager, orquestador Claudia y claudia-light.
// No copia credenciales, memoria de Engram ni auth de proveedores.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline/promises"
import { packageManagerHint } from "./lib/distro-hint.mjs"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const home = os.homedir()
const binDir = path.join(home, ".local", "bin")
const configDir = path.join(home, ".config", "opencode")
const configPath = path.join(configDir, "opencode.json")
const keyManagerSkillDir = path.join(configDir, "skills", "key-manager")
const keyManagerScript = path.join(keyManagerSkillDir, "key-manager.py")
const storeKeyPath = path.join(home, ".local", "share", "key-manager", ".local-key")
const engramVersion = "3.7.2"
const engramBase = `https://github.com/Gentleman-Programming/engram/releases/download/v${engramVersion}`
const terminalBrowserInstallUrl = "https://terminal-browser.sh/install"
function atomicConfigWrite(file, content) {
  const temporary = `${file}.claudia-tmp-${process.pid}`
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600
  fs.writeFileSync(temporary, content, { mode })
  fs.renameSync(temporary, file)
}

const argv = process.argv.slice(2)
const check = argv.includes("--check")
const skipEngram = argv.includes("--skip-engram")
const skipTerminalBrowser = argv.includes("--skip-terminal-browser")
const restoreIdx = argv.indexOf("--restore-credentials")
const restoreFile = restoreIdx >= 0 ? argv[restoreIdx + 1] : null
const urlIdx = argv.indexOf("--local-llm-url")
const localUrlArg = urlIdx >= 0 ? argv[urlIdx + 1] : null

const log = {
  ok: (msg) => console.log(`[ok]   ${msg}`),
  skip: (msg) => console.log(`[skip] ${msg}`),
  warn: (msg) => console.log(`[warn] ${msg}`),
}

function usage() {
  console.log(`Uso: node install-claudia-all.mjs [opciones]

  --check                      solo verifica dependencias e instalación, sin cambios
  --restore-credentials FILE   restaura un bundle cifrado de key-manager (pide passphrase)
  --skip-engram                no instala engram (debe existir ya)
  --skip-terminal-browser      no instala terminal-browser
  --local-llm-url URL          registra un servidor local de IA (llama.cpp, OpenAI-compatible)
                               sin preguntar; sin esta opción y en terminal, se pregunta
`)
}

if (argv.includes("-h") || argv.includes("--help")) {
  usage()
  process.exit(0)
}
if (restoreIdx >= 0 && !restoreFile) throw new Error("--restore-credentials requiere la ruta del bundle")
if (urlIdx >= 0 && !localUrlArg) throw new Error("--local-llm-url requiere la URL base")

function has(cmd) {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0
}

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts })
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex")
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function tmpBase() {
  return fs.existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir()
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) throw new Error(`descarga fallida (${res.status}): ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function versionOf(bin) {
  const r = run(bin, ["--version"])
  return (r.stdout || "").trim() || "versión desconocida"
}

function preflight() {
  const required = [["python3", "python3"], ["gpg", "gnupg"], ["tar", "tar"]]
  const missing = required.filter(([cmd]) => !has(cmd))
  if (missing.length) {
    const pkgs = missing.map(([, pkg]) => pkg).join(" ")
    const hint = packageManagerHint()
    const command = hint?.endsWith("sudo apt install") ? `${hint} ${pkgs}` : hint || "instala manualmente los paquetes requeridos"
    throw new Error(`faltan dependencias: ${missing.map(([c]) => c).join(", ")}. ${command}`)
  }
  log.ok("dependencias presentes: python3, gpg, tar")
  if (!has("opencode")) log.warn("opencode no está en PATH; instálalo antes de usar Claudia")
}

async function ensureEngram() {
  const target = path.join(binDir, "engram")
  if (fs.existsSync(target)) return log.skip(`engram ya instalado: ${versionOf(target)}`)
  if (process.platform !== "linux") {
    throw new Error("instala engram manualmente: brew install gentleman-programming/tap/engram")
  }
  const arch = { x64: "amd64", arm64: "arm64" }[process.arch]
  if (!arch) throw new Error(`arquitectura no soportada: ${process.arch}`)

  const asset = `engram_${engramVersion}_linux_${arch}.tar.gz`
  const sums = (await download(`${engramBase}/checksums.txt`)).toString("utf8")
  const entry = sums.split("\n").map((l) => l.trim().split(/\s+/)).find(([, name]) => name === asset)
  if (!entry) throw new Error(`checksums.txt no contiene ${asset}`)
  const expected = entry[0]

  const tarball = await download(`${engramBase}/${asset}`)
  if (sha256(tarball) !== expected) throw new Error(`checksum de ${asset} no coincide; no se instala`)

  const tmp = fs.mkdtempSync(path.join(tmpBase(), "engram-"))
  try {
    const tarPath = path.join(tmp, asset)
    fs.writeFileSync(tarPath, tarball)
    const r = run("tar", ["-xzf", tarPath, "-C", tmp], { stdio: "ignore" })
    if (r.status !== 0) throw new Error("no se pudo extraer el archivo de engram")
    const bin = path.join(tmp, "engram")
    if (!fs.existsSync(bin)) throw new Error("el archivo de engram no contiene el binario engram")
    fs.mkdirSync(binDir, { recursive: true })
    fs.copyFileSync(bin, target)
    fs.chmodSync(target, 0o755)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  log.ok(`engram ${engramVersion} instalado en ${target} (sha256 verificado)`)
}

async function ensureTerminalBrowser() {
  if (skipTerminalBrowser) return log.skip("terminal-browser omitido (--skip-terminal-browser)")
  if (has("terminal-browser") || fs.existsSync(path.join(binDir, "terminal-browser"))) {
    return log.skip("terminal-browser ya instalado")
  }
  const script = await download(terminalBrowserInstallUrl)
  const tmpScript = path.join(tmpBase(), `tb-install-${process.pid}.sh`)
  fs.writeFileSync(tmpScript, script, { mode: 0o700 })
  log.ok(`ejecutando el instalador oficial de terminal-browser (${terminalBrowserInstallUrl}, sha256 ${sha256(script).slice(0, 12)})`)
  try {
    const r = run("sh", [tmpScript], { stdio: "inherit" })
    if (r.status !== 0) throw new Error("el instalador de terminal-browser falló")
  } finally {
    fs.rmSync(tmpScript, { force: true })
  }
  if (!fs.existsSync(path.join(binDir, "terminal-browser")) && !has("terminal-browser")) {
    log.warn("terminal-browser no aparece en PATH tras instalar; revisa ~/.local/bin")
  } else {
    log.ok("terminal-browser instalado")
  }
}

function py(argList, input) {
  const r = run("python3", [keyManagerScript, ...argList], { input })
  if (r.status !== 0) {
    const lastLine = (r.stderr || "").trim().split("\n").pop()
    throw new Error(`key-manager ${argList[0]} falló: ${lastLine}`)
  }
  return r.stdout
}

function readPassphrase() {
  const r = run("sh", ["-c",
    'trap "stty echo </dev/tty 2>/dev/null" EXIT; printf "Passphrase del bundle de key-manager: " >&2; stty -echo </dev/tty; IFS= read -r p </dev/tty; stty echo </dev/tty; echo >&2; printf "%s" "$p"',
  ], { stdio: ["ignore", "pipe", "inherit"] })
  if (r.status !== 0 || !r.stdout) throw new Error("no se pudo leer la passphrase; ejecuta el comando en un terminal interactivo")
  return r.stdout
}

function ensureKeyManager() {
  const src = path.join(packageDir, "skills", "key-manager")
  const ownedFiles = ["SKILL.md", "README.md", "COMMANDS.md", "key-manager.py"]
  for (const file of ownedFiles) {
    if (!fs.existsSync(path.join(src, file))) throw new Error(`falta skills/key-manager/${file} en el paquete`)
  }
  fs.mkdirSync(path.dirname(keyManagerSkillDir), { recursive: true })
  if (fs.existsSync(keyManagerSkillDir) && fs.lstatSync(keyManagerSkillDir).isSymbolicLink()) {
    throw new Error(`no se reemplaza un directorio key-manager que sea enlace simbólico: ${keyManagerSkillDir}`)
  }
  const backupDir = path.join(configDir, "backups", `key-manager-${stamp()}`)
  for (const file of ownedFiles) {
    const target = path.join(keyManagerSkillDir, file)
    const source = path.join(src, file)
    if (fs.existsSync(target)) {
      const stat = fs.lstatSync(target)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`no se reemplaza archivo key-manager no regular: ${target}`)
      fs.mkdirSync(backupDir, { recursive: true })
      fs.copyFileSync(target, path.join(backupDir, file), fs.constants.COPYFILE_EXCL)
    }
    fs.mkdirSync(keyManagerSkillDir, { recursive: true })
    const tmp = `${target}.tmp-${process.pid}`
    fs.copyFileSync(source, tmp)
    fs.renameSync(tmp, target)
  }
  fs.chmodSync(keyManagerScript, 0o755)
  if (fs.existsSync(backupDir)) log.ok(`copias previas por fichero en ${backupDir}`)
  log.ok(`archivos administrados de key-manager fusionados en ${keyManagerSkillDir}; datos/store preservados`)

  // restore refuses an existing store (.local-key present), so it must run before init.
  if (restoreFile) {
    const bundle = path.resolve(restoreFile)
    if (!fs.existsSync(bundle)) throw new Error(`bundle no encontrado: ${bundle}`)
    if (fs.existsSync(storeKeyPath)) {
      throw new Error(`el store de key-manager ya existe en ${path.dirname(storeKeyPath)}; no se sobrescribe automáticamente. Usa key-manager restore --replace manualmente si es intencionado`)
    }
    const passphrase = readPassphrase()
    py(["restore", "--from", bundle, "--passphrase-stdin"], `${passphrase}\n`)
    log.ok("credenciales restauradas desde el bundle cifrado")
  }

  py(["init"])
  log.ok("store de key-manager inicializado (idempotente)")

  const count = JSON.parse(py(["list"]) || "[]").length
  log.ok(`key-manager operativo: ${count} credenciales`)
}

function ensureConfig() {
  if (fs.existsSync(configPath)) return log.skip(`configuración existente: ${configPath}`)
  fs.mkdirSync(configDir, { recursive: true })
  atomicConfigWrite(configPath, `${JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { servers: {} } }, null, 2)}\n`)
  log.ok("opencode.json creado (no existía)")
}

function runInstaller(name) {
  const r = run("node", [path.join(packageDir, name)])
  if (r.status !== 0) {
    const tail = ((r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" | "))
    throw new Error(`${name} falló: ${tail}`)
  }
  log.ok(`${name} aplicado`)
}

function verify() {
  const problems = []
  let cfg = null
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8"))
  } catch (err) {
    problems.push(`opencode.json no es JSON válido o no existe: ${err.message}`)
  }
  if (cfg) {
    const agents = { ...(cfg.agent || {}), ...(cfg.agents || {}) }
    const expected = ["claudia", "claudia-simple", "claudia-explorer", "claudia-code",
      "claudia-system", "claudia-browser", "claudia-reviewer", "claudia-light"]
    const missing = expected.filter((a) => !agents[a])
    if (missing.length) problems.push(`agentes ausentes: ${missing.join(", ")}`)
    if (cfg.default_agent !== "claudia") problems.push(`default_agent es "${cfg.default_agent}", se esperaba "claudia"`)
  }
  if (!fs.existsSync(path.join(binDir, "engram"))) problems.push("engram no está en ~/.local/bin")
  if (!fs.existsSync(keyManagerScript)) problems.push("skill key-manager no instalada")
  if (!has("gpg")) problems.push("gpg no disponible")
  if (!has("terminal-browser") && !fs.existsSync(path.join(binDir, "terminal-browser"))) {
    log.warn("terminal-browser no instalado; claudia-browser no podrá navegar")
  }
  if (problems.length) {
    for (const p of problems) console.error(`[fail] ${p}`)
    throw new Error("verificación incompleta")
  }
  log.ok("verificación: agentes, engram, key-manager y configuración correctos")
}

// Accepts an OpenAI-compatible base URL (e.g. http://host:8084/v1); returns it without trailing slash.
function normalizeBaseUrl(raw) {
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error(`URL no válida: ${raw}`)
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`la URL debe ser http o https: ${raw}`)
  return url.toString().replace(/\/+$/, "")
}

async function askLocalLlmUrl() {
  if (localUrlArg) return normalizeBaseUrl(localUrlArg)
  if (!process.stdin.isTTY) return null
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(
      "¿Tienes un servidor local de IA (llama.cpp u OpenAI-compatible)? Introduce su URL base (p. ej. http://192.168.1.235:8084/v1) o pulsa Enter para omitir: ",
    )
    return answer.trim() ? normalizeBaseUrl(answer) : null
  } finally {
    rl.close()
  }
}

async function registerLocalLlm(baseUrl) {
  if (!baseUrl) return log.skip("servidor local de IA omitido")
  let ids = []
  try {
    const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    ids = ((await res.json()).data || []).map((m) => m.id).filter(Boolean)
  } catch (err) {
    log.warn(`no se pudo leer ${baseUrl}/models (${err.message}); proveedor llama-cpp no registrado`)
    return
  }
  if (!ids.length) return log.warn(`${baseUrl}/models no devolvió modelos; proveedor no registrado`)

  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"))
  const backup = `${configPath}.before-llama-cpp-${stamp()}.bak`
  fs.copyFileSync(configPath, backup)
  cfg.provider ??= {}
  cfg.provider["llama-cpp"] = {
    npm: "@ai-sdk/openai-compatible",
    name: "llama.cpp (servidor local)",
    options: { baseURL: baseUrl },
    models: Object.fromEntries(ids.map((id) => [id, { name: id }])),
  }
  atomicConfigWrite(configPath, `${JSON.stringify(cfg, null, 2)}\n`)
  log.ok(`proveedor llama-cpp registrado en ${baseUrl} con ${ids.length} modelos (copia previa: ${backup})`)
}

function nextSteps() {
  console.log(`
Siguientes pasos:
1. Configura en opencode.json los proveedores de los modelos de los perfiles
   (openai, llama-cpp, etc.). Este instalador no crea proveedores ni credenciales de modelos.
2. Reinicia OpenCode por completo y abre una sesión nueva de Claudia (/claudia).
3. Credenciales: en el equipo origen ejecuta
   python3 ~/.config/opencode/skills/key-manager/key-manager.py backup --out FILE --passphrase-stdin
   y en el nuevo: node install-claudia-all.mjs --restore-credentials FILE
   El bundle es cifrado; no lo subas al repositorio.`)
}

async function main() {
  preflight()
  if (check) return verify()
  const localLlmUrl = await askLocalLlmUrl() // asked once, up front, so the rest runs unattended
  if (!skipEngram) await ensureEngram()
  else if (!fs.existsSync(path.join(binDir, "engram"))) throw new Error("--skip-engram usado pero engram no existe en ~/.local/bin")
  await ensureTerminalBrowser()
  ensureKeyManager()
  ensureConfig()
  runInstaller("install-claudia-orchestration.mjs")
  runInstaller("install-claudia-light.mjs")
  await registerLocalLlm(localLlmUrl)
  verify()
  nextSteps()
}

main().catch((err) => {
  console.error(`[error] ${err.message}`)
  process.exit(1)
})
