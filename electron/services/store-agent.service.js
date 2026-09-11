const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { withTimeout } = require('./async-fs')
const { checkReachable } = require('./reachability.service')
const { SmbSessionManager } = require('./smb.service')
const { AgentControl, AGENT_EXE, normalizeHost } = require('./agent-control.service')
const { hashFile, copyFile, formatProgress } = require('./agent-transfer.service')

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
    // Five minutes, not 45 s: over a VPN every inspect below carries one slow
    // SCM query plus a slow SMB read, so the first service starts can need
    // several polls before a fresh heartbeat is even visible.
    this.heartbeatWaitMs = options.heartbeatWaitMs || DEFAULT_HEARTBEAT_WAIT_MS
    this.heartbeatPollMs = options.heartbeatPollMs || 1500
    this.delay = options.delay || delay
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

  async waitForHeartbeat(host, expectedHash, verifyOptions, onWait) {
    const startedAt = this.now()
    const end = startedAt + this.heartbeatWaitMs
    do {
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
      await this.delay(this.heartbeatPollMs)
    } while (this.now() < end)
    throw new Error(`Agent service started but no fresh heartbeat arrived within ${Math.round(this.heartbeatWaitMs / 60000)} min; over a slow VPN the first inventory can take minutes — check C:\\Agent\\data permissions, the checkout clock and that the service stays Running, then retry Import Agent`)
  }

  async importOne(checkout) {
    const startedAt = Date.now()
    const steps = []
    const record = (step, detail, progress) => {
      const entry = { step, detail, at: new Date().toISOString(), ...(progress ? { progress } : {}) }
      // Replace live samples rather than keeping hours of progress log lines.
      if (progress && steps.at(-1)?.progress && steps.at(-1).step === step) steps[steps.length - 1] = entry
      else steps.push(entry)
      this.send('store-update:agent-step', { checkoutId: checkout.id, name: checkout.name, ...entry })
    }
    try {
      if (!this.realFs) throw new Error('Agent import is only available on Windows')
      const requested = normalizeHost(checkout.ip || checkout.hostname)
      const reachable = await this.reach(requested, { timeoutMs: 3000, candidates: [checkout.ip, checkout.hostname] })
      if (reachable.status === 'offline') throw new Error(reachable.detail || 'Checkout is unreachable')
      const host = normalizeHost(reachable.host || requested)
      // Lock by the address that answered, so duplicate IP/name requests cannot
      // concurrently stop or overwrite the same service in this app instance.
      const key = host.toLowerCase()
      if (this.locks.has(key)) throw new Error('An agent import is already running on this checkout')
      const operation = this.smb.withHost(host, this.getCredentials(), () => this.install(host, record))
      this.locks.set(key, operation)
      let result
      try { result = await operation } finally { if (this.locks.get(key) === operation) this.locks.delete(key) }
      return { checkoutId: checkout.id, name: checkout.name, host, ok: true, ...result, steps, durationMs: Date.now() - startedAt }
    } catch (error) {
      record('failed', error.message)
      return { checkoutId: checkout.id, name: checkout.name, ok: false, error: error.message, code: error.code, phase: error.phase, steps, durationMs: Date.now() - startedAt }
    }
  }

  async install(host, record) {
    record('source-check', `Checking the bundled agent before import to ${host}`)
    const source = await optionalStat(this.sourcePath)
    if (!source?.isFile()) throw new Error('The bundled agent EXE is missing. Install the full desktop package or run npm run build:agent')
    const transfer = (step, label, totalBytes) => ({
      ...this.transferOptions, label: `${label} on ${host}`, totalBytes,
      onProgress: (progress) => record(step, `${label}: ${formatProgress(progress)}`, progress)
    })
    const expectedHash = await this.hash(this.sourcePath, transfer('source-hash', 'Hashing bundled agent', source.size))
    record('source', `Bundled agent SHA-256: ${expectedHash}`)
    const target = this.mapPath(host, AGENT_EXE)
    const directory = this.mapPath(host)
    const dataDirectory = this.mapPath(host, 'data')
    record('target', `Checking agent paths and permissions on ${host}`)
    for (const file of [directory, dataDirectory, target]) {
      const stat = await optionalStat(file)
      if (stat?.isSymbolicLink()) throw new Error('Agent files/directories must not be symlinks or junctions')
    }
    await fsp.mkdir(dataDirectory, { recursive: true })
    record('permissions', `Preparing protected agent directories on ${host}`)
    await this.control.secureDirectories(host)
    // An exclusive on-target lock also protects imports from OTHER workstations.
    // Never auto-delete an existing lock: an administrator can investigate a
    // crashed importer rather than risk two simultaneous binary replacements.
    const lockPath = this.mapPath(host, 'import.lock')
    record('lock', `Acquiring the agent import lock on ${host}`)
    let lock
    try { lock = await fsp.open(lockPath, 'wx') }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Agent import is locked on the target. Wait for the other importer; if it crashed, have IT remove C:\\Agent\\import.lock'); throw error }
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
      record('service-check', `Checking the existing Windows agent service on ${host}`)
      previous = await this.control.query(host)
      if (previous.exists) await this.control.assertOwnedService(host)
      const targetStat = await optionalStat(target)
      if (targetStat && !targetStat.isFile()) throw new Error('The agent executable path is not a regular file')
      if (targetStat) record('compare-hash', `Reading installed agent SHA-256 over SMB from ${host} (${targetStat.size} bytes); slow but progressing reads are allowed`)
      const installedHash = targetStat ? await this.hash(target, transfer('compare-hash', 'Reading installed agent SHA-256', targetStat.size)) : null
      const copied = installedHash !== expectedHash
      record('compare', installedHash ? (copied ? 'SHA-256 mismatch — replacement required' : 'SHA-256 matches — copy skipped') : 'Agent EXE is missing — copy required')
      if (copied) {
        record('copy', `Copying the staged agent to ${host}`)
        await this.copy(this.sourcePath, stage, transfer('copy', 'Copying staged agent', source.size))
        record('verify-copy', `Reading back the staged copy from ${host} to verify SHA-256`)
        if (await this.hash(stage, transfer('verify-copy', 'Verifying staged agent SHA-256', source.size)) !== expectedHash) throw new Error('Copied agent failed SHA-256 verification; the existing service was not changed')
        record('copy', 'Staged agent copied and SHA-256 verified')
      }
      // Stop even on a matching binary to apply the least-privilege account and
      // automatic startup consistently, without copying the EXE again.
      if (previous.exists) { record('stop', `Stopping the verified agent service on ${host}`); serviceTouched = true; await this.control.stop(host) }
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
      record('configure', `Configuring the automatic agent service on ${host}`)
      await this.control.configure(host, previous.exists)
      record('startup', 'Windows Service configured: Automatic startup, LocalService account, failure recovery')
      await this.control.start(host)
      record('heartbeat', `Waiting for a fresh agent heartbeat from ${host}; over a slow VPN this can take several minutes — final SHA-256 verification follows`)
      const heartbeat = await this.waitForHeartbeat(host, expectedHash, transfer('verify-running', 'Verifying running agent SHA-256', source.size),
        (elapsedMs, reason) => record('heartbeat', `Still waiting for the agent heartbeat on ${host} (${Math.round(elapsedMs / 1000)} s; ${reason || 'no fresh inventory yet'})`, { elapsedSeconds: Math.round(elapsedMs / 1000) }))
      record('running', 'Service is Running and a fresh agent heartbeat was verified')
      complete = true
      if (backedUp) await fsp.unlink(backup).catch(() => {})
      return { copied, sha256: expectedHash, agentVersion: heartbeat.agentVersion, state: 'running' }
    } catch (error) {
      if (serviceTouched || replaced || backedUp) {
        try {
          await this.control.stop(host)
          if (replaced) await fsp.unlink(target)
          if (backedUp) { await fsp.rename(backup, target); backedUp = false }
          if (createdService) await this.control.remove(host)
          else if (previous.state === 'Running') await this.control.start(host)
          record('rollback', 'Previous executable/service restored where present')
        } catch (rollbackError) {
          throw new Error(`${error.message}. Rollback needs administrator attention: ${rollbackError.message}${backedUp ? `; preserved binary: ${backup}` : ''}`)
        }
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

  async importAll(checkouts) {
    const results = []
    for (const checkout of checkouts) results.push(await this.importOne(checkout))
    return { total: results.length, ok: results.filter((row) => row.ok).length, failed: results.filter((row) => !row.ok).length, results }
  }
}

module.exports = { StoreAgentService, validateSnapshot, readWithIdleDeadline, hashFile, copyFile, HEARTBEAT_MAX_AGE_MS, DEFAULT_HEARTBEAT_WAIT_MS }
