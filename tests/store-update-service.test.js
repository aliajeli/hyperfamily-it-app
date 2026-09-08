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

test('pickBackupName adds the stamp and never overwrites an older backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-name-'))
  const exists = (target) => fs.existsSync(target)
  assert.equal(pickBackupName(dir, 'app.exe', '14050617', exists), '14050617-app.exe')
  fs.writeFileSync(path.join(dir, '14050617-app.exe'), 'old')
  assert.equal(pickBackupName(dir, 'app.exe', '14050617', exists), '14050617-app-2.exe')
})

/* ------------------------------------------------------- version checks */

const onlinePing = async () => ({ status: 'online', ping_time: 5 })
const offlinePing = async () => ({ status: 'offline', ping_time: null })

function makeService(overrides = {}) {
  return new StoreUpdateService(overrides.send || null, {
    platform: 'linux',
    ping: onlinePing,
    // Stands the local tmp tree in for the UNC share, so Windows separators
    // must be normalised — a Windows path is just a name pattern here.
    pathMapper: (host, localPath) => path.join(overrides.root || fs.mkdtempSync(path.join(os.tmpdir(), 'store-update-')), localPath.replace(/^[a-zA-Z]:[\\/]/, '').replace(/\\/g, '/')),
    ...overrides
  })
}

test('checkOne: no host, offline, not-found and happy path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-update-'))
  fs.mkdirSync(path.join(root, 'Store Commerce'), { recursive: true })
  fs.writeFileSync(path.join(root, 'Store Commerce', 'app.exe'), 'binary')
  const service = makeService({
    root,
    runPs: async () => JSON.stringify({ FileVersion: '3.4.1.0', ProductVersion: '3.4.1', ProductName: 'Store Commerce' })
  })
  assert.equal((await service.checkOne({}, 'C:\\x')).state, 'no-host')
  const offline = makeService({ root, ping: offlinePing })
  assert.equal((await offline.checkOne({ ip: '10.0.0.9' }, 'C:\\x')).state, 'offline')
  assert.equal((await service.checkOne({ hostname: 'CO-01' }, 'C:\\Store Commerce\\missing.exe')).state, 'not-found')
  const ok = await service.checkOne({ hostname: 'CO-01' }, 'C:\\Store Commerce\\app.exe')
  assert.equal(ok.state, 'ok')
  assert.equal(ok.version, '3.4.1.0')
  assert.equal(ok.pingTime, 5)
})

test('checkOne reports version-read failures as error state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-update-'))
  fs.mkdirSync(path.join(root, 'Store Commerce'), { recursive: true })
  fs.writeFileSync(path.join(root, 'Store Commerce', 'app.exe'), 'binary')
  const service = makeService({ root, runPs: async () => { throw new Error('Access is denied') } })
  const result = await service.checkOne({ hostname: 'CO-01' }, 'C:\\Store Commerce\\app.exe')
  assert.equal(result.state, 'error')
  assert.match(result.error, /Access is denied/)
})

test('checkMany sweeps every checkout and streams one event each', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-update-'))
  fs.writeFileSync(path.join(root, 'app.exe'), 'x')
  const events = []
  const service = makeService({
    root,
    send: (channel, payload) => events.push({ channel, ...payload }),
    ping: async (host) => (host === 'offline-host' ? { status: 'offline', ping_time: null } : { status: 'online', ping_time: 3 }),
    runPs: async () => JSON.stringify({ FileVersion: '1.0.0' })
  })
  const checkouts = [
    { id: 1, name: 'CO 1', hostname: 'host-1', branch_id: 10 },
    { id: 2, name: 'CO 2', hostname: 'offline-host', branch_id: 10 },
    { id: 3, name: 'CO 3', hostname: 'host-3', branch_id: 11 }
  ]
  const results = await service.checkMany(checkouts, 'C:\\app.exe')
  assert.equal(results.length, 3)
  assert.equal(events.filter((e) => e.channel === 'store-update:version').length, 3)
  assert.ok(events.some((e) => e.checkoutId === 2 && e.state === 'offline'))
})

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
    ping: onlinePing,
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
  const service = new StoreUpdateService(null, { ...serviceOptions, ping: offlinePing })
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
    { ...serviceOptions, ping: async (host) => (host === 'CO-down' ? { status: 'offline', ping_time: null } : { status: 'online', ping_time: 2 }) }
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
  const service = new StoreUpdateService(null, { platform: 'linux', ping: onlinePing })
  await assert.rejects(
    () => service.deployOne({ id: 1, name: 'CO', hostname: 'CO-09' }, { source: 'x', destinationPath: 'C:\\y' }),
    /only available on Windows/
  )
})
