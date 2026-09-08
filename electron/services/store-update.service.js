const fs = require('fs')
const path = require('path')
const { pingHost } = require('./ping.service')
const { defaultRunPs, psLiteral, sha256File, streamCopy } = require('./software.service')

/* --------------------------------------------------------------------------
 * Jalali (Persian) dates, needed because backups on a checkout are renamed
 * `<jalali YYYYMMDD>-name` — e.g. `14050617-StoreCommerce.exe` — so operators
 * read the date directly. Uses the engine's own Intl Persian calendar
 * (full-icu in Node ≥13 and in Electron), which implements the leap-year
 * rules — including Esfand 30 — far more reliably than a hand-rolled table.
 * ------------------------------------------------------------------------ */

/** One Gregorian date → its Jalali { jy, jm, jd }. */
function toJalali(gy, gm, gd) {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(new Date(Date.UTC(gy, gm - 1, gd)))
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { jy: pick('year'), jm: pick('month'), jd: pick('day') }
}

/** Today (local machine date) → `14050617`, stamped onto backed-up files. */
function jalaliStamp(date = new Date()) {
  const { jy, jm, jd } = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
  return `${jy}${String(jm).padStart(2, '0')}${String(jd).padStart(2, '0')}`
}

/* ------------------------------------------------------------------------ */

/** 'D:\\Store\\app.exe' on host CO-01 → '\\\\CO-01\\D$\\Store\\app.exe'. */
function uncPath(host, localPath) {
  const cleanHost = String(host || '').trim().replace(/^\\+/, '').replace(/[\\/].*$/, '')
  if (!cleanHost) throw new Error('The checkout has no hostname or IP address')
  const value = String(localPath || '').trim()
  const match = value.match(/^([a-zA-Z]):[\\/]([\s\S]*)$/)
  if (!match || !match[2]) throw new Error(`Path must be a local drive path like C:\\Store\\app.exe — got “${value}”`)
  return `\\\\${cleanHost}\\${match[1].toUpperCase()}$\\${match[2].replace(/\//g, '\\')}`
}

/**
 * Free backup name for `<stamp>-<file>` inside `dir`: if a same-day backup
 * already exists, `-2`, `-3`… is appended so nothing is ever overwritten.
 */
function pickBackupName(dir, fileName, stamp, exists) {
  let candidate = `${stamp}-${fileName}`
  let counter = 2
  while (exists(path.join(dir, candidate))) {
    candidate = `${stamp}-${fileName.replace(/(\.[^.]*)?$/, `-${counter}$1`)}`
    counter += 1
  }
  return candidate
}

const MAX_COPY_ATTEMPTS = 3

/**
 * "Update Store App" backend: checks the Store Commerce version on every
 * checkout over SMB admin shares and deploys files to them with a fully
 * narrated pipeline (ping → locate → backup → copy → SHA-256 → retry).
 *
 * Everything OS-shaped is injected (ping, PowerShell runner, path mapper,
 * existence/rename, copier), so the entire pipeline is unit-testable on any
 * platform with plain directories standing in for UNC paths.
 */
class StoreUpdateService {
  constructor(sendEvent, options = {}) {
    this.sendEvent = typeof sendEvent === 'function' ? sendEvent : () => {}
    this.platform = options.platform || process.platform
    this.runPs = options.runPs || defaultRunPs
    this.ping = options.ping || pingHost
    this.mapPath = options.pathMapper || uncPath
    this.exists = options.exists || ((target) => fs.existsSync(target))
    this.copyImpl = options.copier || streamCopy
    // Copies and renames hit real UNC paths, which only exist on Windows; in
    // tests a custom pathMapper (plus the other injectables) substitutes them.
    this.realFs = this.platform === 'win32' || Boolean(options.pathMapper)
  }

  emit(channel, payload) {
    this.sendEvent(channel, payload)
  }

  #hostOf(checkout) {
    return String(checkout?.hostname || checkout?.ip || '').trim()
  }

  #requireRealPaths(action) {
    if (!this.realFs) throw new Error(`${action} is only available on Windows`)
  }

  /** Store Commerce version on ONE checkout: ping → file exists → VersionInfo. */
  async checkOne(checkout, programPath) {
    const host = this.#hostOf(checkout)
    if (!host) return { state: 'no-host', detail: 'No hostname or IP on record' }
    const startedAt = Date.now()
    const ping = await this.ping(host, 1500).catch(() => ({ status: 'offline' }))
    if (ping.status === 'offline') return { state: 'offline', host, checkedAt: new Date().toISOString() }
    let target
    try {
      target = this.mapPath(host, programPath)
    } catch (error) {
      return { state: 'error', host, pingTime: ping.ping_time, error: error.message }
    }
    let found = false
    try {
      found = this.exists(target)
    } catch (error) {
      return { state: 'error', host, pingTime: ping.ping_time, error: `Cannot reach ${target} — ${error.message}` }
    }
    if (!found) return { state: 'not-found', host, pingTime: ping.ping_time, path: target, checkedAt: new Date().toISOString() }
    try {
      this.#requireRealPaths('Reading a version over the network')
      const script = `(Get-Item -LiteralPath ${psLiteral(target)}).VersionInfo | Select-Object FileVersion, ProductVersion, ProductName | ConvertTo-Json -Compress`
      const info = JSON.parse(String(await this.runPs(script, 20000)).trim() || '{}')
      return {
        state: 'ok',
        host,
        pingTime: ping.ping_time,
        path: target,
        version: String(info.FileVersion || info.ProductVersion || '').trim() || 'unknown',
        product: String(info.ProductName || '').trim(),
        durationMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
      }
    } catch (error) {
      return { state: 'error', host, pingTime: ping.ping_time, path: target, error: error.message, checkedAt: new Date().toISOString() }
    }
  }

  /**
   * Version sweep over ALL checkouts with a small worker pool (offline hosts
   * cost one 1.5 s ping each, so 5 parallel workers keep the sweep quick).
   * Every finished checkout is emitted immediately as `store-update:version`
   * so its card can leave the “Checking…” state without waiting for the rest.
   */
  async checkMany(checkouts, programPath) {
    const queue = [...checkouts]
    const results = []
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length) {
        const checkout = queue.shift()
        const result = await this.checkOne(checkout, programPath).catch((error) => ({ state: 'error', error: error.message }))
        const full = { checkoutId: checkout.id, name: checkout.name, branchId: checkout.branch_id, ...result }
        this.emit('store-update:version', full)
        results.push(full)
      }
    })
    await Promise.all(workers)
    return results
  }

  /**
   * The full deployment pipeline for ONE checkout. Every step is narrated
   * through `store-update:step` events and the return value carries the
   * whole timeline for the summary popup.
   */
  async deployOne(checkout, { source, destinationPath, runId, stamp }) {
    this.#requireRealPaths('Deploying files to checkouts')
    const host = this.#hostOf(checkout)
    const startedAt = Date.now()
    const steps = []
    const record = (step, status, detail) => {
      const entry = { step, status, detail: detail || '', at: new Date().toISOString() }
      steps.push(entry)
      this.emit('store-update:step', { runId, checkoutId: checkout.id, name: checkout.name, ...entry })
    }
    const finish = (ok, extra = {}) => ({
      checkoutId: checkout.id,
      name: checkout.name,
      host,
      ok,
      steps,
      durationMs: Date.now() - startedAt,
      ...extra
    })

    const fileName = path.basename(String(source || '').trim())
    if (!fileName || !fs.existsSync(source)) {
      record('source', 'failed', fileName ? 'The selected file no longer exists on this system' : 'No file selected')
      return finish(false, { error: 'Selected file missing' })
    }
    const sourceSize = fs.statSync(source).size
    record('source', 'done', `${fileName} (${sourceSize} bytes)`)
    if (!host) {
      record('connectivity', 'failed', 'The checkout has no hostname or IP address')
      return finish(false, { error: 'No host' })
    }

    // 1 --- connectivity -------------------------------------------------
    record('connectivity', 'running', `Pinging ${host}…`)
    const ping = await this.ping(host, 1500).catch(() => ({ status: 'offline' }))
    if (ping.status === 'offline') {
      record('connectivity', 'failed', `${host} did not answer the ping`)
      return finish(false, { error: 'Checkout unreachable' })
    }
    record('connectivity', 'done', `${host} answered in ${ping.ping_time ?? 1} ms`)

    // 2 --- resolve target ----------------------------------------------
    let destDir
    let target
    try {
      destDir = this.mapPath(host, destinationPath)
      target = path.join(destDir, fileName)
      // The destination folder is created if it is missing — a freshly
      // reimaged checkout should receive its first deploy without manual prep.
      fs.mkdirSync(destDir, { recursive: true })
      record('target', 'done', `${destDir}\\${fileName}`)
    } catch (error) {
      record('target', 'failed', error.message)
      return finish(false, { error: error.message })
    }

    // 3 --- existing file → dated backup ---------------------------------
    let backupName = null
    try {
      if (this.exists(target)) {
        backupName = pickBackupName(destDir, fileName, stamp || jalaliStamp(), this.exists)
        fs.renameSync(target, path.join(destDir, backupName))
        record('backup', 'done', `${fileName} → ${backupName}`)
      } else {
        record('backup', 'skipped', `${target} does not exist yet — nothing to back up`)
      }
    } catch (error) {
      record('backup', 'failed', `Could not rename the existing file — ${error.message}`)
      return finish(false, { error: 'Backup rename failed', backup: backupName })
    }

    // 4-6 --- copy + SHA-256 verify, with delete-and-retry ---------------
    const sourceHash = await sha256File(source)
    for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt += 1) {
      const suffix = MAX_COPY_ATTEMPTS > 1 ? ` (attempt ${attempt}/${MAX_COPY_ATTEMPTS})` : ''
      let lastProgress = 0
      record('copy', 'running', `Copying ${fileName}…${suffix}`)
      this.emit('store-update:progress', { runId, checkoutId: checkout.id, name: checkout.name, percent: 0, attempt })
      try {
        await this.copyImpl(source, target, sourceSize, (written, total) => {
          const percent = total > 0 ? Math.floor((written / total) * 100) : 100
          if (Date.now() - lastProgress >= 100 || written === total) {
            lastProgress = Date.now()
            this.emit('store-update:progress', { runId, checkoutId: checkout.id, name: checkout.name, percent, written, total, attempt })
          }
        })
      } catch (error) {
        record('copy', 'failed', `Copy failed — ${error.message}`)
        return finish(false, { error: 'Copy failed', backup: backupName })
      }
      record('copy', 'done', `${sourceSize} bytes copied${suffix}`)

      record('verify', 'running', `Comparing SHA-256 of source and destination…${suffix}`)
      let targetHash
      try {
        targetHash = await sha256File(target)
      } catch (error) {
        record('verify', 'failed', `Could not hash the copied file — ${error.message}`)
        return finish(false, { error: 'Verification failed', backup: backupName })
      }
      if (targetHash === sourceHash) {
        record('verify', 'done', 'SHA-256 hashes match — the copy is intact')
        record('finish', 'done', `Deployed ${fileName}${backupName ? ` (previous file kept as ${backupName})` : ''}`)
        return finish(true, { backup: backupName, bytes: sourceSize, attempts: attempt, sha256: sourceHash })
      }
      record('verify', 'failed', attempt < MAX_COPY_ATTEMPTS ? 'SHA-256 mismatch — deleting the corrupt copy and repeating' : 'SHA-256 still differs after the final attempt')
      try {
        fs.unlinkSync(target)
      } catch (error) {
        record('verify', 'failed', `Could not delete the corrupt copy — ${error.message}`)
        return finish(false, { error: 'Corrupt copy could not be removed', backup: backupName })
      }
    }
    return finish(false, { error: `SHA-256 mismatch after ${MAX_COPY_ATTEMPTS} attempts`, backup: backupName })
  }

  /**
   * Deploys to every checkout STRICTLY in list order, as operators expect:
   * each machine finishes (or fails) before the next one starts, and the run
   * ends with a `store-update:finished` event carrying the per-machine summary.
   */
  async deployAll(checkouts, payload) {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const stamp = jalaliStamp()
    const results = []
    for (const checkout of checkouts) {
      // Serial on purpose: operators watch each machine finish before the next starts.
      results.push(await this.deployOne(checkout, { ...payload, runId, stamp }))
    }
    const summary = {
      runId,
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0)
    }
    this.emit('store-update:finished', summary)
    return summary
  }
}

module.exports = { StoreUpdateService, toJalali, jalaliStamp, uncPath, pickBackupName }
