const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { StoreUpdateService, toJalali, jalaliStamp, uncPath, pickBackupName } = require('../electron/services/store-update.service')

/* ------------------------------------------------------- Jalali calendar */

test('toJalali converts Gregorian dates (anchors verified against ICU — the same engine Windows uses)', () => {
  assert.deepEqual(toJalali(2026, 9, 8), { jy: 1405, jm: 6, jd: 17 })
  assert.deepEqual(toJalali(2026, 3, 21), { jy: 1405, jm: 1, jd: 1 })
  assert.deepEqual(toJalali(2024, 3, 20), { jy: 1403, jm: 1, jd: 1 })
  // 1402 was a common year: the day before Nowruz 1403 is Esfand 29.
  assert.deepEqual(toJalali(2024, 3, 19), { jy: 1402, jm: 12, jd: 29 })
  // …but 1403 was leap, so the eve of Nowruz 1404 shows Esfand 30.
  assert.deepEqual(toJalali(2025, 3, 20), { jy: 1403, jm: 12, jd: 30 })
  assert.deepEqual(toJalali(2025, 1, 1), { jy: 1403, jm: 10, jd: 12 })
})

test('jalaliStamp formats YYYYMMDD for the backup prefix', () => {
  const stamp = jalaliStamp(new Date(2026, 8, 8)) // 2026-09-08 local
  assert.equal(stamp, '14050617')
})

/* ------------------------------------------------------------ UNC paths */

test('uncPath maps a local drive path to the admin share', () => {
  assert.equal(uncPath('CO-01', 'C:\\Store Commerce\\app.exe'), '\\\\CO-01\\C$\\Store Commerce\\app.exe')
  assert.equal(uncPath('10.10.1.5', 'd:/updates/x.msi'), '\\\\10.10.1.5\\D$\\updates\\x.msi')
})

test('uncPath rejects unusable inputs', () => {
  assert.throws(() => uncPath('', 'C:\\x\\y'), /hostname or IP/)
  assert.throws(() => uncPath('CO-01', 'not/a/path'), /local drive path/)
  assert.throws(() => uncPath('CO-01', 'C:\\'), /local drive path/)
})

test('pickBackupName adds the stamp and never overwrites an older backup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-name-'))
  // The existence probe is async now — blocking the main thread on a UNC path
  // is what froze the window.
  const exists = async (target) => fs.existsSync(target)
  assert.equal(await pickBackupName(dir, 'app.exe', '14050617', exists), '14050617-app.exe')
  fs.writeFileSync(path.join(dir, '14050617-app.exe'), 'old')
  assert.equal(await pickBackupName(dir, 'app.exe', '14050617', exists), '14050617-app-2.exe')
})

/* ------------------------------------------------------- version checks */

// Reachability is now an SMB probe, not ICMP.
const onlinePing = async () => ({ status: 'online', ping_time: 5, smb: true, icmp: true })
const offlinePing = async () => ({ status: 'offline', ping_time: null, smb: false, icmp: false, detail: 'not reachable over SMB' })

/* --------------------------------------------------------- deploy pipeline */

function deployFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-deploy-'))
  const sourceDir = path.join(root, 'src')
  const destBase = path.join(root, 'machines')
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.mkdirSync(destBase, { recursive: true })
  const source = path.join(sourceDir, 'StoreCommerce-Update.exe')
  fs.writeFileSync(source, 'new installer payload')
  const serviceOptions = {
    root,
    platform: 'linux',
    reach: onlinePing,
    pathMapper: (host, localPath) => path.join(destBase, host, localPath.replace(/^[a-zA-Z]:[\\/]/, '').replace(/\\/g, '/'))
  }
  return { root, source, destBase, serviceOptions }
}

test('deployOne: first-time copy — backup skipped, hash verified, steps narrated', async () => {
  const { source, destBase, serviceOptions } = deployFixture()
  const events = []
  const service = new StoreUpdateService((channel, payload) => events.push({ channel, ...payload }), serviceOptions)
  const checkout = { id: 7, name: 'Checkout 1', hostname: 'CO-01' }
  const result = await service.deployOne(checkout, { source, destinationPath: 'C:\\Store Commerce', runId: 't1', stamp: '14050617' })

  assert.equal(result.ok, true)
  assert.equal(result.backup, null)
  assert.equal(fs.readFileSync(path.join(destBase, 'CO-01', 'Store Commerce', 'StoreCommerce-Update.exe'), 'utf8'), 'new installer payload')
  const order = result.steps.map((s) => `${s.step}:${s.status}`)
  assert.deepEqual(order, ['source:done', 'connectivity:running', 'connectivity:done', 'target:done', 'backup:skipped', 'copy:running', 'copy:done', 'verify:running', 'verify:done', 'finish:done'])
  assert.ok(events.some((e) => e.channel === 'store-update:step' && e.checkoutId === 7))
  assert.ok(events.some((e) => e.channel === 'store-update:progress' && e.checkoutId === 7))
})

test('deployOne: a modern agent hashes the copy ON the checkout; only the digest crosses the link', async () => {
  const { source, serviceOptions } = deployFixture()
  const crypto = require('crypto')
  const expected = crypto.createHash('sha256').update('new installer payload').digest('hex')
  const asked = []
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    agent: { inspect: async () => ({ running: true, agentVersion: '3.1.4-beta.1' }) },
    commands: { sendCommand: async (_host, command) => { asked.push(command); return { sha256: expected } } }
  })
  const result = await service.deployOne({ id: 9, name: 'Checkout 9', hostname: 'CO-09' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't-hash' })
  assert.equal(result.ok, true)
  assert.equal(asked.length, 1, 'exactly one sha256 command')
  assert.equal(asked[0].action, 'sha256')
  assert.equal(asked[0].path, 'C:\\Store Commerce\\StoreCommerce-Update.exe', 'the checkout-local path is hashed')
  const verify = result.steps.filter((entry) => entry.step === 'verify' && entry.status === 'done').at(-1)
  assert.match(verify.detail, /computed by the agent on the checkout/)
})

test('deployOne: a checkout without the command agent falls back to the read-back hash', async () => {
  const { source, serviceOptions } = deployFixture()
  let commandsUsed = 0
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    agent: { inspect: async () => ({ running: true, agentVersion: '3.1.2' }) }, // older than the hash command
    commands: { sendCommand: async () => { commandsUsed += 1; return { sha256: 'deadbeef' } } }
  })
  const result = await service.deployOne({ id: 10, name: 'Checkout 10', hostname: 'CO-10' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't-fallback' })
  assert.equal(result.ok, true)
  assert.equal(commandsUsed, 0, 'no command may be sent to an old agent')
  const verify = result.steps.filter((entry) => entry.step === 'verify' && entry.status === 'done').at(-1)
  assert.match(verify.detail, /the copy is intact/)
})

test('deployOne: an agent hash that disagrees with the source fails verification', async () => {
  const { source, serviceOptions } = deployFixture()
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    agent: { inspect: async () => ({ running: true, agentVersion: '3.1.4-beta.1' }) },
    commands: { sendCommand: async () => ({ sha256: '0'.repeat(64) }) }
  })
  const result = await service.deployOne({ id: 11, name: 'Checkout 11', hostname: 'CO-11' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't-mismatch' })
  assert.equal(result.ok, false)
  assert.match(result.error, /SHA-256 mismatch/)
})

test('deployOne: existing target is renamed to the Jalali-dated backup first', async () => {
  const { source, destBase, serviceOptions } = deployFixture()
  const machineDir = path.join(destBase, 'CO-02', 'Store Commerce')
  fs.mkdirSync(machineDir, { recursive: true })
  fs.writeFileSync(path.join(machineDir, 'StoreCommerce-Update.exe'), 'previous payload') // the “old” file
  const service = new StoreUpdateService(null, serviceOptions)
  const result = await service.deployOne({ id: 8, name: 'Checkout 2', hostname: 'CO-02' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't2', stamp: '14050617' })

  assert.equal(result.ok, true)
  assert.equal(result.backup, '14050617-StoreCommerce-Update.exe')
  assert.equal(fs.readFileSync(path.join(machineDir, '14050617-StoreCommerce-Update.exe'), 'utf8'), 'previous payload')
  assert.equal(fs.readFileSync(path.join(machineDir, 'StoreCommerce-Update.exe'), 'utf8'), 'new installer payload')
  assert.ok(result.steps.some((s) => s.step === 'backup' && s.status === 'done' && s.detail.includes('14050617-')))
})

test('deployOne: SHA-256 mismatch deletes the corrupt copy and retries', async () => {
  const { source, serviceOptions } = deployFixture()
  let attempts = 0
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    copier: async (src, target) => {
      attempts += 1
      // First attempt lands corrupted, second lands intact.
      fs.copyFileSync(src, target)
      if (attempts === 1) fs.appendFileSync(target, 'corruption')
    }
  })
  const result = await service.deployOne({ id: 9, name: 'CO', hostname: 'CO-03' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't3', stamp: '14050617' })
  assert.equal(result.ok, true)
  assert.equal(result.attempts, 2)
  assert.ok(result.steps.some((s) => s.step === 'verify' && s.status === 'failed' && s.detail.includes('deleting the corrupt copy')))
})

test('deployOne: persistent mismatch fails after 3 attempts and removes the copy', async () => {
  const { source, destBase, serviceOptions } = deployFixture()
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    copier: async (src, target) => fs.writeFileSync(target, 'always wrong')
  })
  const result = await service.deployOne({ id: 10, name: 'CO', hostname: 'CO-04' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't4', stamp: '14050617' })
  assert.equal(result.ok, false)
  assert.match(result.error, /SHA-256 mismatch after 3 attempts/)
  assert.equal(fs.existsSync(path.join(destBase, 'CO-04', 'Store Commerce', path.basename(source))), false)
})

test('deployOne: offline checkout stops at the connectivity step untouched', async () => {
  const { source, destBase, serviceOptions } = deployFixture()
  const service = new StoreUpdateService(null, { ...serviceOptions, reach: offlinePing })
  const result = await service.deployOne({ id: 11, name: 'CO', hostname: 'CO-05' }, { source, destinationPath: 'C:\\Store Commerce', runId: 't5', stamp: '14050617' })
  assert.equal(result.ok, false)
  assert.match(result.error, /unreachable/)
  assert.deepEqual(result.steps.map((s) => s.step), ['source', 'connectivity', 'connectivity'])
  assert.equal(fs.existsSync(path.join(destBase, 'CO-05')), false)
})

test('deployOne: a missing selected file fails before touching the network', async () => {
  const { serviceOptions } = deployFixture()
  const service = new StoreUpdateService(null, serviceOptions)
  const result = await service.deployOne({ id: 12, name: 'CO', hostname: 'CO-06' }, { source: 'C:\\nope\\gone.exe', destinationPath: 'C:\\Store Commerce', runId: 't6', stamp: '14050617' })
  assert.equal(result.ok, false)
  assert.equal(result.steps[0].step, 'source')
  assert.equal(result.steps[0].status, 'failed')
})

test('deployAll runs strictly in order and returns the per-machine summary', async () => {
  const { source, serviceOptions } = deployFixture()
  const order = []
  const service = new StoreUpdateService(
    (channel, payload) => { if (channel === 'store-update:step' && payload.step === 'source') order.push(payload.checkoutId) },
    { ...serviceOptions, reach: async (host) => (host === 'CO-down' ? { status: 'offline', ping_time: null, smb: false } : { status: 'online', ping_time: 2, smb: true }) }
  )
  const checkouts = [
    { id: 21, name: 'A', hostname: 'CO-A' },
    { id: 22, name: 'B', hostname: 'CO-down' },
    { id: 23, name: 'C', hostname: 'CO-C' }
  ]
  const summary = await service.deployAll(checkouts, { source, destinationPath: 'C:\\Store Commerce' })
  assert.deepEqual(order, [21, 22, 23]) // sequential, never interleaved
  assert.equal(summary.total, 3)
  assert.equal(summary.ok, 2)
  assert.equal(summary.failed, 1)
  assert.equal(summary.results.find((r) => r.checkoutId === 22).error, 'Checkout unreachable')
})

test('deploy is guarded off Windows unless tests inject a path mapper', async () => {
  const service = new StoreUpdateService(null, { platform: 'linux', reach: onlinePing })
  await assert.rejects(
    () => service.deployOne({ id: 1, name: 'CO', hostname: 'CO-09' }, { source: 'x', destinationPath: 'C:\\y' }),
    /only available on Windows/
  )
})


/* beta.6 replaces remote registry reads with agent-gated inventory. */
function agentService(inspect, overrides = {}) {
  return new StoreUpdateService(null, {
    platform: 'win32', reach: onlinePing,
    agent: { inspect },
    // Legacy routes must never be used by Update Store App.
    listPrograms: () => assert.fail('Remote Registry must not run'),
    listWmiPrograms: () => assert.fail('WMI must not run'),
    ...overrides
  })
}
const freshAgent = async () => ({ running: true, agentVersion: '3.0.1-beta.6', generatedAt: new Date().toISOString(), programs: [{ name: 'Microsoft Store Commerce', version: '9.52' }] })

test('agent presence/running state gates the version and full inventory', async () => {
  const service = agentService(async () => ({ running: false, reason: 'Agent service is Stopped' }))
  const version = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(version.state, 'agent-not-running')
  assert.equal(version.version, undefined)
  await assert.rejects(service.listInstalledOn({ hostname: 'CO-01' }), /Agent is not running/)
})

test('running agent supplies the Control Panel version and respects configured names', async () => {
  const service = agentService(freshAgent, { getProgramName: () => 'Microsoft Store Commerce' })
  const version = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(version.version, '9.52')
  assert.equal(version.source, 'agent')
  assert.equal(version.stale, false)
  const inventory = await service.listInstalledOn({ hostname: 'CO-01' })
  assert.equal(inventory.source, 'agent')
  assert.equal(inventory.match.name, 'Microsoft Store Commerce')
  assert.equal(inventory.total, 1)
})

test('agent reports an empty inventory as not-found but does not hide registry errors', async () => {
  assert.equal((await agentService(async () => ({ running: true, programs: [] })).checkOne({ hostname: 'CO-01' })).state, 'not-found')
  const service = agentService(async () => ({ running: true, inventoryError: 'Registry denied', programs: [] }))
  assert.equal((await service.checkOne({ hostname: 'CO-01' })).state, 'error')
  await assert.rejects(service.listInstalledOn({ hostname: 'CO-01' }), /Registry denied/)
})

test('missing/offline hosts are not queried; filtered ICMP with healthy SMB still works', async () => {
  const unreachable = agentService(() => assert.fail(), { reach: offlinePing })
  assert.equal((await unreachable.checkOne({})).state, 'no-host')
  assert.equal((await unreachable.checkOne({ hostname: 'CO-01' })).state, 'offline')
  await assert.rejects(unreachable.listInstalledOn({ hostname: 'CO-01' }), /not reachable/)
  const service = agentService(freshAgent, { reach: async () => ({ status: 'online', icmp: false, smb: true }) })
  assert.equal((await service.checkOne({ hostname: 'CO-01' })).state, 'ok')
})

test('agent queries reuse the reachable IP and target-domain SMB credentials', async () => {
  const credentials = { domain: 'okcs', username: 'test', password: 'fixture' }
  const service = agentService(async (host) => { assert.equal(host, '172.18.168.33'); return freshAgent() }, {
    getCredentials: () => credentials,
    reach: async (host) => { assert.equal(host, '172.18.168.33'); return { status: 'online', host } },
    smb: { withHost: async (host, creds, task) => { assert.equal(host, '172.18.168.33'); assert.deepEqual(creds, credentials); return task() } }
  })
  assert.equal((await service.checkOne({ hostname: 'st10007r02', ip: '172.18.168.33' })).state, 'ok')
})

test('an unresponsive agent cannot leave a version check hanging', async () => {
  const service = agentService(() => new Promise(() => {}), { checkTimeoutMs: 30 })
  const keepAlive = setTimeout(() => {}, 1000)
  try {
    assert.equal((await service.checkOne({ hostname: 'CO-01' })).state, 'error')
    await assert.rejects(service.listInstalledOn({ hostname: 'CO-01' }), /in time/)
  } finally { clearTimeout(keepAlive) }
})

test('initial page sweep emits an agent state for every checkout', async () => {
  const events = []
  const service = new StoreUpdateService((channel, payload) => events.push({ channel, payload }), {
    platform: 'win32', reach: onlinePing, agent: { inspect: async (host) => host === 'stopped' ? { running: false } : freshAgent() }
  })
  const results = await service.checkMany([{ id: 1, hostname: 'stopped' }, { id: 2, hostname: 'running' }])
  assert.equal(results.length, 2)
  assert.equal(events.length, 2)
  assert.equal(results.find((row) => row.checkoutId === 1).state, 'agent-not-running')
})
