const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { inspectPe, verifyNativeAgent, MAX_AGENT_BYTES } = require('../electron/scripts/verify-agent')

test('native agent verifier rejects non-PE and malformed binaries', () => {
  assert.throws(() => inspectPe(Buffer.from('not an executable')), /bounds/)
  assert.throws(() => inspectPe(Buffer.alloc(100)), /not a Windows executable/)
  const malformed = Buffer.alloc(100)
  malformed.write('MZ')
  malformed.writeUInt32LE(1000, 0x3c)
  assert.throws(() => inspectPe(malformed), /bounds/)
})

test('native agent size budget prevents accidentally republishing a bundled runtime', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-budget-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'agent.exe')
  fs.writeFileSync(file, Buffer.alloc(MAX_AGENT_BYTES + 1))
  assert.throws(() => verifyNativeAgent(file), /size budget/)
})

const exe = path.join(__dirname, '../agent/build/HyperFamilyStoreAgent.exe')
test('built native agent fits the size and dependency contract', { skip: !fs.existsSync(exe) }, () => {
  const result = verifyNativeAgent(exe)
  assert.equal(result.machine, 'x64')
  assert.equal(result.native, true)
  assert.ok(result.size < MAX_AGENT_BYTES)
  assert.ok(result.imports.includes('advapi32.dll'))
  assert.match(result.sha256, /^[0-9a-f]{64}$/)
})
