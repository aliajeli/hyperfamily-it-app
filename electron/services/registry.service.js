const { execFile } = require('child_process')

/**
 * Reads the "Programs and Features" (Control Panel) list of a REMOTE machine.
 *
 * Control Panel shows exactly the contents of the uninstall registry hives, so
 * the version an operator reads there is `DisplayVersion` — not the file
 * version stamped on the .exe, which for Store Commerce regularly differs.
 * `reg.exe query \\HOST\HKLM\...` reads those hives over the Remote Registry
 * service, riding on the SMB session opened by SmbSessionManager.
 *
 * Both the 64-bit and the 32-bit (WOW6432Node) views are queried because
 * Store Commerce registers itself in either one depending on the installer.
 */

const UNINSTALL_KEYS = [
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

/** Runs reg.exe, resolving with its stdout; never rejects, never hangs. */
function runReg(args, timeoutMs = 25000) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }, (error, stdout = '', stderr = '') => {
      resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr), timedOut: Boolean(error?.killed) })
    })
  })
}

/**
 * Parses `reg query ... /s` output into program rows.
 *
 * The format is a key line, then indented `name  TYPE  value` lines, then a
 * blank line — one block per installed program.
 */
function parseRegQuery(output) {
  const programs = []
  let current = null
  const flush = () => {
    if (current?.name) programs.push(current)
    current = null
  }
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue
    if (/^HK(EY_)?/i.test(line.trim()) || /^\\\\/.test(line.trim())) {
      flush()
      current = { key: line.trim(), name: '', version: '', publisher: '', installLocation: '' }
      continue
    }
    if (!current) continue
    // Values are separated by runs of spaces: "    DisplayName    REG_SZ    Store Commerce"
    const match = line.match(/^\s{4,}(\S(?:.*?\S)?)\s{2,}(REG_[A-Z_]+)\s{2,}([\s\S]*)$/)
    if (!match) continue
    const [, valueName, , value] = match
    const trimmed = value.trim()
    if (/^DisplayName$/i.test(valueName)) current.name = trimmed
    else if (/^DisplayVersion$/i.test(valueName)) current.version = trimmed
    else if (/^Publisher$/i.test(valueName)) current.publisher = trimmed
    else if (/^InstallLocation$/i.test(valueName)) current.installLocation = trimmed
  }
  flush()
  return programs.filter((program) => program.name)
}

/**
 * Every program registered on `host` ('' or 'localhost' → this machine).
 * `reg.exe` is spawned once per hive, in parallel, each with its own deadline.
 */
async function listRemotePrograms(host, options = {}) {
  const exec = options.exec || runReg
  const timeoutMs = options.timeoutMs || 25000
  const clean = String(host || '').trim().replace(/^\\+/, '')
  const prefix = clean && !/^(localhost|127\.0\.0\.1|\.)$/i.test(clean) ? `\\\\${clean}\\` : ''
  const runs = await Promise.all(UNINSTALL_KEYS.map((key) => exec([`query`, `${prefix}HKLM\\${key}`, '/s'], timeoutMs)))
  const reachable = runs.some((run) => run.ok)
  if (!reachable) {
    const detail = runs.map((run) => (run.stderr || run.stdout || '').replace(/\s+/g, ' ').trim()).find(Boolean) || ''
    if (runs.some((run) => run.timedOut)) throw new Error(`${clean || 'This machine'} did not answer the registry query in time`)
    if (/access is denied/i.test(detail)) throw new Error(`Access denied reading the registry on ${clean} — configure Settings → Target access`)
    if (/unable to find|network path|RPC server/i.test(detail)) {
      throw new Error(`Cannot read the registry on ${clean} — the Remote Registry service must be running there`)
    }
    throw new Error(`Registry query failed on ${clean || 'this machine'}${detail ? ` — ${detail}` : ''}`)
  }
  const seen = new Set()
  const programs = []
  for (const run of runs) {
    for (const program of parseRegQuery(run.stdout)) {
      const key = `${program.name.toLowerCase()}|${program.version}`
      if (seen.has(key)) continue
      seen.add(key)
      programs.push(program)
    }
  }
  return programs.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The single program whose Control Panel name matches `needle`
 * (case-insensitive substring). When several match — Store Commerce ships
 * companion entries such as "Store Commerce Hardware Station" — the shortest
 * name wins, which is the product itself rather than an add-on.
 */
function pickProgram(programs, needle) {
  const query = String(needle || '').trim().toLowerCase()
  if (!query) return null
  const matches = programs.filter((program) => program.name.toLowerCase().includes(query))
  if (!matches.length) return null
  const exact = matches.find((program) => program.name.trim().toLowerCase() === query)
  if (exact) return exact
  return matches.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))[0]
}

module.exports = { listRemotePrograms, parseRegQuery, pickProgram, UNINSTALL_KEYS }
