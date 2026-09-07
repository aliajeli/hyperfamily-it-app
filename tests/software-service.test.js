const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { SoftwareService, parseInstalledJson, sha256File } = require('../electron/services/software.service')

const SAMPLE_REGISTRY_JSON = JSON.stringify([
  {
    DisplayName: 'FortiClient VPN',
    DisplayVersion: '7.2.4.0972',
    Publisher: 'Fortinet Inc',
    InstallLocation: 'C:\\Program Files\\Fortinet\\FortiClient\\',
    DisplayIcon: '"C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe",0'
  },
  { DisplayName: '7-Zip 24.05 (x64)', DisplayVersion: '24.05', Publisher: 'Igor Pavlov' },
  { DisplayName: 'forticlient vpn', DisplayVersion: '7.2.4.0972', Publisher: 'Duplicate row' },
  { DisplayName: null, DisplayVersion: '0.0', Publisher: 'Nameless' },
  {}
])

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'software-service-'))
}

test('parses installed-program JSON: dedupes, drops nameless rows, cleans icon paths', () => {
  const programs = parseInstalledJson(SAMPLE_REGISTRY_JSON)
  assert.equal(programs.length, 2)
  const forti = programs.find((p) => p.name === 'FortiClient VPN')
  assert.equal(forti.version, '7.2.4.0972')
  assert.equal(forti.displayIcon, 'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe')
})

test('parseInstalledJson accepts a single object (ConvertTo-Json with one match)', () => {
  const programs = parseInstalledJson(JSON.stringify({ DisplayName: 'TeamViewer 15', DisplayVersion: '15.58.5' }))
  assert.equal(programs.length, 1)
  assert.equal(programs[0].name, 'TeamViewer 15')
})

test('parseInstalledJson tolerates empty and broken payloads', () => {
  assert.deepEqual(parseInstalledJson(''), [])
  assert.deepEqual(parseInstalledJson('not json at all'), [])
})

test('checkVersion matches installed programs by case-insensitive name fragment', async () => {
  const service = new SoftwareService(null, { platform: 'win32', runPs: async () => SAMPLE_REGISTRY_JSON })
  const result = await service.checkVersion({ name: 'FORTI' })
  assert.equal(result.mode, 'installed')
  assert.equal(result.total, 1)
  assert.equal(result.matches[0].version, '7.2.4.0972')
})

test('checkVersion rejects an empty query', async () => {
  const service = new SoftwareService(null, { platform: 'win32', runPs: async () => '[]' })
  await assert.rejects(() => service.checkVersion({}), /program name or choose an executable/)
})

test('Windows-only lookups fail with a clear error on other platforms', async () => {
  const service = new SoftwareService(null, { platform: 'linux', runPs: async () => SAMPLE_REGISTRY_JSON })
  await assert.rejects(() => service.listInstalled(), /only available on Windows/)
  await assert.rejects(() => service.checkVersion({ name: 'x' }), /only available on Windows/)
})

test('sha256File hashes file contents', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'hello.txt')
  fs.writeFileSync(file, 'hello')
  assert.equal(await sha256File(file), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
})

test('copyFiles copies with verification, progress events and a summary', async () => {
  const dir = tempDir()
  const sourceA = path.join(dir, 'a.bin')
  const sourceB = path.join(dir, 'b.bin')
  fs.writeFileSync(sourceA, Buffer.alloc(150000, 7))
  fs.writeFileSync(sourceB, 'small file')
  const destination = path.join(dir, 'out')

  const events = []
  const service = new SoftwareService((channel, payload) => events.push({ channel, ...payload }))
  const summary = await service.copyFiles({ sources: [sourceA, sourceB], destination, overwrite: false, verify: true })

  assert.equal(summary.copied, 2)
  assert.equal(summary.failed, 0)
  assert.equal(summary.totalBytes, 150000 + 10)
  assert.ok(summary.durationMs >= 0)
  // Content and hashes actually match after landing.
  assert.equal(fs.readFileSync(path.join(destination, 'a.bin')).length, 150000)
  const a = summary.results[0]
  assert.equal(a.state, 'copied')
  assert.equal(a.verified, true)
  assert.equal(a.sha256Source, a.sha256Target)
  // Live progress was streamed through the injected emitter.
  assert.ok(events.some((e) => e.state === 'started' && e.index === 0))
  assert.ok(events.some((e) => e.state === 'progress' && e.percent > 0))
  assert.ok(events.some((e) => e.state === 'verifying'))
  assert.ok(events.some((e) => e.state === 'copied'))
  assert.ok(events.some((e) => e.state === 'finished'))
})

test('copyFiles skips existing targets unless overwrite is enabled', async () => {
  const dir = tempDir()
  const source = path.join(dir, 'c.txt')
  fs.writeFileSync(source, 'new content')
  const destination = path.join(dir, 'out')
  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(destination, 'c.txt'), 'old content')

  const service = new SoftwareService(null)
  const first = await service.copyFiles({ sources: [source], destination, overwrite: false, verify: false })
  assert.equal(first.skipped, 1)
  assert.equal(first.copied, 0)
  assert.equal(fs.readFileSync(path.join(destination, 'c.txt'), 'utf8'), 'old content')

  const second = await service.copyFiles({ sources: [source], destination, overwrite: true, verify: true })
  assert.equal(second.copied, 1)
  assert.equal(fs.readFileSync(path.join(destination, 'c.txt'), 'utf8'), 'new content')
})

test('copyFiles records per-file errors without aborting the batch', async () => {
  const dir = tempDir()
  const good = path.join(dir, 'good.txt')
  fs.writeFileSync(good, 'fine')
  const destination = path.join(dir, 'out')
  const service = new SoftwareService(null)
  const summary = await service.copyFiles({ sources: [path.join(dir, 'missing.txt'), good], destination, verify: false })
  assert.equal(summary.copied, 1)
  assert.equal(summary.failed, 1)
  assert.match(summary.results[0].error, /not found/i)
})

test('copyFiles validates its inputs before touching the disk', async () => {
  const service = new SoftwareService(null)
  await assert.rejects(() => service.copyFiles({}), /at least one file/)
  await assert.rejects(() => service.copyFiles({ sources: ['C:/a.txt'] }), /destination folder/)
  await assert.rejects(() => service.copyFiles({ sources: ['C:/a.txt'], destination: 'relative/dir' }), /absolute path/)
})
