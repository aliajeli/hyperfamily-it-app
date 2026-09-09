const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const os = require('os')
const { StoreAgentService, validateSnapshot, hashFile } = require('../electron/services/store-agent.service')
const { AgentControl, AGENT_EXE } = require('../electron/services/agent-control.service')

const snapshot = (patch = {}) => ({ protocolVersion: 1, agentVersion: '3.0.1-beta.6', instanceId: 'fixture', pid: 123, sequence: 1, generatedAt: new Date().toISOString(), state: 'running', programs: [{ name: 'Store Commerce', version: '9.52' }], ...patch })
function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-import-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const source = path.join(root, 'bundled.exe')
  fs.writeFileSync(source, 'new-agent-binary')
  const target = (host, relative = '') => path.join(root, host, relative)
  const calls = []
  let state = 'Missing'
  const control = {
    query: async () => ({ exists: state !== 'Missing', state }),
    assertOwnedService: async () => {},
    secureDirectories: async () => {},
    stop: async () => { calls.push('stop'); state = state === 'Missing' ? 'Missing' : 'Stopped' },
    configure: async (_host, exists) => { calls.push(exists ? 'config' : 'create'); state = 'Stopped' },
    start: async (host) => {
      calls.push('start'); state = 'Running'
      fs.mkdirSync(target(host, 'data'), { recursive: true })
      fs.writeFileSync(target(host, 'data/inventory.json'), JSON.stringify(snapshot()))
    },
    remove: async () => { calls.push('remove'); state = 'Missing' }
  }
  const service = new StoreAgentService({
    platform: 'linux', sourcePath: source, agentPathMapper: target, control,
    reach: async (host) => ({ status: 'online', host }),
    smb: { withHost: async (_host, _credentials, task) => task() },
    ...overrides
  })
  return { service, root, source, target, control, calls, setState: (next) => { state = next } }
}
const checkout = { id: 1, name: 'Checkout 1', hostname: 'CO-01' }

test('missing EXE: copy, verify hash, install automatic service and require a heartbeat', async (t) => {
  const f = fixture(t)
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, true, result.error)
  assert.equal(result.copied, true)
  assert.equal(await hashFile(f.target('CO-01', AGENT_EXE)), await hashFile(f.source))
  assert.deepEqual(f.calls, ['create', 'start'])
  assert.equal(fs.existsSync(f.target('CO-01', 'import.lock')), false)
  assert.equal((await f.service.inspect('CO-01')).running, true)
})

test('matching SHA-256 skips copy but repairs/startups the service', async (t) => {
  const f = fixture(t)
  await f.service.importOne(checkout)
  f.service.copy = () => assert.fail('Matching binary must not be copied')
  f.setState('Stopped')
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, true, result.error)
  assert.equal(result.copied, false)
  assert.ok(f.calls.includes('config'))
})

test('mismatching SHA-256 replaces a stopped old binary and removes the temporary backup', async (t) => {
  const f = fixture(t)
  fs.mkdirSync(f.target('CO-01'), { recursive: true })
  fs.writeFileSync(f.target('CO-01', AGENT_EXE), 'old-agent')
  f.setState('Running')
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, true, result.error)
  assert.equal(result.copied, true)
  assert.deepEqual(f.calls, ['stop', 'config', 'start'])
  assert.ok(!fs.readdirSync(f.target('CO-01')).some((name) => /previous|\.new$|lock$/.test(name)))
})

test('corrupt staging copy never stops or replaces the current agent', async (t) => {
  const f = fixture(t, { copy: async (_source, destination) => fsp.writeFile(destination, 'corrupt') })
  fs.mkdirSync(f.target('CO-01'), { recursive: true })
  fs.writeFileSync(f.target('CO-01', AGENT_EXE), 'old-agent')
  f.setState('Running')
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, false)
  assert.match(result.error, /SHA-256/)
  assert.equal(fs.readFileSync(f.target('CO-01', AGENT_EXE), 'utf8'), 'old-agent')
  assert.deepEqual(f.calls, [])
})

test('failed new service startup rolls back the previous binary and restarts it', async (t) => {
  const f = fixture(t)
  fs.mkdirSync(f.target('CO-01'), { recursive: true })
  fs.writeFileSync(f.target('CO-01', AGENT_EXE), 'old-agent')
  f.setState('Running')
  const start = f.control.start
  let starts = 0
  f.control.start = async (host) => { if (++starts === 1) throw new Error('start failed'); return start(host) }
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, false)
  assert.match(result.error, /start failed/)
  assert.equal(fs.readFileSync(f.target('CO-01', AGENT_EXE), 'utf8'), 'old-agent')
  assert.equal(starts, 2)
})

test('no fresh heartbeat is a failed import, not a successful service installation', async (t) => {
  const f = fixture(t, { heartbeatWaitMs: 20 })
  f.control.start = async () => f.setState('Running')
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, false)
  assert.match(result.error, /no fresh heartbeat/)
  assert.ok(f.calls.includes('remove'))
  assert.equal(fs.existsSync(f.target('CO-01', AGENT_EXE)), false)
})

test('missing/stopped services or stale heartbeat never expose old version data', async (t) => {
  const f = fixture(t)
  assert.equal((await f.service.inspect('CO-01')).running, false)
  await f.service.importOne(checkout)
  f.setState('Stopped')
  assert.equal((await f.service.inspect('CO-01')).running, false)
  f.setState('Running')
  fs.writeFileSync(f.target('CO-01', 'data/inventory.json'), JSON.stringify(snapshot({ generatedAt: '2000-01-01T00:00:00Z' })))
  assert.equal((await f.service.inspect('CO-01')).running, false)
})

test('unreadable registry is distinct from agent liveness; malformed/oversized data is rejected', async (t) => {
  const f = fixture(t)
  await f.service.importOne(checkout)
  fs.writeFileSync(f.target('CO-01', 'data/inventory.json'), JSON.stringify(snapshot({ inventoryError: 'denied', programs: [] })))
  const data = await f.service.inspect('CO-01')
  assert.equal(data.running, true)
  assert.equal(data.inventoryError, 'denied')
  fs.writeFileSync(f.target('CO-01', 'data/inventory.json'), '{broken')
  assert.equal((await f.service.inspect('CO-01')).running, false)
  fs.writeFileSync(f.target('CO-01', 'data/inventory.json'), Buffer.alloc(9 * 1024 * 1024))
  assert.equal((await f.service.inspect('CO-01')).running, false)
})

test('protocol and timestamp checks reject incompatible, future and invalid inventory', () => {
  for (const patch of [{ protocolVersion: 2 }, { pid: 0 }, { programs: [null] }, { generatedAt: 'invalid' }, { generatedAt: new Date(Date.now() + 120000).toISOString() }]) {
    assert.throws(() => validateSnapshot(JSON.stringify(snapshot(patch))))
  }
  assert.equal(validateSnapshot(JSON.stringify(snapshot())).programs[0].version, '9.52')
})

test('batch is serial and continues after an offline target fails', async (t) => {
  const f = fixture(t, { reach: async (host) => ({ status: host === 'offline' ? 'offline' : 'online', host }) })
  const result = await f.service.importAll([checkout, { id: 2, hostname: 'offline' }, { id: 3, hostname: 'CO-03' }])
  assert.equal(result.ok, 2)
  assert.equal(result.failed, 1)
  assert.deepEqual(result.results.map((row) => row.checkoutId), [1, 2, 3])
})

test('same-target concurrent imports and existing cross-workstation locks are rejected', async (t) => {
  const f = fixture(t)
  let release
  f.service.copy = async (src, dest) => { await new Promise((resolve) => { release = resolve }); await fsp.copyFile(src, dest) }
  const first = f.service.importOne(checkout)
  // Wait on an observable test event, not a wall-clock guess.
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  const second = await f.service.importOne(checkout)
  assert.equal(second.ok, false)
  assert.match(second.error, /already running/)
  release()
  assert.equal((await first).ok, true)
  fs.writeFileSync(f.target('CO-01', 'import.lock'), 'other importer')
  const locked = await f.service.importOne(checkout)
  assert.equal(locked.ok, false)
  assert.match(locked.error, /locked/)
})

test('invalid host, missing bundled agent and service-name collision are safe failures', async (t) => {
  const f = fixture(t)
  assert.equal((await f.service.importOne({ hostname: 'host;command' })).ok, false)
  f.setState('Running')
  f.control.assertOwnedService = async () => { throw new Error('unrelated service') }
  assert.match((await f.service.importOne(checkout)).error, /unrelated service/)
  assert.deepEqual(f.calls, [])
  fs.unlinkSync(f.source)
  assert.match((await f.service.importOne(checkout)).error, /bundled agent EXE is missing/)
})

test('service configuration uses fixed binary, automatic startup and least-privilege account', async () => {
  const calls = []
  const control = new AgentControl({ sc: async (host, args) => { calls.push({ host, args }); return { code: 0, stdout: '' } } })
  await control.configure('172.18.168.33', false)
  const command = calls[0].args
  assert.equal(command[0], 'create')
  assert.equal(command[command.indexOf('start=') + 1], 'auto')
  assert.equal(command[command.indexOf('obj=') + 1], 'NT AUTHORITY\\LocalService')
  assert.equal(command[command.indexOf('binPath=') + 1], '"C:\\Agent\\HyperFamilyStoreAgent.exe"')
  assert.ok(calls.some((row) => row.args[0] === 'failure'))
})
