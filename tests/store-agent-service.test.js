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
  for (const patch of [{ protocolVersion: 2 }, { pid: 0 }, { programs: [null] }, { generatedAt: 'invalid' }, { generatedAt: new Date(Date.now() + 150000).toISOString() }]) {
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

/* --------------------------------------------------------------------------
 * Cancellation (the Stop button of the Import Agent dialog).
 *
 * Stopping an import must be a first-class outcome, not a failure that looks
 * like a broken link: the run reports `cancelled`, the checkout is rolled back
 * to its previous executable and service, and the temporary files are gone.
 * The trigger is the heartbeat poll's own delay, so no test depends on a
 * wall-clock race.
 * ------------------------------------------------------------------------ */

test('stopping a run rolls the checkout back and reports a cancellation', async (t) => {
  const f = fixture(t)
  fs.mkdirSync(f.target('CO-01'), { recursive: true })
  fs.writeFileSync(f.target('CO-01', AGENT_EXE), 'old-agent')
  f.setState('Running')
  // The service starts but its first inventory is stale, which is what forces
  // the heartbeat wait to poll — the deterministic point where Stop is pressed.
  const start = f.control.start
  f.control.start = async (host) => {
    await start(host)
    const stale = { ...snapshot(), generatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }
    fs.writeFileSync(f.target(host, 'data/inventory.json'), JSON.stringify(stale))
  }
  f.service.delay = (ms, _value, options) => {
    f.service.cancel('run-1')
    // An abort fires its event only once, so an already-aborted signal has to
    // be rejected directly — exactly like the service's own abortablePause.
    if (options?.signal?.aborted) return Promise.reject(new Error('aborted'))
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timer')), ms)
      options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')) }, { once: true })
    })
  }
  const result = await f.service.importOne(checkout, { runId: 'run-1' })
  assert.equal(result.ok, false)
  assert.equal(result.cancelled, true)
  assert.equal(result.code, 'AGENT_IMPORT_CANCELLED')
  assert.match(result.error, /stopped by the operator/i)
  // The replaced binary is restored and the previous service is started again.
  // The service already existed, so it is reconfigured ('config'), not created,
  // and rollback must NOT remove it — it only restarts what was running.
  assert.equal(fs.readFileSync(f.target('CO-01', AGENT_EXE), 'utf8'), 'old-agent')
  assert.deepEqual(f.calls, ['stop', 'config', 'start', 'stop', 'start'])
  assert.ok(result.steps.some((entry) => entry.step === 'rollback'), 'the rollback must be part of the reported steps')
  assert.ok(result.steps.some((entry) => entry.step === 'cancelled' || entry.step === 'failed'), 'the run must end with an explicit outcome step')
  assert.equal(fs.existsSync(f.target('CO-01', 'import.lock')), false, 'the import lock must be released')
  assert.ok(!fs.readdirSync(f.target('CO-01')).some((name) => name.endsWith('.new') || name.endsWith('.previous')), 'no staging or backup file may survive')
  assert.deepEqual(f.service.activeRuns(), [], 'a settled run must be released')
})

test('stopping a batch skips the checkouts that had not started yet', async (t) => {
  const f = fixture(t)
  const start = f.control.start
  f.control.start = async (host) => {
    await start(host)
    const stale = { ...snapshot(), generatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }
    fs.writeFileSync(f.target(host, 'data/inventory.json'), JSON.stringify(stale))
  }
  f.service.delay = (ms, _value, options) => {
    f.service.cancel('batch-1')
    if (options?.signal?.aborted) return Promise.reject(new Error('aborted'))
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timer')), ms)
      options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')) }, { once: true })
    })
  }
  const summary = await f.service.importAll([checkout, { id: 2, name: 'Checkout 2', hostname: 'CO-02' }], { runId: 'batch-1' })
  assert.equal(summary.total, 2)
  assert.equal(summary.ok, 0)
  assert.equal(summary.cancelled, 1, 'the checkout in flight is reported as stopped')
  assert.equal(summary.skipped, 1, 'the checkout that had not started is reported as skipped')
  assert.equal(summary.cancelledByOperator, true)
  assert.deepEqual(summary.results.map((row) => row.checkoutId), [1, 2])
  assert.equal(summary.results[0].cancelled, true)
  assert.notEqual(summary.results[0].skipped, true, 'the checkout in flight was rolled back, not skipped')
  assert.equal(summary.results[1].skipped, true)
  assert.equal(summary.results[1].cancelled, true)
})

test('cancelling an unknown or finished run is a safe no-op', async (t) => {
  const f = fixture(t)
  assert.deepEqual(f.service.cancel('never-existed'), { cancelled: false, active: false })
  const result = await f.service.importOne(checkout, { runId: 'finished-1' })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(f.service.cancel('finished-1'), { cancelled: false, active: false }, 'a settled run is no longer cancellable')
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

test('SCM error 1060 means missing without evaluating Windows PowerShell properties', async () => {
  const control = new AgentControl({ sc: async () => ({ code: 1060 }), runPs: () => assert.fail('Missing service should not reach PowerShell') })
  assert.deepEqual(await control.query('CO-01'), { exists: false, state: 'Missing' })
})

test('Windows PowerShell query does not assume .NET Core ServiceController.StartType', async () => {
  const control = new AgentControl({
    sc: async () => ({ code: 0 }),
    runPs: async (script) => { assert.doesNotMatch(script, /\.StartType/); return '{"exists":true,"state":"Running"}' }
  })
  assert.equal((await control.query('CO-01')).state, 'Running')
})

test('agent ACL setup uses framework APIs without PSModulePath-dependent Set-Acl autoload', async () => {
  const control = new AgentControl({ runPs: async (script) => {
    assert.doesNotMatch(script, /Set-Acl/)
    assert.match(script, /DirectoryInfo\(\$entry.Path\)\)\.SetAccessControl/)
    assert.match(script, /FileInfo\(\$exe\)\)\.SetAccessControl/)
    assert.match(script, /S-1-5-19/)
    assert.match(script, /ReadAndExecute/)
    assert.match(script, /Modify/)
  } })
  await control.secureDirectories('CO-01')
})

for (const phase of ['compare-hash', 'verify-copy', 'verify-running']) {
  test(`WAN regression: ${phase} stall is identified and preserves/restores the old agent`, async (t) => {
    const { Readable } = require('stream')
    const events = []
    const f = fixture(t, { send: (_channel, entry) => events.push(entry) })
    fs.mkdirSync(f.target('CO-01'), { recursive: true })
    fs.writeFileSync(f.target('CO-01', AGENT_EXE), 'old-agent')
    f.setState('Running')
    const labels = {
      'compare-hash': 'Reading installed agent SHA-256',
      'verify-copy': 'Verifying staged agent SHA-256',
      'verify-running': 'Verifying running agent SHA-256'
    }
    // The dialog renders a fixed pipeline, so several transfers now report
    // under one step key (compare / copy / heartbeat) instead of one key each.
    const pipelineStep = { 'compare-hash': 'compare', 'verify-copy': 'copy', 'verify-running': 'heartbeat' }[phase]
    f.service.hash = (file, options = {}) => hashFile(file, options.label?.startsWith(labels[phase]) ? {
      ...options, idleTimeoutMs: 40, maxDurationMs: 1000,
      createReadStream: () => new Readable({ read() {} })
    } : options)
    const result = await f.service.importOne(checkout)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'AGENT_TRANSFER_IDLE_TIMEOUT')
    assert.match(result.error, /CO-01/)
    assert.ok(result.error.includes(labels[phase]))
    assert.ok(events.some((entry) => entry.step === pipelineStep), `no ${pipelineStep} step was reported`)
    assert.ok(events.some((entry) => entry.step === pipelineStep && entry.status === 'running'), 'the stalled phase must be visible as running')
    assert.equal(fs.readFileSync(f.target('CO-01', AGENT_EXE), 'utf8'), 'old-agent')
    assert.equal(fs.existsSync(f.target('CO-01', 'import.lock')), false)
    assert.ok(!fs.readdirSync(f.target('CO-01')).some((name) => name.endsWith('.new')))
    if (phase !== 'verify-running') assert.deepEqual(f.calls, [], 'Comparison/staging must not stop the previous service')
    else assert.ok(result.steps.some((entry) => entry.step === 'rollback'))
  })
}

test('long final verification checks a fresh heartbeat again before declaring success', async (t) => {
  const f = fixture(t)
  const hash = f.service.hash
  f.service.hash = async (file, options) => {
    const digest = await hash(file, options)
    if (options?.label.startsWith('Verifying running agent')) f.setState('Stopped')
    return digest
  }
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, false)
  assert.match(result.error, /stopped responding during final SHA-256/)
})

test('progress samples are coalesced in the retained import log', async (t) => {
  const f = fixture(t)
  const hash = f.service.hash
  f.service.hash = async (file, options) => {
    for (let bytes = 1; bytes < 100; bytes++) options?.onProgress?.({ bytes, totalBytes: 100, elapsedMs: 1000, bytesPerSecond: bytes })
    return hash(file, options)
  }
  const result = await f.service.importOne(checkout)
  assert.equal(result.ok, true, result.error)
  assert.ok(result.steps.filter((entry) => entry.progress).length < 10, 'Do not accumulate thousands of progress samples per checkout')
})

test('WAN: a slowly trickling heartbeat read completes; only a stalled link fails', async () => {
  const { Readable } = require('stream')
  const { readWithIdleDeadline } = require('../electron/services/store-agent.service')
  const parts = ['{"alpha":"', 'bravo","n":', '42}']
  const trickle = () => Readable.from((async function* () {
    for (const part of parts) { await new Promise((r) => setTimeout(r, 30)); yield Buffer.from(part) }
  })())
  const read = await readWithIdleDeadline('unused', { idleTimeoutMs: 250, maxReadMs: 5000, createReadStream: trickle })
  assert.equal(read.toString('utf8'), parts.join(''))

  const stalled = () => Readable.from((async function* () {
    yield Buffer.from('partial')
    await new Promise((r) => setTimeout(r, 5000))
    yield Buffer.from('never')
  })())
  await assert.rejects(readWithIdleDeadline('unused', { idleTimeoutMs: 100, maxReadMs: 3000, createReadStream: stalled }), /no data/i)
})

test('WAN: continuous but endless trickle still hits the absolute read ceiling', async () => {
  const { Readable } = require('stream')
  const { readWithIdleDeadline } = require('../electron/services/store-agent.service')
  const endless = () => Readable.from((async function* () {
    for (;;) { await new Promise((r) => setTimeout(r, 10)); yield Buffer.alloc(1024) }
  })())
  // Bytes keep arriving (idle never trips), size cap fires first here.
  await assert.rejects(readWithIdleDeadline('unused', { idleTimeoutMs: 250, maxReadMs: 60000, maxBytes: 4096, createReadStream: endless }), /too large/)
})

test('WAN: waitForHeartbeat keeps polling until a late heartbeat appears', async (t) => {
  const f = fixture(t, { heartbeatWaitMs: 10000, heartbeatPollMs: 1, delay: async () => {} })
  let polls = 0
  // Simulate a completed install: target holds the same bytes as the bundle.
  fs.mkdirSync(f.target('CO-01'), { recursive: true })
  fs.writeFileSync(f.target('CO-01', AGENT_EXE), 'new-agent-binary')
  const wanted = await hashFile(f.source)
  f.service.inspect = async () => (++polls >= 3 ? { running: true, agentVersion: 'x' } : { running: false, reason: 'no fresh inventory yet' })
  const heartbeat = await f.service.waitForHeartbeat('CO-01', wanted, {})
  assert.equal(heartbeat.running, true)
  assert.equal(polls, 4) // two failed polls, one running, one post-hash freshness re-check
})

test('WAN: heartbeat wait honours its window and reports the slow-VPN guidance', async () => {
  let fakeNow = 0
  const service = new StoreAgentService({
    platform: 'linux', agentPathMapper: () => '', heartbeatWaitMs: 30000, heartbeatPollMs: 1,
    delay: async () => { fakeNow += 1000 }, now: () => fakeNow,
    reach: async (host) => ({ status: 'online', host }),
    smb: { withHost: async (_h, _c, task) => task() }
  })
  service.inspect = async () => ({ running: false, reason: 'still starting' })
  const waits = []
  await assert.rejects(service.waitForHeartbeat('CO-99', 'deadbeef', {}, (elapsed, reason) => waits.push([elapsed, reason])), /slow VPN/)
  assert.ok(waits.length >= 30)
})

test('agent staleness window accepts remote-slow heartbeats but rejects dead ones', () => {
  const now = Date.now()
  const fresh90 = snapshot({ generatedAt: new Date(now - 90000).toISOString() })
  assert.equal(validateSnapshot(JSON.stringify(fresh90), now).programs[0].name, 'Store Commerce')
  assert.throws(() => validateSnapshot(JSON.stringify(snapshot({ generatedAt: new Date(now - 121000).toISOString() })), now), /stale/)
})
