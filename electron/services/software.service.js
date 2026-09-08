const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')

/**
 * Reads the uninstall registry hives (machine 64-bit, machine 32-bit and the
 * current user) and prints every registered program as one JSON document.
 * DisplayIcon often looks like `"C:\path\app.exe",0`, so the trailing icon
 * index is stripped in Node when the rows are normalized.
 */
const LIST_INSTALLED_SCRIPT = `
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, DisplayIcon |
  ConvertTo-Json -Compress -Depth 2
`.trim()

/** Runs a PowerShell command and resolves with its stdout. */
function defaultRunPs(script, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(String(stderr || '').trim() || error.message))
        resolve(String(stdout || ''))
      }
    )
  })
}

/**
 * Embeds a Node string into a PowerShell script safely. Direct quoting turns
 * any path containing a quote into script injection; base64 cannot.
 */
function psLiteral(value) {
  const encoded = Buffer.from(String(value), 'utf16le').toString('base64')
  return `[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'))`
}

/** Normalizes the raw uninstall-registry JSON into a sorted, deduped list. */
function parseInstalledJson(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return []
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }
  // ConvertTo-Json emits a single object (not an array) for one program.
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const seen = new Set()
  const programs = []
  for (const row of rows) {
    const name = String(row?.DisplayName || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    programs.push({
      name,
      version: String(row?.DisplayVersion || '').trim(),
      publisher: String(row?.Publisher || '').trim(),
      installLocation: String(row?.InstallLocation || '').trim(),
      // DisplayIcon is stored as `"C:\path\app.exe",0` — a quoted path plus an
      // icon index. Quoted paths may legally contain commas, so cut at the
      // closing quote instead of the first comma.
      displayIcon: (() => {
        const raw = String(row?.DisplayIcon || '').trim()
        const quoted = raw.match(/^"([^"]*)"/)
        return (quoted ? quoted[1] : raw.split(',')[0]).trim()
      })()
    })
  }
  return programs.sort((a, b) => a.name.localeCompare(b.name))
}

/** Streams a file through SHA-256; used to prove a copy landed intact. */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/** Streamed copy that reports how many bytes have landed so far. */
function streamCopy(source, target, total, onProgress) {
  return new Promise((resolve, reject) => {
    let written = 0
    const read = fs.createReadStream(source)
    const write = fs.createWriteStream(target, { flags: 'w' })
    read.on('data', (chunk) => {
      written += chunk.length
      onProgress?.(written, total)
    })
    read.on('error', (error) => { write.destroy(); reject(error) })
    write.on('error', reject)
    write.on('finish', resolve)
    read.pipe(write)
  })
}

/**
 * System software tools: list installed programs, read the version of any
 * executable, and copy files with live progress plus SHA-256 verification.
 *
 * The service intentionally has no `electron` dependency — the event emitter
 * and the PowerShell runner are injected — so the copy/verification logic can
 * be exercised by plain `node --test` on any platform.
 */
class SoftwareService {
  constructor(sendEvent, options = {}) {
    this.sendEvent = typeof sendEvent === 'function' ? sendEvent : () => {}
    this.platform = options.platform || process.platform
    this.runPs = options.runPs || defaultRunPs
    this.cache = null
    this.cacheAt = 0
  }

  /** All programs registered with Windows Install/Uninstall, cached for 60 s. */
  async listInstalled(force = false) {
    this.#requireWindows('Listing installed programs')
    if (!force && this.cache && Date.now() - this.cacheAt < 60000) return this.cache
    const output = await this.runPs(LIST_INSTALLED_SCRIPT)
    this.cache = parseInstalledJson(output)
    this.cacheAt = Date.now()
    return this.cache
  }

  /**
   * Two lookup modes:
   *  - `{ path }`  → version info of that exact executable (always available
   *    for any file, installed or not)
   *  - `{ name }`  → programs whose registered name contains the text
   */
  async checkVersion(payload = {}) {
    const filePath = String(payload.path || '').trim()
    const name = String(payload.name || '').trim()
    if (filePath) return this.getFileVersion(filePath)
    if (!name) throw new Error('Enter a program name or choose an executable file')
    const programs = await this.listInstalled()
    const needle = name.toLowerCase()
    const matches = programs.filter((program) => program.name.toLowerCase().includes(needle))
    return { mode: 'installed', query: name, matches: matches.slice(0, 25), total: matches.length, checkedAt: new Date().toISOString() }
  }

  /** File/Product version of one executable plus its statistics. */
  async getFileVersion(filePath) {
    this.#requireWindows('Reading a file version')
    if (!path.isAbsolute(filePath)) throw new Error('The file path must be absolute')
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
    const stats = fs.statSync(filePath)
    const script = [
      `$p = ${psLiteral(filePath)}`,
      '$i = Get-Item -LiteralPath $p',
      '$v = $i.VersionInfo',
      '[pscustomobject]@{',
      '  FileVersion = $v.FileVersion; ProductVersion = $v.ProductVersion',
      '  ProductName = $v.ProductName; CompanyName = $v.CompanyName',
      '  FileDescription = $v.FileDescription',
      '} | ConvertTo-Json -Compress'
    ].join('; ')
    let info = {}
    try {
      info = JSON.parse(String(await this.runPs(script)).trim() || '{}')
    } catch {
      // A file without version resources (plain DLLs, scripts) still reports
      // its size and timestamps — only the version fields stay empty.
    }
    return {
      mode: 'file',
      path: filePath,
      fileName: path.basename(filePath),
      fileVersion: String(info.FileVersion || ''),
      productVersion: String(info.ProductVersion || ''),
      productName: String(info.ProductName || ''),
      companyName: String(info.CompanyName || ''),
      fileDescription: String(info.FileDescription || ''),
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    }
  }

  /**
   * Copies every source file into the destination folder, reporting progress
   * over IPC and (optionally) proving each copy with a SHA-256 comparison.
   * One bad file never aborts the batch: it is recorded as `error` and the
   * run continues with the next file.
   */
  async copyFiles(payload = {}) {
    const sources = (Array.isArray(payload.sources) ? payload.sources : []).map((value) => String(value || '').trim()).filter(Boolean)
    const destination = String(payload.destination || '').trim()
    const overwrite = Boolean(payload.overwrite)
    const verify = payload.verify !== false
    if (sources.length === 0) throw new Error('Add at least one file to copy')
    if (sources.length > 200) throw new Error('A single copy run is limited to 200 files')
    if (!destination) throw new Error('Choose a destination folder')
    if (!path.isAbsolute(destination)) throw new Error('The destination must be an absolute path')
    if (fs.existsSync(destination) && !fs.statSync(destination).isDirectory()) throw new Error('The destination exists and is not a folder')
    fs.mkdirSync(destination, { recursive: true })

    const startedAt = Date.now()
    const results = []
    let copiedBytes = 0
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index]
      const target = path.join(destination, path.basename(source))
      let lastEmit = 0
      const emit = (state, extra = {}) => {
        // Streams report per 64 KB chunk; the UI only needs ~10 updates/s.
        // The final (100 %) chunk always goes through — otherwise a file that
        // copies inside one throttle window would never show any progress.
        if (state === 'progress' && extra.written !== extra.total && Date.now() - lastEmit < 100) return
        lastEmit = Date.now()
        this.sendEvent('software:copy-progress', { index, source, target, state, ...extra })
      }
      try {
        if (!path.isAbsolute(source)) throw new Error('The source must be an absolute path')
        if (!fs.existsSync(source)) throw new Error('Source file not found')
        const stats = fs.statSync(source)
        if (!stats.isFile()) throw new Error('The source is not a file')
        if (path.resolve(source) === path.resolve(target)) throw new Error('Source and destination are identical')
        if (fs.existsSync(target) && !overwrite) {
          results.push({ source, target, bytes: 0, state: 'skipped', error: 'Already exists at the destination' })
          emit('skipped', { percent: 100, written: stats.size, total: stats.size })
          continue
        }
        emit('started', { percent: 0, written: 0, total: stats.size })
        await streamCopy(source, target, stats.size, (written, total) =>
          emit('progress', { percent: total > 0 ? Math.floor((written / total) * 100) : 100, written, total })
        )
        let verified = null
        let sha256Source = null
        let sha256Target = null
        if (verify) {
          emit('verifying', { percent: 100, written: stats.size, total: stats.size })
          ;[sha256Source, sha256Target] = await Promise.all([sha256File(source), sha256File(target)])
          verified = sha256Source === sha256Target
          if (!verified) throw new Error('SHA-256 verification failed after copying')
        }
        copiedBytes += stats.size
        results.push({ source, target, bytes: stats.size, sha256Source, sha256Target, verified, state: 'copied' })
        emit('copied', { percent: 100, written: stats.size, total: stats.size, verified })
      } catch (error) {
        results.push({ source, target, bytes: 0, state: 'error', error: error.message })
        emit('error', { percent: 0, error: error.message })
      }
    }
    const summary = {
      results,
      copied: results.filter((r) => r.state === 'copied').length,
      skipped: results.filter((r) => r.state === 'skipped').length,
      failed: results.filter((r) => r.state === 'error').length,
      totalBytes: copiedBytes,
      durationMs: Date.now() - startedAt
    }
    this.sendEvent('software:copy-progress', { state: 'finished', summary })
    return summary
  }

  #requireWindows(action) {
    if (this.platform !== 'win32') throw new Error(`${action} is only available on Windows`)
  }
}

module.exports = { SoftwareService, parseInstalledJson, sha256File, streamCopy, defaultRunPs, psLiteral }
