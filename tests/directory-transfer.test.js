const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = fs.promises
const os = require('node:os')
const path = require('node:path')

const { DirectoryTransferService, unc } = require('../electron/services/directory-transfer.service')

const SAMPLE = {
  branches: [{ id: 7, code: 'TBR-001', name: 'Test Branch', warehouse_code: 'WH-01' }],
  devices: [{ id: 42, branch_code: 'TBR-001', name: 'Switch A', device_type: 'Switch', ip: '192.168.1.10' }]
}

/** Filesystem-backed fakes so the service runs end-to-end without a network. */
async function makeFixture(options = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dir-transfer-'))
  // Map C:\Windows\Temp\x → <root>\C_Windows_Temp_x so UNC paths become local files.
  const pathMapper = (host, local) => path.join(root, `${host}-${local.replace(/[:\\]/g, '_')}`)
  const remoteFiles = new Map()
  const launches = []
  let imported = null

  const launch = async (request) => {
    launches.push(request)
    if (!options.noExport) {
      const match = request.commandLine.match(/--export-directory "([^"]+)"/)
      assert.ok(match, 'launch command must carry --export-directory')
      remoteFiles.set(pathMapper(request.host, match[1]), SAMPLE)
    }
    return { pid: 1234, status: 'started' }
  }

  // Re-implement readFile/stat/unlink only for the mapped fake paths.
  const service = new DirectoryTransferService({
    database: { importDirectory: (payload, actor) => { imported = { payload, actor }; return { branches_added: 1, branches_updated: 0, devices_added: 1, devices_updated: 0, switch_ports_imported: 0 } } },
    unc: pathMapper,
    reach: options.reach || (async (host) => ({ status: 'online', host })),
    smb: { withHost: async (_host, _credentials, task) => task() },
    getCredentials: () => ({ domain: 'CORP', username: 'svc_admin', password: 'secret' }),
    launch,
    pollIntervalMs: 1,
    pollAttempts: 5,
    platform: 'linux'
  })

  // Pre-place the installed application so findRemoteApp can stat it.
  const exePath = pathMapper('10.0.0.9', 'C:\\Program Files\\HyperFamily Branch Monitor\\HyperFamily Branch Monitor.exe')
  if (!options.noApp) {
    fs.mkdirSync(path.dirname(exePath), { recursive: true })
    fs.writeFileSync(exePath, 'exe')
  }

  // Wrap fs.promises for the service: intercept only mapped fake paths.
  const realReadFile = fsp.readFile
  const realStat = fsp.stat
  const realUnlink = fsp.unlink
  fsp.readFile = (target, encoding) => remoteFiles.has(String(target))
    ? Promise.resolve(JSON.stringify(remoteFiles.get(String(target))))
    : (String(target).startsWith(root) ? Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' })) : realReadFile(target, encoding))
  fsp.stat = (target) => fs.existsSync(String(target)) ? realStat(target) : Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  fsp.unlink = (target) => { remoteFiles.delete(String(target)); return Promise.resolve() }

  return { service, launches, getImported: () => imported, remoteFiles, restore: () => { fsp.readFile = realReadFile; fsp.stat = realStat; fsp.unlink = realUnlink } }
}

test('unc maps a local Windows path onto the admin share', () => {
  assert.equal(unc('10.0.0.9', 'C:\\Windows\\Temp\\x.json'), '\\\\10.0.0.9\\C$\\Windows\\Temp\\x.json')
})

test('importFromHost launches the remote export and merges the payload', async (t) => {
  const fx = await makeFixture()
  t.after(fx.restore)
  const summary = await fx.service.importFromHost('10.0.0.9', 'admin')
  assert.equal(summary.host, '10.0.0.9')
  assert.equal(summary.branches_added, 1)
  assert.equal(fx.launches.length, 1)
  assert.match(fx.launches[0].commandLine, /HyperFamily Branch Monitor\.exe" --export-directory "C:\\Windows\\Temp\\hf-dir-export-/)
  assert.equal(fx.getImported().actor, 'admin')
  assert.deepEqual(fx.getImported().payload, SAMPLE)
  assert.equal(fx.remoteFiles.size, 0, 'the remote snapshot must be deleted after import')
})

test('importFromHost rejects an offline source workstation', async (t) => {
  const fx = await makeFixture({ reach: async () => ({ status: 'offline', detail: 'no SMB route' }) })
  t.after(fx.restore)
  await assert.rejects(() => fx.service.importFromHost('10.0.0.9'), /not reachable over SMB/)
})

test('importFromHost fails clearly when the application is not installed', async (t) => {
  const fx = await makeFixture({ noApp: true })
  t.after(fx.restore)
  await assert.rejects(() => fx.service.importFromHost('10.0.0.9'), /was not found in Program Files/)
})

test('importFromHost times out when the remote export never appears', async (t) => {
  const fx = await makeFixture({ noExport: true })
  t.after(fx.restore)
  await assert.rejects(() => fx.service.importFromHost('10.0.0.9'), /did not appear in time/)
})

test('importFromHost requires a host address', async (t) => {
  const fx = await makeFixture()
  t.after(fx.restore)
  await assert.rejects(() => fx.service.importFromHost('  '), /Enter the IP address/)
})
