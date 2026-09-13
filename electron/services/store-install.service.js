const { checkReachable } = require('./reachability.service')
const { SmbSessionManager } = require('./smb.service')
const { StoreAgentService } = require('./store-agent.service')
const { AgentCommands, INSTALL_TIMEOUT_MS } = require('./agent-commands')
const { uncPath } = require('./store-update.service')
const { probeAsync, withTimeout } = require('./async-fs')
const { compareVersions } = require('./version')

/**
 * "Update Store Commerce" — the guided per-checkout installation pipeline.
 *
 * The flow the operators asked for, narrated exactly like Deploy:
 *   1. reachability  — is the checkout answering on SMB?
 *   2. agent         — is the HyperFamily Agent service alive (and new enough)?
 *   3. running-check — is Store Commerce open right now?
 *   4. close         — if yes: ask it to close, force-stop what refuses
 *   5. verify-closed — prove it is really gone before touching files
 *   6. file-check    — is Hyper.StoreCommerce.Installer.exe in the deploy folder?
 *   7. install       — the agent runs it with its `install` argument as SYSTEM
 *                      (no UAC, no
 *                      signed-in user needed) and captures the exit code and
 *                      everything the installer printed
 *   8. version       — the Store Commerce version afterwards, on success AND
 *                      on failure, so the operator always sees where the
 *                      checkout ended up.
 *
 * Every step is injected the same way StoreUpdateService does it, so the whole
 * pipeline is unit-testable on any platform.
 */

const INSTALLER_FILE = 'Hyper.StoreCommerce.Installer.exe'
/** Command channel support shipped with this agent version. */
const MIN_COMMAND_AGENT = '3.1.4'
const REACH_TIMEOUT_MS = 3000
const STEP_TIMEOUT_MS = 90 * 1000

const PIPELINE = [
  { key: 'reachability', label: 'Connection check' },
  { key: 'agent', label: 'Agent check' },
  { key: 'running-check', label: 'Store Commerce running?' },
  { key: 'close', label: 'Close Store Commerce' },
  { key: 'verify-closed', label: 'Closed verification' },
  { key: 'file-check', label: 'Installer file check' },
  { key: 'install', label: 'Run installer (install)' },
  { key: 'version', label: 'Store Commerce version' }
]

class StoreInstallService {
  constructor(sendEvent, options = {}) {
    this.sendEvent = typeof sendEvent === 'function' ? sendEvent : () => {}
    this.platform = options.platform || process.platform
    this.reach = options.reach || checkReachable
    this.reachTimeoutMs = options.reachTimeoutMs || REACH_TIMEOUT_MS
    this.stepTimeoutMs = options.stepTimeoutMs || STEP_TIMEOUT_MS
    this.probe = options.probe || probeAsync
    this.mapDestination = options.destinationMapper || uncPath
    this.smb = options.smb || new SmbSessionManager({ platform: this.platform })
    this.getCredentials = typeof options.getCredentials === 'function' ? options.getCredentials : () => null
    this.agent = options.agent || new StoreAgentService({
      platform: this.platform, smb: this.smb, getCredentials: this.getCredentials,
      reach: this.reach, send: this.sendEvent, agentPathMapper: options.agentPathMapper
    })
    this.commands = options.commands || new AgentCommands({ agentPathMapper: options.agentPathMapper })
    this.installerFile = options.installerFile || INSTALLER_FILE
    this.minCommandAgent = options.minCommandAgent || MIN_COMMAND_AGENT
    this.realFs = this.platform === 'win32' || Boolean(options.destinationMapper || options.agentPathMapper)
    /** runId → { controller, owns } — the Stop button aborts the batch between steps. */
    this.runs = new Map()
  }

  emit(channel, payload) { this.sendEvent(channel, payload) }

  #hostOf(checkout) { return String(checkout?.ip || checkout?.hostname || '').trim() }

  #labelOf(checkout) {
    const name = String(checkout?.hostname || '').trim()
    const ip = String(checkout?.ip || '').trim()
    if (name && ip && name !== ip) return `${name} (${ip})`
    return name || ip || 'checkout'
  }

  #registerRun(runId) {
    if (this.runs.has(runId)) return { signal: this.runs.get(runId).controller.signal, owns: false }
    const controller = new AbortController()
    this.runs.set(runId, { controller, owns: true })
    return { signal: controller.signal, owns: true }
  }

  #releaseRun(runId, owns) { if (owns) this.runs.delete(runId) }

  /** Stop button: aborts the batch between steps and while waiting for answers. */
  cancel(runId) {
    const run = this.runs.get(String(runId || ''))
    if (!run) return { cancelled: false }
    run.controller.abort()
    return { cancelled: true }
  }

  activeRuns() { return [...this.runs.keys()] }

  #throwIfCancelled(signal, label = 'The Store Commerce update') {
    if (signal?.aborted) {
      const error = new Error(`${label} was stopped by the operator`)
      error.cancelled = true
      throw error
    }
  }

  /**
   * The full install pipeline for ONE checkout. The return value carries the
   * whole timeline plus the command answer (exit code, installer output,
   * versions before/after) for the per-checkout info popup.
   */
  async installOne(checkout, options = {}) {
    if (!this.realFs) throw new Error('Updating Store Commerce is only available on Windows')
    const destinationPath = String(options.destinationPath || '').trim()
    if (!destinationPath) throw new Error('Set the deploy destination folder in Settings → Store App first')
    const runId = options.runId || `install-single-${Date.now()}`
    const { signal, owns } = this.#registerRun(runId)
    const host = this.#hostOf(checkout)
    const startedAt = Date.now()
    const steps = []
    const record = (step, status, detail) => {
      const entry = { step, status, detail: detail || '', at: new Date().toISOString() }
      steps.push(entry)
      this.emit('store-update:install-step', { runId, checkoutId: checkout.id, name: checkout.name, ...entry })
      return entry
    }
    const finish = (ok, extra = {}) => ({
      checkoutId: checkout.id, name: checkout.name, host, ok, steps,
      durationMs: Date.now() - startedAt, ...extra
    })

    try {
      // 1 --- connectivity (SMB 445, the port everything below uses) -------
      record('reachability', 'running', `Checking file sharing on ${this.#labelOf(checkout)}…`)
      const reach = await this.reach(host, {
        timeoutMs: this.reachTimeoutMs,
        candidates: [checkout?.ip, checkout?.hostname]
      }).catch((error) => ({ status: 'offline', detail: error.message }))
      if (reach.status === 'offline') {
        record('reachability', 'failed', reach.detail || `${host} is not reachable over SMB`)
        return finish(false, { error: 'Checkout unreachable' })
      }
      record('reachability', 'done', reach.detail || `${host} answered in ${reach.ping_time ?? 1} ms`)
      const address = reach.host || host

      const credentials = this.getCredentials()
      return await this.smb.withHost(address, credentials, async () => {
        // 2 --- agent presence ---------------------------------------------
        record('agent', 'running', 'Checking the HyperFamily Agent service…')
        const inventory = await withTimeout(this.agent.inspect(address), this.stepTimeoutMs, `The agent on ${address} did not answer in time`)
        if (!inventory.running) {
          record('agent', 'failed', inventory.reason || 'Agent is not running')
          return finish(false, { error: 'Agent is not running — use Import Agent first' })
        }
        if (compareVersions(inventory.agentVersion || '0', this.minCommandAgent) < 0) {
          record('agent', 'failed', `Agent ${inventory.agentVersion || 'unknown'} does not support remote commands yet`)
          return finish(false, { error: `Agent ${inventory.agentVersion || 'unknown'} is too old — run Import Agent to update it` })
        }
        record('agent', 'done', `Agent ${inventory.agentVersion} is running`)

        // 3 --- is Store Commerce open? -------------------------------------
        record('running-check', 'running', 'Asking the agent whether Store Commerce is open…')
        const before = await withTimeout(this.commands.sendCommand(address, { action: 'status' }, { signal }), this.stepTimeoutMs, 'The agent did not answer in time')
        const versionBefore = before.version || null
        if (before.running) {
          record('running-check', 'done', `Store Commerce is open — ${before.processes.map((p) => `PID ${p.pid}`).join(', ')}`)

          // 4 --- close it ---------------------------------------------------
          record('close', 'running', 'Asking Store Commerce to close, force-stopping if it refuses…')
          const closed = await withTimeout(this.commands.sendCommand(address, { action: 'close' }, { signal }), this.stepTimeoutMs + 30000, 'The agent did not answer in time')
          if (!closed.ok) {
            record('close', 'failed', closed.error || 'Store Commerce could not be closed')
            return finish(false, { error: 'Store Commerce could not be closed', version: closed.version || versionBefore, versionBefore })
          }
          record('close', 'done', 'Store Commerce was closed')
        } else {
          record('running-check', 'done', 'Store Commerce is not running')
          record('close', 'skipped', 'Store Commerce was already closed')
        }

        // 5 --- verify it is really gone --------------------------------------
        record('verify-closed', 'running', 'Verifying that Store Commerce is closed…')
        const verified = await withTimeout(this.commands.sendCommand(address, { action: 'status' }, { signal }), this.stepTimeoutMs, 'The agent did not answer in time')
        if (verified.running) {
          record('verify-closed', 'failed', `Still running — ${verified.processes.map((p) => `PID ${p.pid}`).join(', ')}`)
          return finish(false, { error: 'Store Commerce is still running', version: verified.version || versionBefore, versionBefore })
        }
        record('verify-closed', 'done', 'No Store Commerce process is left')

        // 6 --- the installer must sit in the deploy folder -------------------
        record('file-check', 'running', `Looking for ${this.installerFile} in ${destinationPath}…`)
        const localInstaller = `${destinationPath.replace(/[\\/]+$/, '')}\\${this.installerFile}`
        let installerStat = null
        try {
          const unc = this.mapDestination(address, localInstaller)
          installerStat = await withTimeout(this.probe(unc), this.stepTimeoutMs, `Reading ${unc} stalled`)
        } catch (error) {
          record('file-check', 'failed', error.message)
          return finish(false, { error: error.message, version: versionBefore, versionBefore })
        }
        if (!installerStat?.reachable) {
          record('file-check', 'failed', installerStat?.error || `Cannot reach ${destinationPath} on ${address}`)
          record('version', 'done', versionBefore ? `Store Commerce v${versionBefore}` : 'Store Commerce is not listed in Programs and Features')
          return finish(false, { error: 'Deploy folder unreachable', version: versionBefore, versionBefore })
        }
        if (!installerStat.exists) {
          record('file-check', 'failed', `${this.installerFile} was not found in ${destinationPath}`)
          // The version is reported on failure too, exactly as after an install.
          record('version', 'done', versionBefore ? `Store Commerce v${versionBefore}` : 'Store Commerce is not listed in Programs and Features')
          return finish(false, { error: `${this.installerFile} not found — deploy it first`, version: versionBefore, versionBefore })
        }
        record('file-check', 'done', `${this.installerFile} (${installerStat.size ?? '?'} bytes) is in ${destinationPath}`)

        // 7 --- run the installer with its `install` argument ------------------
        this.#throwIfCancelled(signal)
        record('install', 'running', `Running ${this.installerFile} install with system rights…`)
        const installed = await withTimeout(
          this.commands.sendCommand(address, { action: 'install', path: localInstaller }, { signal, timeoutMs: INSTALL_TIMEOUT_MS }),
          INSTALL_TIMEOUT_MS + 60000,
          `The installer on ${address} did not report back in time`
        )
        const exitCode = Number.isInteger(installed.exitCode) ? installed.exitCode : null
        const versionAfter = installed.version || null
        if (!installed.ok) {
          record('install', 'failed', installed.error || `The installer exited with code ${exitCode ?? 'unknown'}`)
          // 8 --- the version is reported on failure too ----------------------
          const finalVersion = versionAfter || await this.#safeVersion(address, signal)
          record('version', 'done', finalVersion ? `Store Commerce v${finalVersion}${versionBefore && versionBefore !== finalVersion ? ` (was v${versionBefore})` : ''}` : 'Store Commerce is not listed in Programs and Features')
          return finish(false, {
            error: installed.error || `Installer exit code ${exitCode ?? 'unknown'}`,
            exitCode, output: installed.output || '', timedOut: Boolean(installed.timedOut),
            version: finalVersion, versionBefore
          })
        }
        record('install', 'done', `The installer finished with exit code ${exitCode}${installed.timedOut ? ' (timed out)' : ''}`)

        // 8 --- the version afterwards ----------------------------------------
        const finalVersion = versionAfter || await this.#safeVersion(address, signal)
        const changed = versionBefore && finalVersion && versionBefore !== finalVersion
        record('version', 'done', finalVersion ? `Store Commerce v${finalVersion}${changed ? ` (was v${versionBefore})` : ''}` : 'The installer succeeded but Store Commerce is not listed in Programs and Features')
        return finish(true, { exitCode, output: installed.output || '', version: finalVersion, versionBefore })
      })
    } catch (error) {
      if (error.cancelled) {
        record('cancelled', 'skipped', 'Stopped by the operator')
        return finish(false, { cancelled: true, error: error.message })
      }
      record('error', 'failed', error.message)
      return finish(false, { error: error.message })
    } finally {
      this.#releaseRun(runId, owns)
    }
  }

  /** Best-effort version read for the failure paths — never throws. */
  async #safeVersion(address, signal) {
    try {
      const status = await this.commands.sendCommand(address, { action: 'status' }, { signal, timeoutMs: 30000 })
      return status.version || null
    } catch { return null }
  }

  /**
   * Installs on every checkout strictly one after another — operators watch
   * each machine finish before the next starts — and ends with an
   * `install-finished` summary event.
   */
  async installAll(checkouts, options = {}) {
    const runId = options.runId || `install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.#registerRun(runId)
    const results = []
    let cancelledByOperator = false
    try {
      for (const checkout of checkouts) {
        if (this.runs.get(runId)?.controller.signal.aborted) {
          cancelledByOperator = true
          results.push({ checkoutId: checkout.id, name: checkout.name, ok: false, cancelled: true, skipped: true, steps: [], durationMs: 0, error: 'Skipped after the operator stopped the batch' })
          this.emit('store-update:install-step', { runId, checkoutId: checkout.id, name: checkout.name, step: 'cancelled', status: 'skipped', detail: 'Skipped after the operator stopped the batch', at: new Date().toISOString() })
          continue
        }
        const result = await this.installOne(checkout, { ...options, runId })
        results.push(result)
        if (result.cancelled) cancelledByOperator = true
      }
    } finally {
      this.#releaseRun(runId, true)
    }
    const summary = {
      runId,
      total: results.length,
      ok: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok && !row.skipped).length,
      skipped: results.filter((row) => row.skipped).length,
      cancelledByOperator,
      results,
      durationMs: results.reduce((sum, row) => sum + (row.durationMs || 0), 0)
    }
    this.emit('store-update:install-finished', summary)
    return summary
  }
}

module.exports = { StoreInstallService, PIPELINE, INSTALLER_FILE, MIN_COMMAND_AGENT }
