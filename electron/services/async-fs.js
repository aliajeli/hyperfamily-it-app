const fs = require('fs')
const fsp = require('fs/promises')

/**
 * Non-blocking filesystem helpers with a hard deadline.
 *
 * Every UNC operation in this app used to be synchronous (`fs.existsSync`,
 * `renameSync`, `statSync`). On a local disk that is invisible; on a network
 * path to a machine that is powered off, firewalled, or in another domain,
 * a single call parks the thread inside the SMB redirector for up to ~45 s.
 * Because this all runs in Electron's MAIN process, that parked thread is the
 * one driving the window: the UI freezes, the spinner stops, and the app
 * looks hung — which is exactly the reported bug.
 *
 * The async variants below hand the wait to libuv's threadpool, so the main
 * thread keeps painting, and `withTimeout` guarantees the promise settles even
 * when the redirector never answers.
 */

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, message) {
  if (!ms || ms <= 0) return promise
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message || `Timed out after ${ms} ms`)), ms)
      // A pending network wait must never keep the app alive on quit.
      timer.unref?.()
    })
  ])
}

/** `true`/`false` — a timeout or permission error resolves to `false`, never throws. */
async function existsAsync(target, timeoutMs = 15000) {
  try {
    await withTimeout(fsp.access(target, fs.constants.F_OK), timeoutMs, `Timed out checking ${target}`)
    return true
  } catch {
    return false
  }
}

/** Like `existsAsync` but distinguishes "not there" from "could not reach it". */
async function probeAsync(target, timeoutMs = 15000) {
  try {
    const stats = await withTimeout(fsp.stat(target), timeoutMs, `Timed out reading ${target}`)
    return { reachable: true, exists: true, size: stats.size, modifiedAt: stats.mtime.toISOString() }
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return { reachable: true, exists: false }
    return { reachable: false, exists: false, error: error.message }
  }
}

const statAsync = (target, timeoutMs = 15000) => withTimeout(fsp.stat(target), timeoutMs, `Timed out reading ${target}`)
const mkdirAsync = (target, timeoutMs = 20000) => withTimeout(fsp.mkdir(target, { recursive: true }), timeoutMs, `Timed out creating ${target}`)
const renameAsync = (from, to, timeoutMs = 30000) => withTimeout(fsp.rename(from, to), timeoutMs, `Timed out renaming ${from}`)
const unlinkAsync = (target, timeoutMs = 20000) => withTimeout(fsp.unlink(target), timeoutMs, `Timed out deleting ${target}`)

module.exports = { withTimeout, existsAsync, probeAsync, statAsync, mkdirAsync, renameAsync, unlinkAsync }
