const fs = require('fs')
const crypto = require('crypto')
const { Writable } = require('stream')
const { pipeline } = require('stream/promises')
const { performance } = require('perf_hooks')

const TRANSFER_IDLE_MS = 120000
const TRANSFER_MAX_MS = 30 * 60 * 1000
const TRANSFER_BUFFER_BYTES = 1024 * 1024

/** A transfer stopped by the operator. Distinct from a timeout so the caller can
 * report "cancelled" instead of blaming the branch connection. */
const CANCELLED_CODE = 'AGENT_IMPORT_CANCELLED'

function cancelledError(label = 'Agent import') {
  return Object.assign(new Error(`${label} was stopped by the operator`), {
    code: CANCELLED_CODE, cancelled: true, phase: label
  })
}

function isCancelled(error) {
  return Boolean(error) && (error.code === CANCELLED_CODE || error.cancelled === true)
}

function formatProgress({ bytes, totalBytes, elapsedMs, bytesPerSecond }) {
  const mb = (value) => (value / 1000000).toFixed(1)
  const count = totalBytes > 0 ? `${mb(bytes)} / ${mb(totalBytes)} MB (${Math.min(100, Math.floor(bytes * 100 / totalBytes))}%)` : `${mb(bytes)} MB`
  return `${count}, ${(bytesPerSecond / 1000).toFixed(0)} KB/s, ${Math.floor(elapsedMs / 1000)} s elapsed`
}

/** Idle deadline follows completed I/O, not elapsed transfer time. The separate
 * hard ceiling still bounds trickle traffic. Await pipeline's abort/close before
 * letting the importer remove staging or release its cross-workstation lock.
 *
 * `options.signal` (an external AbortSignal) stops the transfer on demand — that
 * is how the Stop button in the Import Agent dialog reaches an in-flight SMB
 * copy. It is treated exactly like the internal deadlines: the pipeline is
 * aborted, the streams are drained, and only then does the caller run its
 * rollback, so no staging file or lock is left behind. */
async function runTransfer(task, options = {}) {
  const idleTimeoutMs = options.idleTimeoutMs ?? TRANSFER_IDLE_MS
  const maxDurationMs = options.maxDurationMs ?? TRANSFER_MAX_MS
  if (![idleTimeoutMs, maxDurationMs].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Invalid agent transfer timeout')
  const label = options.label || 'Agent file transfer'
  const controller = new AbortController()
  const started = performance.now()
  let bytes = 0
  let failure = null
  let idleTimer
  const statistics = () => {
    const elapsedMs = Math.max(0, performance.now() - started)
    return { bytes, totalBytes: options.totalBytes || 0, elapsedMs, bytesPerSecond: elapsedMs > 0 ? bytes * 1000 / elapsedMs : 0 }
  }
  const report = () => { try { options.onProgress?.(statistics()) } catch { /* UI disposal must not interrupt file safety/cleanup. */ } }
  const expire = (idle) => {
    if (failure) return
    const stats = statistics()
    const reason = idle ? `no I/O progress for ${idleTimeoutMs / 1000} seconds` : `exceeded the ${maxDurationMs / 60000} minute maximum transfer duration`
    failure = Object.assign(new Error(`${label}: ${reason} (${formatProgress(stats)}). Check the branch WAN/VPN/SMB connection and retry Import Agent.`), {
      code: idle ? 'AGENT_TRANSFER_IDLE_TIMEOUT' : 'AGENT_TRANSFER_MAX_TIMEOUT', phase: label, ...stats
    })
    controller.abort()
  }
  /** Operator stop: same abort path, but reported as a cancellation. */
  const stop = () => {
    if (failure) return
    failure = Object.assign(cancelledError(label), statistics())
    controller.abort()
  }
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => expire(true), idleTimeoutMs) }
  const advance = (count) => {
    if (count > 0 && !failure) { bytes += count; resetIdle() }
  }
  const external = options.signal
  const onExternalAbort = () => stop()
  if (external) {
    if (external.aborted) stop()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  resetIdle()
  const maximumTimer = setTimeout(() => expire(false), maxDurationMs)
  const reportTimer = setInterval(report, 1000)
  report()
  try {
    const result = await task({ signal: controller.signal, advance, idleTimeoutMs })
    if (failure) throw failure
    report()
    return result
  } catch (error) {
    if (failure) throw failure
    const detail = error.code === 'ABORT_ERR' || error.name === 'AbortError'
      ? 'I/O was aborted before completion; check branch connectivity and retry'
      : error.message
    throw Object.assign(new Error(`${label}: ${detail} (${formatProgress(statistics())})`, { cause: error }), {
      code: error.code || 'AGENT_TRANSFER_FAILED', phase: label, ...statistics()
    })
  } finally {
    clearTimeout(idleTimer)
    clearTimeout(maximumTimer)
    clearInterval(reportTimer)
    external?.removeEventListener?.('abort', onExternalAbort)
  }
}

async function hashFile(file, options = {}) {
  return runTransfer(async ({ signal, advance }) => {
    const hash = crypto.createHash('sha256')
    const input = (options.createReadStream || fs.createReadStream)(file, { highWaterMark: TRANSFER_BUFFER_BYTES })
    await pipeline(input, new Writable({ write(chunk, _encoding, done) { hash.update(chunk); advance(chunk.length); done() } }), { signal })
    return hash.digest('hex')
  }, { label: `Reading SHA-256 of ${file}`, ...options })
}

async function copyFile(source, destination, options = {}) {
  return runTransfer(async ({ signal, advance, idleTimeoutMs }) => {
    const input = (options.createReadStream || fs.createReadStream)(source, { highWaterMark: TRANSFER_BUFFER_BYTES })
    const output = (options.createWriteStream || fs.createWriteStream)(destination, { flags: 'wx', highWaterMark: TRANSFER_BUFFER_BYTES })
    let lastWritten = 0
    const sample = () => {
      const written = output.bytesWritten || 0
      advance(Math.max(0, written - lastWritten))
      lastWritten = written
    }
    // Reset idle only for writes completed on the destination, NOT fast local
    // reads buffered in RAM while an SMB write is stalled.
    const sampler = setInterval(sample, Math.max(1, Math.min(250, idleTimeoutMs / 4)))
    try { await pipeline(input, output, { signal }); sample() }
    finally { clearInterval(sampler) }
  }, { label: `Copying agent to ${destination}`, ...options })
}

module.exports = {
  hashFile, copyFile, runTransfer, formatProgress, cancelledError, isCancelled, CANCELLED_CODE,
  TRANSFER_IDLE_MS, TRANSFER_MAX_MS, TRANSFER_BUFFER_BYTES
}
