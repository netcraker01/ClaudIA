import fs from "node:fs"

export function packageManagerHint(osReleasePath = "/etc/os-release") {
  let osRelease = ""
  try { osRelease = fs.readFileSync(osReleasePath, "utf8") } catch {}
  const fields = Object.fromEntries(osRelease.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (!match) return []
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    return [match[1], value]
  }))
  const ids = `${fields.ID || ""} ${fields.ID_LIKE || ""}`.toLowerCase().split(/\s+/)
  if (ids.some((id) => ["arch", "manjaro", "endeavouros"].includes(id))) return "En Arch/Omarchy: sudo pacman -S nodejs npm github-cli python gnupg tar"
  if (ids.some((id) => ["debian", "ubuntu"].includes(id))) return "En Debian/Ubuntu: sudo apt install"
  return null
}
