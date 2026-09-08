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

function makeService(overrides = {}) {
  return new StoreUpdateService(overrides.send || null, {
    platform: 'linux',
    reach: onlinePing,
    // Stands the local tmp tree in for the UNC share, so Windows separators
    // must be normalised — a Windows path is just a name pattern here.
    pathMapper: (host, localPath) => path.join(overrides.root || fs.mkdtempSync(path.join(os.tmpdir(), 'store-update-')), localPath.replace(/^[a-zA-Z]:[\\/]/, '').replace(/\\/g, '/')),
    ...overrides
  })
}

const programs = (rows) => async () => rows

test('checkOne reads the version from Programs and Features, not from the executable', async () => {
  const service = makeService({
    listPrograms: programs([
      { name: 'Store Commerce Hardware Station', version: '9.9.9' },
      { name: 'Store Commerce', version: '9.52.24020.3', publisher: 'Microsoft' },
      { name: 'Google Chrome', version: '141.0' }
    ])
  })
  const ok = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(ok.state, 'ok')
  // The shortest matching name wins, so the add-on never masks the product.
  assert.equal(ok.product, 'Store Commerce')
  assert.equal(ok.version, '9.52.24020.3')
  assert.equal(ok.source, 'control-panel')
  assert.equal(ok.pingTime, 5)
})

test('checkOne: missing host, offline host and a product that is not installed', async () => {
  const service = makeService({ listPrograms: programs([{ name: 'Google Chrome', version: '141.0' }]) })
  assert.equal((await service.checkOne({})).state, 'no-host')
  const offline = makeService({ reach: offlinePing, listPrograms: programs([]) })
  assert.equal((await offline.checkOne({ ip: '10.0.0.9' })).state, 'offline')
  const missing = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(missing.state, 'not-found')
  assert.match(missing.detail, /Programs and Features/)
})

test('checkOne reports a registry failure as an error rather than throwing', async () => {
  const service = makeService({ listPrograms: async () => { throw new Error('Access denied reading the registry on CO-01') } })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'error')
  assert.match(result.error, /Access denied/)
})

test('checkOne never hangs: an unresponsive machine resolves as an error', async () => {
  // A registry read that never settles must still let the card recover —
  // this is the freeze the async rewrite is there to prevent.
  const service = makeService({ listPrograms: () => new Promise(() => {}), checkTimeoutMs: 300 })
  const result = await Promise.race([
    service.checkOne({ hostname: 'CO-01' }),
    new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3000))
  ])
  assert.notEqual(result, 'HUNG')
  assert.equal(result.state, 'error')
})

test('checkOne opens an authenticated SMB session for the target domain', async () => {
  const calls = []
  const service = makeService({
    platform: 'win32',
    getCredentials: () => ({ domain: 'okcs', username: 'administrator', password: 'secret' }),
    smb: {
      withHost: async (host, credentials, task) => { calls.push({ host, credentials }); return task() }
    },
    listPrograms: programs([{ name: 'Store Commerce', version: '9.52' }])
  })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'ok')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].host, 'CO-01')
  assert.equal(calls[0].credentials.domain, 'okcs')
})

test('checkMany sweeps every checkout and streams one event each', async () => {
  const events = []
  const service = makeService({
    send: (channel, payload) => events.push({ channel, ...payload }),
    reach: async (host) => (host === 'offline-host' ? { status: 'offline', ping_time: null, smb: false } : { status: 'online', ping_time: 3, smb: true }),
    listPrograms: programs([{ name: 'Store Commerce', version: '1.0.0' }])
  })
  const checkouts = [
    { id: 1, name: 'CO 1', hostname: 'host-1', branch_id: 10 },
    { id: 2, name: 'CO 2', hostname: 'offline-host', branch_id: 10 },
    { id: 3, name: 'CO 3', hostname: 'host-3', branch_id: 11 }
  ]
  const results = await service.checkMany(checkouts)
  assert.equal(results.length, 3)
  assert.equal(events.filter((e) => e.channel === 'store-update:version').length, 3)
  assert.ok(events.some((e) => e.checkoutId === 2 && e.state === 'offline'))
})

/* ------------------------------ the reported bug: ICMP-blocked but healthy */

test('REGRESSION: a checkout that blocks ping but serves SMB is usable', async () => {
  // st10007r02 in the bug report: firewall drops echo requests, port 445 open.
  const firewalled = async () => ({ status: 'online', ping_time: null, smb: true, icmp: false, detail: 'SMB (port 445) answered in 4 ms; ICMP is filtered' })
  const service = makeService({ reach: firewalled, listPrograms: programs([{ name: 'Store Commerce', version: '9.52.24020.3' }]) })
  const result = await service.checkOne({ hostname: 'st10007r02' })
  assert.equal(result.state, 'ok', 'a filtered ping must never mark the checkout offline')
  assert.equal(result.version, '9.52.24020.3')
  assert.equal(result.icmp, false)
})

test('REGRESSION: deployment proceeds to a checkout that blocks ping', async () => {
  const { source, destBase, serviceOptions } = deployFixture()
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    reach: async () => ({ status: 'online', ping_time: null, smb: true, icmp: false, detail: 'SMB (port 445) answered in 4 ms; ICMP is filtered' })
  })
  const result = await service.deployOne({ id: 2, name: 'Checkout 2', hostname: 'st10007r02' }, { source, destinationPath: 'C:\\Store Commerce', runId: 'r', stamp: '14050617' })
  assert.equal(result.ok, true)
  assert.equal(fs.readFileSync(path.join(destBase, 'st10007r02', 'Store Commerce', 'StoreCommerce-Update.exe'), 'utf8'), 'new installer payload')
})

test('a genuinely dead checkout still fails fast, with a reason', async () => {
  const service = makeService({
    reach: async () => ({ status: 'offline', ping_time: null, smb: false, icmp: false, detail: 'st10007r02 did not answer on port 445 (ECONNREFUSED) and did not answer a ping — it looks powered off' })
  })
  const result = await service.checkOne({ hostname: 'st10007r02' })
  assert.equal(result.state, 'offline')
  assert.match(result.detail, /powered off/)
})

/* ------------------------------------------- version lookup fallback chain */

test('falls back to the registry backup hive when Remote Registry is stopped', async () => {
  const stopped = Object.assign(new Error('The Remote Registry service is not answering on CO-01'), { code: 'REGISTRY_UNAVAILABLE' })
  const service = makeService({
    listPrograms: async () => { throw stopped },
    readHive: programs([{ name: 'Store Commerce', version: '9.51.20000.1' }])
  })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'ok')
  assert.equal(result.version, '9.51.20000.1')
  assert.equal(result.source, 'registry-backup')
  assert.equal(result.stale, true, 'a backup hive can lag, so the UI must be able to say so')
})

test('falls back to the executable version when neither registry route works', async () => {
  const service = makeService({
    listPrograms: async () => { throw Object.assign(new Error('stopped'), { code: 'REGISTRY_UNAVAILABLE' }) },
    readHive: async () => { throw Object.assign(new Error('no backup'), { code: 'HIVE_UNAVAILABLE' }) },
    exists: async () => true,
    runPs: async () => JSON.stringify({ ProductVersion: '9.52.24020.3', ProductName: 'Store Commerce' })
  })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'ok')
  assert.equal(result.version, '9.52.24020.3')
  assert.equal(result.source, 'file')
})

test('bad credentials are reported at once, without pointless fallbacks', async () => {
  let hiveTried = false
  const denied = Object.assign(new Error('Access denied reading the registry on CO-01 — check Settings → Target access'), { code: 'REGISTRY_DENIED' })
  const service = makeService({
    listPrograms: async () => { throw denied },
    readHive: async () => { hiveTried = true; return [] }
  })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'error')
  assert.match(result.error, /Target access/)
  assert.equal(hiveTried, false, 'the same credentials would fail again')
})

test('every strategy failing yields one error listing what was tried', async () => {
  const service = makeService({
    listPrograms: async () => { throw Object.assign(new Error('service stopped'), { code: 'REGISTRY_UNAVAILABLE' }) },
    readHive: async () => { throw Object.assign(new Error('no backup hive'), { code: 'HIVE_UNAVAILABLE' }) },
    exists: async () => false
  })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'error')
  assert.match(result.error, /service stopped/)
  assert.match(result.error, /no backup hive/)
})

test('a readable registry without the product is "not found", not an error', async () => {
  const service = makeService({ listPrograms: programs([{ name: 'Google Chrome', version: '141' }]) })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'not-found')
})

/* ------------------------------------------ multi-branch host resolution */

test('the IP is preferred over the hostname when connecting', async () => {
  const seen = []
  const service = makeService({
    reach: async (host, options) => { seen.push({ host, candidates: options.candidates }); return { status: 'online', host: '10.19.1.3', ping_time: 4, smb: true, icmp: false } },
    listPrograms: async (host) => { seen.push({ listedOn: host }); return [{ name: 'Store Commerce', version: '9.52' }] }
  })
  const result = await service.checkOne({ id: 1, name: 'Checkout 3', hostname: 'st10019r03', ip: '10.19.1.3' })
  assert.equal(result.state, 'ok')
  // The registry must be read from the address that actually answered.
  assert.ok(seen.some((entry) => entry.listedOn === '10.19.1.3'))
  assert.deepEqual(seen[0].candidates, ['10.19.1.3', 'st10019r03'])
})

test('a checkout with only a hostname still works', async () => {
  const service = makeService({
    reach: async () => ({ status: 'online', host: 'CO-01', ping_time: 3, smb: true }),
    listPrograms: programs([{ name: 'Store Commerce', version: '9.52' }])
  })
  const result = await service.checkOne({ id: 1, name: 'CO 1', hostname: 'CO-01' })
  assert.equal(result.state, 'ok')
})

test('REGRESSION: another branch reachable only by IP deploys successfully', async () => {
  const { source, destBase, serviceOptions } = deployFixture()
  const service = new StoreUpdateService(null, {
    ...serviceOptions,
    // The name is unresolvable; the IP answers.
    reach: async () => ({ status: 'online', host: '10.19.1.3', ping_time: 6, smb: true, icmp: false })
  })
  const result = await service.deployOne(
    { id: 9, name: 'Checkout 3', hostname: 'st10019r03', ip: '10.19.1.3' },
    { source, destinationPath: 'C:\\Store Commerce', runId: 'r', stamp: '14050617' }
  )
  assert.equal(result.ok, true)
  // The file must land under the IP-based UNC path, not the dead hostname.
  assert.equal(fs.readFileSync(path.join(destBase, '10.19.1.3', 'Store Commerce', 'StoreCommerce-Update.exe'), 'utf8'), 'new installer payload')
})

/* -------------------------------------- configurable Control Panel name */

test('the product name comes from settings and finds the Microsoft-prefixed entry', async () => {
  const service = makeService({
    getProgramName: () => 'Microsoft Store Commerce',
    listPrograms: programs([
      { name: 'Microsoft Store Commerce', version: '9.52.24020.3' },
      { name: 'Store Commerce Hardware Station', version: '9.52.0.0' }
    ])
  })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'ok')
  assert.equal(result.product, 'Microsoft Store Commerce')
  assert.equal(result.version, '9.52.24020.3')
})

test('the default name matches both spellings as a substring', async () => {
  const service = makeService({ listPrograms: programs([{ name: 'Microsoft Store Commerce', version: '9.52.24020.3' }]) })
  const result = await service.checkOne({ hostname: 'CO-01' })
  assert.equal(result.state, 'ok', '"Store Commerce" must find "Microsoft Store Commerce"')
  assert.equal(result.version, '9.52.24020.3')
})

test('an empty configured name falls back to the built-in default', async () => {
  const service = makeService({ getProgramName: () => '   ', listPrograms: programs([{ name: 'Store Commerce', version: '1.0' }]) })
  assert.equal((await service.checkOne({ hostname: 'CO-01' })).state, 'ok')
})

/* ------------------------------------------- installed-programs diagnostic */

test('listInstalledOn returns the whole list plus what the configured name matched', async () => {
  const service = makeService({
    listPrograms: programs([
      { name: 'Google Chrome', version: '141' },
      { name: 'Microsoft Store Commerce', version: '9.52.24020.3' }
    ])
  })
  const result = await service.listInstalledOn({ id: 1, name: 'CO 1', hostname: 'CO-01', ip: '10.1.1.1' })
  assert.equal(result.total, 2)
  assert.equal(result.source, 'control-panel')
  assert.equal(result.match.name, 'Microsoft Store Commerce')
  assert.equal(result.configuredName, 'Store Commerce')
})

test('listInstalledOn reports no match when the name is wrong, without failing', async () => {
  const service = makeService({
    getProgramName: () => 'Nonexistent Product',
    listPrograms: programs([{ name: 'Microsoft Store Commerce', version: '9.52' }])
  })
  const result = await service.listInstalledOn({ hostname: 'CO-01' })
  assert.equal(result.match, null)
  assert.equal(result.total, 1, 'the operator still sees the real list to pick from')
})

test('listInstalledOn refuses an unreachable checkout with the reachability reason', async () => {
  const service = makeService({ reach: async () => ({ status: 'offline', detail: 'name could not be resolved by DNS' }) })
  await assert.rejects(service.listInstalledOn({ hostname: 'CO-01' }), /DNS/)
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
