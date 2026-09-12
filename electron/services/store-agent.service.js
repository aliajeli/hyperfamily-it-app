const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { withTimeout } = require('./async-fs')
const { checkReachable } = require('./reachability.service')
const { SmbSessionManager } = require('./smb.service')
const { AgentControl, AGENT_EXE, normalizeHost } = require('./agent-control.service')
const { hashFile, copyFile, formatProgress, cancelledError, isCancelled } = require('./agent-transfer.service')

/**
 * VPN/WAN note (v3.1.2)
 * ---------------------
 * Over a slow FortiClient VPN into a branch, SMB writes (the agent copy) keep
 * working but small reads and SCM calls stretch out. The old constants were
 * LAN-sized — a fixed 12 s cap on the heartbeat read and a 45 s overall wait
 * — so a healthy agent looked invisible and an import stalled at "waiting for
 * the agent" even though bits were arriving. The constants below follow
 * progress instead of elapsed time, same idea as agent-transfer.service.
 */
const HEARTBEAT_MAX_AGE_MS = 120000
const HEARTBEAT_IDLE_READ_MS = 45000
const HEARTBEAT_MAX_READ_MS = 5 * 60 * 1000
const DEFAULT_HEARTBEAT_WAIT_MS = 5 * 60 * 1000
const STAT_TIMEOUT_MS = 30000
const MAX_INVENTORY_BYTES = 8 * 1024 * 1024

/**
 * The import pipeline, in the order the steps really run.
 *
 * The dialog renders one row per key with a status colour, exactly like the
 * Deploy dialog, so the labels live here rather than in the renderer: adding a
 * phase on the service side is enough to show it in the UI.
 */
const AGENT_IMPORT_STEPS = [
  { key: 'source', label: 'Bundled agent', description: 'SHA-256 of the EXE that ships with this app' },
  { key: 'target', label: 'Target paths', description: 'C:\\Agent and its permissions on the checkout' },
  { key: 'lock', label: 'Import lock', description: 'Only one importer may replace the agent at a time' },
  { key: 'compare', label: 'SHA-256 comparison', description: 'Installed agent against the bundled one' },
  { key: 'copy', label: 'Copying agent', description: 'Staged copy plus read-back verification' },
  { key: 'service', label: 'Windows service', description: 'Stopped, configured for automatic startup, started' },
  { key: 'heartbeat', label: 'Fresh heartbeat', description: 'The agent must report a new inventory' },
  { key: 'finish', label: 'Finished', description: 'Service running and the binary verified' }
]

/**
 * Reads the agent heartbeat/inventory over SMB. On a LAN this is instant; on
 * a VPN an 8 MB inventory can stream for minutes. The idle deadline re-arms
 * on every chunk (progress keeps the read alive) — only a genuinely stalled
 * link or an absurd total duration fails.
 */
async function readWithIdleDeadline(file, options = {}) {
  const idleTimeoutMs = options.idleTimeoutMs ?? HEARTBEAT_IDLE_READ_MS
  const maxReadMs = options.maxReadMs ?? HEARTBEAT_MAX_READ_MS
  const maxBytes = options.maxBytes ?? MAX_INVENTORY_BYTES
  const label = options.label || 'Agent heartbeat read'
  const create = options.createReadStream || fs.createReadStream

  let failure = null
  const expire = (stream, idle) => {
    if (failure) return
    failure = new Error(idle
      ? `${label}: no data for ${Math.round(idleTimeoutMs / 1000)} s — the SMB/VPN link stalled; check the branch connection and retry`
      : `${label}: exceeded the ${Math.round(maxReadMs / 60000)}-minute read window on a slowly progressing link`)
    stream.destroy(failure)
  }

  const input = create(file, { highWaterMark: 256 * 1024 })
  let idleTimer = setTimeout(() => expire(input, true), idleTimeoutMs)
  const maxTimer = setTimeout(() => expire(input, false), maxReadMs)
  const chunks = []
  let bytes = 0
  try {
    for await (const chunk of input) {
      bytes += chunk.length
      if (bytes > maxBytes) throw new Error('Agent inventory is too large')
      chunks.push(chunk)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => expire(input, true), idleTimeoutMs)
    }
  } finally {
    clearTimeout(idleTimer)
    clearTimeout(maxTimer)
  }
  if (failure) throw failure
  return Buffer.concat(chunks)
}

/**
 * Pauses between heartbeat polls, but answers a Stop immediately.
 *
 * Two cases matter: the signal may already be aborted when the wait starts (an
 * abort dispatches its event only once, so a listener added afterwards would
 * never fire), and it may abort while waiting. Both reject with the same
 * cancellation error the importer rolls back on. Injectable delays keep the
 * behaviour testable without a wall-clock race.
 */
function abortablePause(pause, ms, signal) {
  if (signal?.aborted) return Promise.reject(cancelledError('Agent import'))
  return pause(ms, undefined, signal ? { signal } : undefined)
}

async function optionalStat(file) {
  try { return await withTimeout(fsp.lstat(file), STAT_TIMEOUT_MS, 'Timed out accessing the agent files; the link to the checkout is very slow or down') }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

function validateSnapshot(raw, now = Date.now()) {
  const data = JSON.parse(String(raw).replace(/^\uFEFF/, ''))
  if (!data || data.protocolVersion !== 1 || data.state !== 'running' ||
      !Number.isInteger(data.pid) || data.pid <= 0 || !data.instanceId ||
      !Array.isArray(data.programs) || data.programs.length > 20000 ||
      data.programs.some((row) => !row || typeof row.name !== 'string' || typeof row.version !== 'string')) {
    throw new Error('The agent heartbeat/inventory has an unsupported format; Import Agent again')
  }
  const at = Date.parse(data.generatedAt)
  if (!Number.isFinite(at) || now - at > HEARTBEAT_MAX_AGE_MS || at - now > HEARTBEAT_MAX_AGE_MS) {
    throw new Error('Agent heartbeat is stale or the checkout clock is out of sync; check the service and Windows time')
  }
  return data
}

class StoreAgentService {
  constructor(options = {}) {
    this.platform = options.platform || process.platform
    this.realFs = this.platform === 'win32' || Boolean(options.agentPathMapper)
    this.sourcePath = options.sourcePath || path.join(__dirname, '../../agent/build', AGENT_EXE)
    this.mapPath = options.agentPathMapper || ((host, relative = '') => `\\\\${normalizeHost(host)}\\C$\\Agent${relative ? `\\${relative.replace(/\//g, '\\')}` : ''}`)
    this.control = options.control || new AgentControl()
    this.smb = options.smb || new SmbSessionManager({ platform: this.platform })
    this.getCredentials = options.getCredentials || (() => null)
    this.reach = options.reach || checkReachable
    this.hash = options.hash || hashFile
    this.copy = options.copy || copyFile
    this.transferOptions = options.transferOptions || {}
    this.now = options.now || Date.now
    this.send = options.send || (() => {})
    this.locks = new Map()
    // Active runs, keyed by runId, so the Stop button can reach one specific
    // import (a single checkout or a whole batch) while others keep going.
    this.runs = new Map()
    // Five minutes, not 45 s: over a VPN every inspect below carries one slow
    // SCM query plus a slow SMB read, so the first service starts can need
    // several polls before a fresh heartbeat is even visible.
    this.heartbeatWaitMs = options.heartbeatWaitMs || DEFAULT_HEARTBEAT_WAIT_MS
    this.heartbeatPollMs = options.heartbeatPollMs || 1500
    this.delay = options.delay || delay
  }

  /* ---------------------------------------------------------- cancellation */

  /**
   * Starts (or adopts) a cancellable run and returns its handle.
   *
   * A batch passes the same id for every checkout, so the first call creates
   * the run (`owns: true`) and the later ones adopt it — only the owner
   * releases it, otherwise the batch would lose its Stop target halfway.
   */
  registerRun(runId) {
    const id = runId || `agent-${Date.now()}-${crypto.randomUUID()}`
    let run = this.runs.get(id)
    if (!run) {
      run = { id, controller: new AbortController(), startedAt: this.now(), owns: true }
      this.runs.set(id, run)
    } else {
      run = { ...run, owns: false }
    }
    return run
  }

  releaseRun(runId) {
    if (runId) this.runs.delete(runId)
  }

  /**
   * Asks a live import to stop. The in-flight SMB operation is aborted, the
   * importer rolls the checkout back to its previous executable/service and
   * the run reports `cancelled: true`. Stopping a run that already finished is
   * a no-op, so the button can never fail confusingly.
   */
  cancel(runId) {
    const run = this.runs.get(String(runId || ''))
    if (!run) return { cancelled: false, active: false }
    if (!run.controller.signal.aborted) run.controller.abort()
    return { cancelled: true, active: true, runId: run.id }
  }

  /** How many imports are in flight right now (used by the UI). */
  activeRuns() {
    return [...this.runs.values()].map((run) => ({ runId: run.id, startedAt: run.startedAt }))
  }

  /** True when this run was stopped by the operator. */
  isCancelled(signal) { return Boolean(signal?.aborted) }

  /** Throws the shared cancellation error once the operator has pressed Stop. */
  throwIfCancelled(signal, label = 'Agent import') {
    if (signal?.aborted) throw cancelledError(label)
  }

  async inspect(host) {
    try {
      // Check existence and actual SCM state BEFORE accepting any stored version.
      const exe = await optionalStat(this.mapPath(host, AGENT_EXE))
      if (!exe?.isFile() || exe.isSymbolicLink()) return { running: false, reason: 'Agent executable is missing; use Import Agent' }
      const service = await this.control.query(host)
      if (!service.exists || service.state !== 'Running') return { running: false, reason: `Agent service is ${service.state || 'not installed'}; use Import Agent to start it` }
      const file = this.mapPath(host, 'data/inventory.json')
      const stat = await optionalStat(file)
      if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > MAX_INVENTORY_BYTES) return { running: false, reason: 'Agent has not produced a readable heartbeat yet' }
      // Publication is an atomic rename, so a read never sees a torn file;
      // only the speed of the link decides how long it takes.
      const raw = await readWithIdleDeadline(file, { label: `Agent heartbeat read on ${host}` })
      return { running: true, ...validateSnapshot(raw.toString('utf8'), this.now()) }
    } catch (error) {
      return { running: false, reason: error.message }
    }
  }

  async waitForHeartbeat(host, expectedHash, verifyOptions, onWait, signal) {
    const startedAt = this.now()
    const end = startedAt + this.heartbeatWaitMs
    do {
      this.throwIfCancelled(signal, `Waiting for the agent heartbeat on ${host}`)
      const result = await this.inspect(host)
      if (result.running) {
        if (await this.hash(this.mapPath(host, AGENT_EXE), verifyOptions) !== expectedHash) throw new Error('Agent SHA-256 changed after installation')
        // A WAN hash read can take minutes. Re-check liveness AFTER it rather
        // than returning the heartbeat sampled before the long read.
        const latest = await this.inspect(host)
        if (!latest.running) throw new Error(`Agent stopped responding during final SHA-256 verification on ${host}: ${latest.reason || 'no fresh heartbeat'}`)
        return latest
      }
      try { onWait?.(this.now() - startedAt, result.reason) } catch { /* UI hints must not break the wait */ }
      // `signal` also aborts the pause itself, so Stop is answered at once
      // instead of after the next poll interval. Node rejects the wait with a
      // plain AbortError, which is translated into the cancellation error the
      // importer reports and rolls back on.
      try { await abortablePause(this.delay, this.heartbeatPollMs, signal) }
      catch (error) { if (signal?.aborted) throw cancelledError(`Waiting for the agent heartbeat on ${host}`); throw error }
    } while (this.now() < end)
    throw new Error(`Agent service started but no fresh heartbeat arrived within ${Math.round(this.heartbeatWaitMs / 60000)} min; over a slow VPN the first inventory can take minutes — check C:\\Agent\\data permissions, the checkout clock and that the service stays Running, then retry Import Agent`)
  }

  /**
   * Imports the agent onto one checkout.
   *
   * `runId` ties the call to a cancellable run; a batch passes the same id for
   * every checkout so one Stop halts the whole batch. Called on its own, the
   * run is created here and released when the import settles.
   */
  async importOne(checkout, options = {}) {
    const startedAt = Date.now()
    const steps = []
    // Pipeline steps still open when the run ends; they are closed as 'done'
    // (or 'skipped' on a cancel) so the dialog never shows a step spinning
    // forever after the operation has settled.
    const open = new Map()
    const emit = (entry) => {
      steps.push(entry)
      this.send('store-update:agent-step', { checkoutId: checkout.id, name: checkout.name, ...entry })
    }
    const record = (step, detail, progress, status = 'done') => {
      const at = new Date().toISOString()
      const base = { step, detail, at }
      const last = steps.at(-1)
      // Progress samples replace the live row instead of filling the log.
      if (progress && last?.progress && last.step === step) {
        steps[steps.length - 1] = { ...base, status: 'running', progress }
        this.send('store-update:agent-step', { checkoutId: checkout.id, name: checkout.name, ...steps[steps.length - 1] })
        return
      }
      if (progress) { open.set(step, true); emit({ ...base, status: 'running', progress }); return }
      if (open.has(step)) { open.delete(step); emit({ ...base, status: 'skipped' }); return }
      emit({ ...base, status })
    }
    /** Ends every step that never reported a final status. */
    const flushOpen = (status) => {
      for (const step of [...open.keys()]) { open.delete(step); emit({ step, detail: status === 'done' ? 'Completed' : 'Not reached', at: new Date().toISOString(), status }) }
    }

    // The caller (a batch, or the IPC layer relaying the dialog's run id) may
    // already own the run; otherwise this call creates and releases it.
    const ownRun = options.signal ? null : this.registerRun(options.runId)
    const signal = options.signal || ownRun.controller.signal
    try {
      if (!this.realFs) throw new Error('Agent import is only available on Windows')
      this.throwIfCancelled(signal, 'Agent import')
      const requested = normalizeHost(checkout.ip || checkout.hostname)
      const reachable = await this.reach(requested, { timeoutMs: 3000, candidates: [checkout.ip, checkout.hostname], signal })
      this.throwIfCancelled(signal, 'Agent import')
      if (reachable.status === 'offline') throw new Error(reachable.detail || 'Checkout is unreachable')
      const host = normalizeHost(reachable.host || requested)
      // Lock by the address that answered, so duplicate IP/name requests cannot
      // concurrently stop or overwrite the same service in this app instance.
      const key = host.toLowerCase()
      if (this.locks.has(key)) throw new Error('An agent import is already running on this checkout')
      const operation = this.smb.withHost(host, this.getCredentials(), () => this.install(host, record, { signal }))
      this.locks.set(key, operation)
      let result
      try { result = await operation } finally { if (this.locks.get(key) === operation) this.locks.delete(key) }
      this.throwIfCancelled(signal, 'Agent import')
      flushOpen('done')
      return { checkoutId: checkout.id, name: checkout.name, host, ok: true, ...result, steps, durationMs: Date.now() - startedAt }
    } catch (error) {
      const cancelled = isCancelled(error) || this.isCancelled(signal)
      flushOpen(cancelled ? 'skipped' : 'done')
      record(cancelled ? 'cancelled' : 'failed', cancelled ? 'Stopped by the operator; the previous agent was left in place' : error.message)
      return {
        checkoutId: checkout.id, name: checkout.name, ok: false, cancelled,
        error: cancelled ? 'Import stopped by the operator' : error.message,
        code: cancelled ? 'AGENT_IMPORT_CANCELLED' : error.code,
        phase: error.phase, steps, durationMs: Date.now() - startedAt
      }
    } finally {
      if (ownRun?.owns) this.releaseRun(ownRun.id)
    }
  }

  async install(host, record, options = {}) {
    const signal = options.signal
    this.throwIfCancelled(signal, `Import to ${host}`)
    record('source', `Checking the bundled agent before import to ${host}`, null, 'running')
    const source = await optionalStat(this.sourcePath)
    if (!source?.isFile()) throw new Error('The bundled agent EXE is missing. Install the full desktop package or run npm run build:agent')
    const transfer = (label, totalBytes) => ({
      ...this.transferOptions, label: `${label} on ${host}`, totalBytes, signal,
      onProgress: (progress) => record('source', `${label}: ${formatProgress(progress)}`, progress)
    })
    const expectedHash = await this.hash(this.sourcePath, transfer('Hashing bundled agent', source.size))
    record('source', `Bundled agent SHA-256: ${expectedHash}`)
    this.throwIfCancelled(signal, `Import to ${host}`)
    const target = this.mapPath(host, AGENT_EXE)
    const directory = this.mapPath(host)
    const dataDirectory = this.mapPath(host, 'data')
    record('target', `Checking agent paths and permissions on ${host}`, null, 'running')
    for (const file of [directory, dataDirectory, target]) {
      const stat = await optionalStat(file)
      if (stat?.isSymbolicLink()) throw new Error('Agent files/directories must not be symlinks or junctions')
    }
    await fsp.mkdir(dataDirectory, { recursive: true })
    record('target', `Preparing protected agent directories on ${host}`, null, 'running')
    await this.control.secureDirectories(host)
    record('target', 'Agent directories verified and protected')
    // An exclusive on-target lock also protects imports from OTHER workstations.
    // Never auto-delete an existing lock: an administrator can investigate a
    // crashed importer rather than risk two simultaneous binary replacements.
    const lockPath = this.mapPath(host, 'import.lock')
    record('lock', `Acquiring the agent import lock on ${host}`, null, 'running')
    let lock
    try { lock = await fsp.open(lockPath, 'wx') }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Agent import is locked on the target. Wait for the other importer; if it crashed, have IT remove C:\\Agent\\import.lock'); throw error }
    record('lock', 'Import lock acquired')
    const nonce = crypto.randomUUID()
    const stage = this.mapPath(host, `${AGENT_EXE}.${nonce}.new`)
    const backup = this.mapPath(host, `${AGENT_EXE}.${nonce}.previous`)
    let backedUp = false
    let replaced = false
    let serviceTouched = false
    let createdService = false
    let complete = false
    let previous = { exists: false, state: 'Missing' }
    try {
      this.throwIfCancelled(signal, `Import to ${host}`)
      record('compare', `Checking the existing Windows agent service on ${host}`, null, 'running')
      previous = await this.control.query(host)
      if (previous.exists) await this.control.assertOwnedService(host)
      const targetStat = await optionalStat(target)
      if (targetStat && !targetStat.isFile()) throw new Error('The agent executable path is not a regular file')
      if (targetStat) record('compare', `Reading installed agent SHA-256 over SMB from ${host} (${targetStat.size} bytes); slow but progressing reads are allowed`, null, 'running')
      const installedHash = targetStat ? await this.hash(target, { ...transfer('Reading installed agent SHA-256', targetStat.size), onProgress: (progress) => record('compare', `Reading installed agent SHA-256: ${formatProgress(progress)}`, progress) }) : null
      const copied = installedHash !== expectedHash
      record('compare', installedHash ? (copied ? 'SHA-256 mismatch — replacement required' : 'SHA-256 matches — copy skipped') : 'Agent EXE is missing — copy required')
      this.throwIfCancelled(signal, `Import to ${host}`)
      if (copied) {
        record('copy', `Copying the staged agent to ${host}`, null, 'running')
        await this.copy(this.sourcePath, stage, { ...transfer('Copying staged agent', source.size), onProgress: (progress) => record('copy', `Copying staged agent: ${formatProgress(progress)}`, progress) })
        record('copy', 'Reading back the staged copy to verify SHA-256', null, 'running')
        if (await this.hash(stage, { ...transfer('Verifying staged agent SHA-256', source.size), onProgress: (progress) => record('copy', `Verifying staged agent SHA-256: ${formatProgress(progress)}`, progress) }) !== expectedHash) throw new Error('Copied agent failed SHA-256 verification; the existing service was not changed')
        record('copy', 'Staged agent copied and SHA-256 verified')
      }
      this.throwIfCancelled(signal, `Import to ${host}`)
      record('service', 'Configuring the automatic Windows service', null, 'running')
      // Stop even on a matching binary to apply the least-privilege account and
      // automatic startup consistently, without copying the EXE again.
      if (previous.exists) { record('service', `Stopping the verified agent service on ${host}`, null, 'running'); serviceTouched = true; await this.control.stop(host) }
      // Remove old data so a successful restart cannot pass on an old heartbeat.
      await fsp.unlink(this.mapPath(host, 'data/inventory.json')).catch((error) => { if (error.code !== 'ENOENT') throw error })
      if (copied) {
        if (targetStat) { await fsp.rename(target, backup); backedUp = true }
        await fsp.rename(stage, target)
        replaced = true
      }
      serviceTouched = true
      // Mark before create: configuration can fail AFTER create succeeded.
      createdService = !previous.exists
      await this.control.configure(host, previous.exists)
      record('service', 'Automatic startup, LocalService account and failure recovery configured', null, 'running')
      this.throwIfCancelled(signal, `Import to ${host}`)
      await this.control.start(host)
      record('service', 'Agent service started')
      record('heartbeat', `Waiting for a fresh agent heartbeat from ${host}; over a slow VPN this can take several minutes — final SHA-256 verification follows`, null, 'running')
      const heartbeat = await this.waitForHeartbeat(host, expectedHash, { ...transfer('Verifying running agent SHA-256', source.size), onProgress: (progress) => record('heartbeat', `Verifying running agent SHA-256: ${formatProgress(progress)}`, progress) },
        (elapsedMs, reason) => record('heartbeat', `Still waiting for the agent heartbeat on ${host} (${Math.round(elapsedMs / 1000)} s; ${reason || 'no fresh inventory yet'})`),
        signal)
      record('heartbeat', 'A fresh agent heartbeat was verified')
      record('finish', `Service is Running on ${host} and the agent binary is verified`)
      complete = true
      if (backedUp) await fsp.unlink(backup).catch(() => {})
      return { copied, sha256: expectedHash, agentVersion: heartbeat.agentVersion, state: 'running' }
    } catch (error) {
      const cancelled = isCancelled(error) || this.isCancelled(signal)
      if (serviceTouched || replaced || backedUp) {
        try {
          // Rollback ignores the cancellation: leaving a half-replaced binary
          // or a stopped service behind would be worse than the extra seconds.
          await this.control.stop(host)
          if (replaced) await fsp.unlink(target)
          if (backedUp) { await fsp.rename(backup, target); backedUp = false }
          if (createdService) await this.control.remove(host)
          else if (previous.state === 'Running') await this.control.start(host)
          record('rollback', cancelled ? 'Stopped by the operator — previous executable and service restored' : 'Previous executable/service restored where present')
        } catch (rollbackError) {
          throw new Error(`${error.message}. Rollback needs administrator attention: ${rollbackError.message}${backedUp ? `; preserved binary: ${backup}` : ''}`)
        }
      } else if (cancelled) {
        record('rollback', 'Stopped before the installed agent was touched — nothing to restore')
      }
      throw error
    } finally {
      await fsp.unlink(stage).catch(() => {})
      // Keep a previous binary if rollback could not safely finish.
      await lock.close()
      await fsp.unlink(lockPath).catch(() => {})
      if (!complete) record('import', 'Import did not complete; inspect the failure details')
    }
  }

  /**
   * Serial batch import. One Stop cancels the checkout in flight and every
   * checkout still waiting; the ones already finished keep their result.
   */
  async importAll(checkouts, options = {}) {
    const list = Array.isArray(checkouts) ? checkouts : []
    const ownRun = options.signal ? null : this.registerRun(options.runId)
    const runId = options.runId || ownRun.id
    const signal = options.signal || ownRun.controller.signal
    const results = []
    try {
      for (const checkout of list) {
        if (signal.aborted) {
          results.push({ checkoutId: checkout.id, name: checkout.name, ok: false, cancelled: true, skipped: true, error: 'Skipped — the import was stopped', steps: [], durationMs: 0 })
          continue
        }
        results.push(await this.importOne(checkout, { ...options, runId, signal }))
      }
      // `cancelled` counts the checkouts that were actually in flight when Stop
      // was pressed and had to be rolled back; `skipped` counts the ones that
      // never started. Both carry `cancelled: true` on the row itself.
      const skipped = results.filter((row) => row.skipped).length
      const cancelled = results.filter((row) => row.cancelled && !row.skipped).length
      return {
        runId,
        total: list.length,
        ok: results.filter((row) => row.ok).length,
        failed: results.filter((row) => !row.ok && !row.cancelled).length,
        cancelled,
        skipped,
        cancelledByOperator: signal.aborted,
        results
      }
    } finally {
      if (ownRun?.owns) this.releaseRun(ownRun.id)
    }
  }
}

module.exports = {
  StoreAgentService, validateSnapshot, readWithIdleDeadline, hashFile, copyFile,
  AGENT_IMPORT_STEPS, HEARTBEAT_MAX_AGE_MS, DEFAULT_HEARTBEAT_WAIT_MS
}
