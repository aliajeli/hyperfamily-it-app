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
    // `code` lets the caller decide whether another strategy is worth trying:
    // a stopped service is recoverable, denied credentials are not.
    const fail = (message, code) => { const error = new Error(message); error.code = code; throw error }
    if (runs.some((run) => run.timedOut)) fail(`${clean || 'This machine'} did not answer the registry query in time`, 'REGISTRY_TIMEOUT')
    if (/access is denied/i.test(detail)) fail(`Access denied reading the registry on ${clean} — check Settings → Target access`, 'REGISTRY_DENIED')
    if (/unable to find|network path|RPC server|cannot find the file/i.test(detail)) {
      fail(`The Remote Registry service is not answering on ${clean}`, 'REGISTRY_UNAVAILABLE')
    }
    fail(`Registry query failed on ${clean || 'this machine'}${detail ? ` — ${detail}` : ''}`, 'REGISTRY_FAILED')
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

/**
 * Fallback for when Remote Registry is stopped: copy the machine's SOFTWARE
 * hive off \\host\C$ and read it locally with `reg load`.
 *
 * The live hive is locked by the running system, so the volume shadow copy is
 * not available to us — but Windows keeps a periodic backup in
 * C:\Windows\System32\config\RegBack (and older builds leave one in
 * \repair). Those are readable over the admin share. The version they report
 * can be slightly stale, which is why this is only ever the second choice and
 * the result is flagged as such.
 */
async function readHiveOverShare(host, options = {}) {
  const exec = options.exec || runReg
  const copyFile = options.copyFile
  const tempDir = options.tempDir || require('os').tmpdir()
  const path = require('path')
  const fsp = require('fs/promises')
  const clean = String(host || '').trim().replace(/^\\+/, '')
  const candidates = [
    `\\\\${clean}\\C$\\Windows\\System32\\config\\RegBack\\SOFTWARE`,
    `\\\\${clean}\\C$\\Windows\\repair\\SOFTWARE`
  ]
  // A mount point unique per host, so parallel checks never collide.
  const mountName = `HFOFFLINE_${clean.replace(/[^a-zA-Z0-9]/g, '_')}_${process.pid}`
  const localCopy = path.join(tempDir, `${mountName}.hive`)

  let copied = false
  for (const candidate of candidates) {
    try {
      const stats = await fsp.stat(candidate)
      // A 0-byte RegBack file means the backup task never ran on that machine.
      if (!stats.size) continue
      await (copyFile ? copyFile(candidate, localCopy) : fsp.copyFile(candidate, localCopy))
      copied = true
      break
    } catch {
      // Try the next location.
    }
  }
  if (!copied) {
    const error = new Error(`No readable registry backup found on ${clean}`)
    error.code = 'HIVE_UNAVAILABLE'
    throw error
  }

  try {
    const load = await exec(['load', `HKLM\\${mountName}`, localCopy], options.timeoutMs || 25000)
    if (!load.ok) {
      const error = new Error(`Could not open the registry backup copied from ${clean}`)
      error.code = 'HIVE_LOAD_FAILED'
      throw error
    }
    try {
      const runs = await Promise.all(UNINSTALL_KEYS.map((key) =>
        exec(['query', `HKLM\\${mountName}\\${key}`, '/s'], options.timeoutMs || 25000)
      ))
      const seen = new Set()
      const programs = []
      for (const run of runs) {
        for (const program of parseRegQuery(run.stdout)) {
          const dedupe = `${program.name.toLowerCase()}|${program.version}`
          if (seen.has(dedupe)) continue
          seen.add(dedupe)
          programs.push(program)
        }
      }
      return programs.sort((a, b) => a.name.localeCompare(b.name))
    } finally {
      await exec(['unload', `HKLM\\${mountName}`], 15000)
    }
  } finally {
    await fsp.unlink(localCopy).catch(() => {})
  }
}

module.exports = { listRemotePrograms, readHiveOverShare, parseRegQuery, pickProgram, UNINSTALL_KEYS }
