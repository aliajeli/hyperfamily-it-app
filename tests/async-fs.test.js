const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { withTimeout, existsAsync, probeAsync, statAsync } = require('../electron/services/async-fs')

/**
 * These guard the fix for the reported freeze: every filesystem touch that can
 * land on an unreachable UNC path must be asynchronous AND bounded, so the
 * Electron main thread keeps servicing the window.
 */

test('withTimeout resolves a fast promise untouched', async () => {
  assert.equal(await withTimeout(Promise.resolve(42), 1000), 42)
})

test('withTimeout rejects a promise that never settles', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 100, 'stalled'), /stalled/)
})

test('withTimeout keeps the event loop responsive while it waits', async () => {
  // If the wait were synchronous this timer could not fire before it ends.
  let ticked = false
  setTimeout(() => { ticked = true }, 30)
  await assert.rejects(withTimeout(new Promise(() => {}), 150, 'stalled'), /stalled/)
  assert.equal(ticked, true)
})

test('existsAsync reports real files and never throws on bad input', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'async-fs-'))
  const file = path.join(dir, 'a.txt')
  fs.writeFileSync(file, 'x')
  assert.equal(await existsAsync(file), true)
  assert.equal(await existsAsync(path.join(dir, 'missing.txt')), false)
  assert.equal(await existsAsync('\\\\no-such-host\\C$\\x', 200), false)
})

test('probeAsync separates "not there" from "could not reach it"', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'async-fs-'))
  const file = path.join(dir, 'a.txt')
  fs.writeFileSync(file, 'hello')
  const found = await probeAsync(file)
  assert.equal(found.exists, true)
  assert.equal(found.reachable, true)
  assert.equal(found.size, 5)

  const absent = await probeAsync(path.join(dir, 'nope.txt'))
  assert.equal(absent.reachable, true)
  assert.equal(absent.exists, false)
})

test('statAsync rejects with a clear message instead of blocking forever', async () => {
  await assert.rejects(statAsync(path.join(os.tmpdir(), 'definitely-missing-file')), (error) => error.code === 'ENOENT' || /Timed out/.test(error.message))
})
