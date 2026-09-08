const path = require('path')
const { pingHost } = require('./ping.service')
const { sha256File, streamCopy } = require('./software.service')
const { listRemotePrograms, pickProgram } = require('./registry.service')
const { SmbSessionManager } = require('./smb.service')
const { existsAsync, probeAsync, statAsync, mkdirAsync, renameAsync, unlinkAsync, withTimeout } = require('./async-fs')

/**
 * The product exactly as Control Panel lists it. Deliberately hard-coded: the
 * operator configures WHO to connect as (Settings → Target access), not what
 * the product is called.
 */
const STORE_COMMERCE_PROGRAM = 'Store Commerce'

/** Deadlines so one unreachable checkout can never stall the queue. */
const PING_TIMEOUT_MS = 1500
const REGISTRY_TIMEOUT_MS = 25000
const CHECK_TIMEOUT_MS = 45000
const COPY_TIMEOUT_MS = 15 * 60 * 1000

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
async function pickBackupName(dir, fileName, stamp, exists) {
  let candidate = `${stamp}-${fileName}`
  let counter = 2
  while (await exists(path.join(dir, candidate))) {
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
    this.ping = options.ping || pingHost
    this.mapPath = options.pathMapper || uncPath
    // Async by design: the synchronous versions of these calls block Electron's
    // main thread on an unreachable UNC path and freeze the whole window.
    this.exists = options.exists || existsAsync
    this.probe = options.probe || probeAsync
    this.copyImpl = options.copier || streamCopy
    this.listPrograms = options.listPrograms || listRemotePrograms
    this.smb = options.smb || new SmbSessionManager({ platform: this.platform })
    // Credentials for the target domain, supplied per call by the IPC layer.
    this.getCredentials = typeof options.getCredentials === 'function' ? options.getCredentials : () => null
    this.programName = options.programName || STORE_COMMERCE_PROGRAM
    // Deadlines are injectable so tests can prove the no-hang guarantee
    // without waiting the full production timeout.
    this.checkTimeoutMs = options.checkTimeoutMs || CHECK_TIMEOUT_MS
    this.registryTimeoutMs = options.registryTimeoutMs || REGISTRY_TIMEOUT_MS
    this.copyTimeoutMs = options.copyTimeoutMs || COPY_TIMEOUT_MS
    // Copies and renames hit real UNC paths, which only exist on Windows; in
    // tests a custom pathMapper (plus the other injectables) substitutes them.
    this.realFs = this.platform === 'win32' || Boolean(options.pathMapper)
  }

  /** Opens an authenticated SMB session to `host` for the duration of `task`. */
  #withSession(host, task) {
    return this.smb.withHost(host, this.getCredentials(), task)
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

  /**
   * Store Commerce version on ONE checkout, read the way an operator would:
   * ping → open a session as the target-domain admin → read the Control Panel
   * (uninstall registry) entry for the product.
   *
   * The whole call is wrapped in a hard deadline, so a checkout that accepts
   * the TCP connection but never answers can delay this card and nothing else.
   */
  async checkOne(checkout) {
    const host = this.#hostOf(checkout)
    if (!host) return { state: 'no-host', detail: 'No hostname or IP on record' }
    const startedAt = Date.now()
    const ping = await this.ping(host, PING_TIMEOUT_MS).catch(() => ({ status: 'offline' }))
    if (ping.status === 'offline') return { state: 'offline', host, checkedAt: new Date().toISOString() }
    try {
      this.#requireRealPaths('Reading a version from a remote machine')
      const programs = await withTimeout(
        this.#withSession(host, () => this.listPrograms(host, { timeoutMs: this.registryTimeoutMs })),
        this.checkTimeoutMs,
        `${host} did not return its installed programs in time`
      )
      const program = pickProgram(programs, this.programName)
      if (!program) {
        return {
          state: 'not-found',
          host,
          pingTime: ping.ping_time,
          detail: `“${this.programName}” is not listed in Programs and Features on ${host}`,
          checkedAt: new Date().toISOString()
        }
      }
      return {
        state: 'ok',
        host,
        pingTime: ping.ping_time,
        version: program.version || 'unknown',
        product: program.name,
        publisher: program.publisher,
        installLocation: program.installLocation,
        source: 'control-panel',
        durationMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
      }
    } catch (error) {
      return { state: 'error', host, pingTime: ping.ping_time, error: error.message, checkedAt: new Date().toISOString() }
    }
  }

  /**
   * Version sweep over ALL checkouts with a small worker pool (offline hosts
   * cost one 1.5 s ping each, so 5 parallel workers keep the sweep quick).
   * Every finished checkout is emitted immediately as `store-update:version`
   * so its card can leave the “Checking…” state without waiting for the rest.
   */
  async checkMany(checkouts) {
    const queue = [...checkouts]
    const results = []
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length) {
        const checkout = queue.shift()
        const result = await this.checkOne(checkout).catch((error) => ({ state: 'error', error: error.message }))
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

    // The source is local, so async stat costs nothing but keeps the pattern.
    const fileName = path.basename(String(source || '').trim())
    let sourceSize = 0
    try {
      if (!fileName) throw new Error('No file selected')
      sourceSize = (await statAsync(source, 10000)).size
    } catch {
      record('source', 'failed', fileName ? 'The selected file no longer exists on this system' : 'No file selected')
      return finish(false, { error: 'Selected file missing' })
    }
    record('source', 'done', `${fileName} (${sourceSize} bytes)`)
    if (!host) {
      record('connectivity', 'failed', 'The checkout has no hostname or IP address')
      return finish(false, { error: 'No host' })
    }

    // 1 --- connectivity -------------------------------------------------
    record('connectivity', 'running', `Pinging ${host}…`)
    const ping = await this.ping(host, PING_TIMEOUT_MS).catch(() => ({ status: 'offline' }))
    if (ping.status === 'offline') {
      record('connectivity', 'failed', `${host} did not answer the ping`)
      return finish(false, { error: 'Checkout unreachable' })
    }
    record('connectivity', 'done', `${host} answered in ${ping.ping_time ?? 1} ms`)

    // Everything below touches \\host\C$, which needs an authenticated
    // session when the checkout sits in another domain. One session covers the
    // whole deployment and is released automatically at the end.
    const credentials = this.getCredentials()
    if (credentials?.username) record('signin', 'running', `Signing in to ${host} as ${credentials.domain ? `${credentials.domain}\\` : ''}${credentials.username}…`)
    try {
      return await this.smb.withHost(host, credentials, async () => {
        if (credentials?.username) record('signin', 'done', `Authenticated to ${host}`)

        // 2 --- resolve target --------------------------------------------
        let destDir
        let target
        try {
          destDir = this.mapPath(host, destinationPath)
          target = path.join(destDir, fileName)
          // A freshly reimaged checkout should receive its first deploy
          // without manual preparation of the folder.
          await mkdirAsync(destDir)
          record('target', 'done', `${destDir}\\${fileName}`)
        } catch (error) {
          record('target', 'failed', error.message)
          return finish(false, { error: error.message })
        }

        // 3 --- existing file → dated backup -------------------------------
        let backupName = null
        try {
          const existing = await this.probe(target)
          if (!existing.reachable) throw new Error(existing.error || `Cannot reach ${target}`)
          if (existing.exists) {
            backupName = await pickBackupName(destDir, fileName, stamp || jalaliStamp(), this.exists)
            await renameAsync(target, path.join(destDir, backupName))
            record('backup', 'done', `${fileName} → ${backupName}`)
          } else {
            record('backup', 'skipped', `${target} does not exist yet — nothing to back up`)
          }
        } catch (error) {
          record('backup', 'failed', `Could not rename the existing file — ${error.message}`)
          return finish(false, { error: 'Backup rename failed', backup: backupName })
        }

        // 4-6 --- copy + SHA-256 verify, with delete-and-retry -------------
        const sourceHash = await sha256File(source)
        for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt += 1) {
          const suffix = MAX_COPY_ATTEMPTS > 1 ? ` (attempt ${attempt}/${MAX_COPY_ATTEMPTS})` : ''
          let lastProgress = 0
          record('copy', 'running', `Copying ${fileName}…${suffix}`)
          this.emit('store-update:progress', { runId, checkoutId: checkout.id, name: checkout.name, percent: 0, attempt })
          try {
            await withTimeout(
              this.copyImpl(source, target, sourceSize, (written, total) => {
                const percent = total > 0 ? Math.floor((written / total) * 100) : 100
                if (Date.now() - lastProgress >= 100 || written === total) {
                  lastProgress = Date.now()
                  this.emit('store-update:progress', { runId, checkoutId: checkout.id, name: checkout.name, percent, written, total, attempt })
                }
              }),
              this.copyTimeoutMs,
              `The copy to ${host} stalled and was aborted`
            )
          } catch (error) {
            record('copy', 'failed', `Copy failed — ${error.message}`)
            return finish(false, { error: 'Copy failed', backup: backupName })
          }
          record('copy', 'done', `${sourceSize} bytes copied${suffix}`)

          record('verify', 'running', `Comparing SHA-256 of source and destination…${suffix}`)
          let targetHash
          try {
            targetHash = await withTimeout(sha256File(target), this.copyTimeoutMs, `Hashing the copy on ${host} stalled`)
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
            await unlinkAsync(target)
          } catch (error) {
            record('verify', 'failed', `Could not delete the corrupt copy — ${error.message}`)
            return finish(false, { error: 'Corrupt copy could not be removed', backup: backupName })
          }
        }
        return finish(false, { error: `SHA-256 mismatch after ${MAX_COPY_ATTEMPTS} attempts`, backup: backupName })
      })
    } catch (error) {
      // Session setup failed (wrong credentials, host refuses SMB, …).
      record('signin', 'failed', error.message)
      return finish(false, { error: error.message })
    }
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

module.exports = { StoreUpdateService, toJalali, jalaliStamp, uncPath, pickBackupName, STORE_COMMERCE_PROGRAM }
