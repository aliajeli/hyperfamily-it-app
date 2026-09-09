const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable, Writable } = require('stream')
const { setTimeout: delay } = require('node:timers/promises')
const { hashFile, copyFile, TRANSFER_BUFFER_BYTES, TRANSFER_IDLE_MS, TRANSFER_MAX_MS } = require('../electron/services/agent-transfer.service')

function slowInput(chunks = 5) {
  return Readable.from((async function* () {
    for (let i = 0; i < chunks; i++) { await delay(150); yield Buffer.from('branch-data') }
  })())
}

test('WAN defaults use inactivity plus a hard ceiling, and 1 MiB buffers', () => {
  assert.equal(TRANSFER_IDLE_MS, 120000)
  assert.equal(TRANSFER_MAX_MS, 1800000)
  assert.equal(TRANSFER_BUFFER_BYTES, 1048576)
})

test('slow but progressing SHA-256 reads can run longer than an idle window', async () => {
  const progress = []
  const actual = await hashFile('slow-remote-file', {
    idleTimeoutMs: 500, maxDurationMs: 5000, totalBytes: 55,
    createReadStream: (_file, options) => { assert.equal(options.highWaterMark, TRANSFER_BUFFER_BYTES); return slowInput() },
    onProgress: (event) => progress.push(event)
  })
  assert.equal(actual, crypto.createHash('sha256').update('branch-data'.repeat(5)).digest('hex'))
  assert.equal(progress.at(-1).bytes, 55)
  assert.ok(progress.at(-1).elapsedMs > 500, 'Elapsed time alone must not abort a healthy slow link')
})

test('slow destination writes keep copying alive, with accurate completed-byte progress', async () => {
  let sink
  const progress = []
  await copyFile('local-agent', 'remote-stage', {
    idleTimeoutMs: 500, maxDurationMs: 5000, totalBytes: 50,
    createReadStream: () => Readable.from(Array.from({ length: 5 }, () => Buffer.alloc(10))),
    createWriteStream: (_file, options) => {
      assert.equal(options.flags, 'wx')
      assert.equal(options.highWaterMark, TRANSFER_BUFFER_BYTES)
      sink = new Writable({ write(chunk, _encoding, done) { setTimeout(() => { sink.bytesWritten += chunk.length; done() }, 150) } })
      sink.bytesWritten = 0
      return sink
    },
    onProgress: (event) => progress.push(event)
  })
  assert.equal(progress.at(-1).bytes, 50)
  assert.ok(progress.at(-1).elapsedMs > 500)
})

test('stalled hash explains phase/host/inactivity and destroys the read stream', async () => {
  const input = new Readable({ read() {} })
  await assert.rejects(hashFile('remote-agent', {
    idleTimeoutMs: 40, maxDurationMs: 1000,
    label: 'Reading installed agent SHA-256 on 172.18.82.34',
    createReadStream: () => input
  }), (error) => {
    assert.equal(error.code, 'AGENT_TRANSFER_IDLE_TIMEOUT')
    assert.match(error.message, /172\.18\.82\.34/)
    assert.match(error.message, /no I\/O progress/)
    assert.equal(error.bytes, 0)
    assert.notEqual(error.message, 'The operation was aborted')
    return true
  })
  assert.equal(input.destroyed, true)
})

test('fast local reads cannot conceal a stalled remote write', async () => {
  const input = Readable.from([Buffer.alloc(1024 * 1024)])
  const output = new Writable({ write() { /* deliberately never completes */ } })
  output.bytesWritten = 0
  await assert.rejects(copyFile('source', 'stage', {
    idleTimeoutMs: 40, maxDurationMs: 1000,
    createReadStream: () => input, createWriteStream: () => output
  }), (error) => {
    assert.equal(error.code, 'AGENT_TRANSFER_IDLE_TIMEOUT')
    assert.equal(error.bytes, 0, 'Buffered local reads are NOT bytes copied to SMB')
    return true
  })
  assert.equal(input.destroyed, true)
  assert.equal(output.destroyed, true)
})

test('continuous trickle traffic is still bounded by the hard maximum', async () => {
  const input = Readable.from((async function* () {
    while (true) { await delay(10); yield Buffer.from('x') }
  })())
  await assert.rejects(hashFile('slow-agent', {
    idleTimeoutMs: 400, maxDurationMs: 90,
    createReadStream: () => input
  }), (error) => {
    assert.equal(error.code, 'AGENT_TRANSFER_MAX_TIMEOUT')
    assert.match(error.message, /maximum transfer duration/)
    assert.ok(error.bytes > 0)
    return true
  })
  assert.equal(input.destroyed, true)
})

test('network errors retain their code and gain a useful phase label', async () => {
  const input = new Readable({ read() { this.destroy(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })) } })
  await assert.rejects(hashFile('file', { label: 'Verifying staged agent on CO-03', createReadStream: () => input }), (error) => {
    assert.equal(error.code, 'ECONNRESET')
    assert.match(error.message, /Verifying staged agent on CO-03: connection reset/)
    return true
  })
})

test('ordinary and empty files remain byte-exact; existing staging is not overwritten', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-transfer-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  for (const size of [0, 1048593]) {
    const source = path.join(directory, `source-${size}`)
    const destination = path.join(directory, `copy-${size}`)
    const data = crypto.randomBytes(size)
    fs.writeFileSync(source, data)
    await copyFile(source, destination)
    assert.equal(await hashFile(destination), crypto.createHash('sha256').update(data).digest('hex'))
    await assert.rejects(copyFile(source, destination), { code: 'EEXIST' })
    assert.deepEqual(fs.readFileSync(destination), data)
  }
})
