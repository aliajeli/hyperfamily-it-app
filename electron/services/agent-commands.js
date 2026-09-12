const fsp = require('node:fs/promises')
const { randomBytes } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { mkdirAsync, renameAsync, withTimeout } = require('./async-fs')

/**
 * The command channel to a checkout's HyperFamily Agent.
 *
 * A command is a tiny UTF-8 `key=value` file dropped into
 * `\\host\C$\Agent\data\commands` — the very SMB share the heartbeat already
 * uses, so no extra port, service or credential is involved. The agent (a
 * SYSTEM service, started before login) polls that folder once per second,
 * executes the whitelisted action and answers with an atomic JSON file in
 * `data\results`. This module writes one command and waits for its answer.
 *
 * Only the fixed action set the agent implements is accepted here; anything
 * else is rejected before it ever touches the wire.
 */
const ACTIONS = new Set(['status', 'close', 'install'])
const COMMAND_EXT = '.cmd'
const POLL_MS = 750
const DEFAULT_TIMEOUT_MS = 60 * 1000
/** The installer may legitimately run for many minutes; the agent kills it at 15. */
const INSTALL_TIMEOUT_MS = 20 * 60 * 1000
const MAX_RESULT_BYTES = 2 * 1024 * 1024

const HOST_PATTERN = /^[a-zA-Z0-9._-]{1,253}$/

function normalizeHost(host) {
  const clean = String(host || '').trim().replace(/^\\+/, '')
  if (!clean || !HOST_PATTERN.test(clean)) throw new Error(`Invalid host name “${host}”`)
  return clean
}

function cancelledError(label = 'Agent command') {
  const error = new Error(`${label} was stopped by the operator`)
  error.cancelled = true
  return error
}

class AgentCommands {
  constructor(options = {}) {
    this.mapPath = options.agentPathMapper ||
      ((host, relative = '') => `\\\\${normalizeHost(host)}\\C$\\Agent${relative ? `\\${relative.replace(/\//g, '\\')}` : ''}`)
    this.delay = options.delay || delay
    this.now = options.now || (() => Date.now())
    this.writeFile = options.writeFile || ((file, data) => fsp.writeFile(file, data))
    this.readFile = options.readFile || ((file) => fsp.readFile(file))
    this.unlink = options.unlink || ((file) => fsp.unlink(file).catch(() => {}))
    this.randomId = options.randomId || (() => randomBytes(8).toString('hex'))
  }

  /**
   * Sends one command and resolves with the agent's parsed JSON answer.
   * Rejects on timeout (a stale command file is removed first so it can never
   * execute later, after an agent update), on cancellation and on malformed
   * answers.
   */
  async sendCommand(host, command, options = {}) {
    const action = String(command?.action || '').trim()
    if (!ACTIONS.has(action)) throw new Error(`Unsupported agent command “${action}”`)
    const targetPath = command.path != null ? String(command.path) : ''
    if (action === 'install' && !/^[a-zA-Z]:[\\/]/.test(targetPath)) {
      throw new Error('The install command needs the full local path of the installer on the checkout')
    }
    const signal = options.signal
    const timeoutMs = options.timeoutMs || (action === 'install' ? INSTALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)
    const id = this.randomId()
    const commandsDir = this.mapPath(host, 'data/commands')
    const resultFile = this.mapPath(host, `data/results/${id}.json`)
    const commandFile = this.mapPath(host, `data/commands/${id}${COMMAND_EXT}`)
    const tmpFile = this.mapPath(host, `data/commands/${id}.tmp`)

    await mkdirAsync(commandsDir)
    await mkdirAsync(this.mapPath(host, 'data/results'))
    // Published with a rename so the agent never reads a half-written command.
    const lines = [`id=${id}`, `action=${action}`]
    if (targetPath) lines.push(`path=${targetPath}`)
    await this.writeFile(tmpFile, lines.join('\r\n') + '\r\n')
    await renameAsync(tmpFile, commandFile)

    const deadline = this.now() + timeoutMs
    try {
      while (this.now() < deadline) {
        if (signal?.aborted) throw cancelledError(`The ${action} command on ${host}`)
        let raw = null
        try {
          raw = await withTimeout(this.readFile(resultFile), 30000, `Reading the ${action} answer from ${host} stalled`)
        } catch (error) {
          if (error?.code !== 'ENOENT' && !/ENOENT/.test(String(error?.cause?.code || ''))) {
            // A slow link is not a failure; only a real error aborts the wait.
            if (!/stalled|EBUSY|EAGAIN|sharing violation/i.test(error.message)) throw error
          }
        }
        if (raw) {
          if (Buffer.byteLength(raw) > MAX_RESULT_BYTES) throw new Error('The agent answer is larger than the supported limit')
          const result = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
          if (!result || result.protocolVersion !== 1 || result.id !== id) throw new Error('The agent returned an answer for a different command')
          await this.unlink(resultFile)
          await this.unlink(commandFile)
          return result
        }
        try { await this.delay(POLL_MS, undefined, { signal }) }
        catch { if (signal?.aborted) throw cancelledError(`The ${action} command on ${host}`); }
      }
      throw new Error(
        action === 'install'
          ? `The installer did not report back within ${Math.round(timeoutMs / 60000)} minutes`
          : `The agent did not answer the ${action} command within ${Math.round(timeoutMs / 1000)} s — the installed agent may be older than the command channel; run Import Agent to update it`
      )
    } finally {
      // Never leave a command behind: after a timeout or a Stop it must not
      // execute later when the agent is updated or restarted.
      await this.unlink(commandFile)
    }
  }
}

module.exports = { AgentCommands, normalizeHost, cancelledError, INSTALL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS }
