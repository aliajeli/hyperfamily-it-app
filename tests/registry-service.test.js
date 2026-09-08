const test = require('node:test')
const assert = require('node:assert/strict')
const { listRemotePrograms, parseRegQuery, pickProgram } = require('../electron/services/registry.service')
const { qualifyUser, SmbSessionManager } = require('../electron/services/smb.service')

/* ------------------------------------------------ reg.exe output parsing */

const SAMPLE = [
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{A1}',
  '    DisplayName    REG_SZ    Store Commerce',
  '    DisplayVersion    REG_SZ    9.52.24020.3',
  '    Publisher    REG_SZ    Microsoft Corporation',
  '    InstallLocation    REG_SZ    C:\\Program Files (x86)\\Microsoft Dynamics 365\\70\\Retail Modern POS',
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{B2}',
  '    DisplayName    REG_SZ    Store Commerce Hardware Station',
  '    DisplayVersion    REG_SZ    9.52.0.0',
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{C3}',
  '    NoDisplayName    REG_SZ    orphan value',
  ''
].join('\r\n')

test('parseRegQuery turns reg.exe output into program rows', () => {
  const rows = parseRegQuery(SAMPLE)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'Store Commerce')
  assert.equal(rows[0].version, '9.52.24020.3')
  assert.equal(rows[0].publisher, 'Microsoft Corporation')
  assert.match(rows[0].installLocation, /Retail Modern POS$/)
})

test('parseRegQuery keeps values that contain spaces and drops keys without a DisplayName', () => {
  const rows = parseRegQuery(SAMPLE)
  assert.ok(!rows.some((row) => row.name === 'orphan value'))
  assert.equal(rows[1].name, 'Store Commerce Hardware Station')
})

test('parseRegQuery survives empty or junk input', () => {
  assert.deepEqual(parseRegQuery(''), [])
  assert.deepEqual(parseRegQuery('ERROR: The network path was not found.'), [])
})

/* ------------------------------------------------------- program picking */

test('pickProgram prefers the product over its longer-named companions', () => {
  const rows = parseRegQuery(SAMPLE)
  assert.equal(pickProgram(rows, 'Store Commerce').name, 'Store Commerce')
  assert.equal(pickProgram(rows, 'store commerce').version, '9.52.24020.3')
  assert.equal(pickProgram(rows, 'Nothing Here'), null)
})

test('pickProgram matches an exact name even when a shorter one contains it', () => {
  const rows = [{ name: 'Store', version: '1' }, { name: 'Store Commerce', version: '2' }]
  assert.equal(pickProgram(rows, 'Store Commerce').version, '2')
})

/* --------------------------------------------------------- remote lookup */

test('listRemotePrograms queries both registry views of the remote host', async () => {
  const seen = []
  const rows = await listRemotePrograms('CO-01', {
    exec: async (args) => { seen.push(args[1]); return { ok: true, stdout: SAMPLE, stderr: '' } }
  })
  assert.equal(seen.length, 2)
  assert.ok(seen.every((target) => target.startsWith('\\\\CO-01\\HKLM\\')))
  assert.ok(seen.some((target) => target.includes('WOW6432Node')))
  // Identical rows from both views are deduplicated.
  assert.equal(rows.length, 2)
})

test('listRemotePrograms targets the local machine when no host is given', async () => {
  const seen = []
  await listRemotePrograms('', { exec: async (args) => { seen.push(args[1]); return { ok: true, stdout: SAMPLE } } })
  assert.ok(seen.every((target) => target.startsWith('HKLM\\')))
})

test('listRemotePrograms explains access denied and a stopped Remote Registry', async () => {
  await assert.rejects(
    listRemotePrograms('CO-01', { exec: async () => ({ ok: false, stderr: 'ERROR: Access is denied.' }) }),
    /Target access/
  )
  await assert.rejects(
    listRemotePrograms('CO-01', { exec: async () => ({ ok: false, stderr: 'ERROR: The RPC server is unavailable.' }) }),
    /Remote Registry/
  )
  await assert.rejects(
    listRemotePrograms('CO-01', { exec: async () => ({ ok: false, timedOut: true, stderr: '' }) }),
    /in time/
  )
})

/* ------------------------------------------------------- SMB credentials */

test('qualifyUser prefixes the target domain but respects an explicit one', () => {
  assert.equal(qualifyUser('okcs', 'administrator'), 'okcs\\administrator')
  assert.equal(qualifyUser('okcs', 'gig\\someone'), 'gig\\someone')
  assert.equal(qualifyUser('okcs', 'user@okcs.local'), 'user@okcs.local')
  assert.equal(qualifyUser('', 'administrator'), 'administrator')
})

test('credentialsFrom reads the Target access settings', () => {
  const credentials = SmbSessionManager.credentialsFrom({ target_domain: 'okcs ', target_admin_user: ' administrator', target_admin_password: 'pw' })
  assert.deepEqual(credentials, { domain: 'okcs', username: 'administrator', password: 'pw' })
})

test('withHost opens one session per host, reuses it concurrently and releases it once', async () => {
  const calls = []
  const manager = new SmbSessionManager({
    platform: 'win32',
    exec: async (command, args) => { calls.push(args.join(' ')); return { ok: true, stdout: '' } }
  })
  const credentials = { domain: 'okcs', username: 'administrator', password: 'pw' }
  await Promise.all([
    manager.withHost('CO-01', credentials, async () => 'a'),
    manager.withHost('CO-01', credentials, async () => 'b')
  ])
  const connects = calls.filter((line) => line.includes('/user:okcs\\administrator'))
  assert.equal(connects.length, 1, 'both callers share one authenticated session')
  assert.ok(calls.some((line) => line.includes('/delete')))
})

test('withHost runs the task unchanged when no credentials are configured', async () => {
  const manager = new SmbSessionManager({ platform: 'win32', exec: async () => { throw new Error('net use must not run') } })
  assert.equal(await manager.withHost('CO-01', null, async () => 'ok'), 'ok')
})

test('withHost surfaces a logon failure with an actionable message', async () => {
  const manager = new SmbSessionManager({
    platform: 'win32',
    exec: async (_command, args) => (args.includes('/delete') ? { ok: true } : { ok: false, stderr: 'System error 1326: The user name or password is incorrect.' })
  })
  await assert.rejects(
    manager.withHost('CO-01', { domain: 'okcs', username: 'administrator', password: 'bad' }, async () => 'never'),
    /rejected the credentials/
  )
})

test('withHost releases the session even when the task throws', async () => {
  const calls = []
  const manager = new SmbSessionManager({
    platform: 'win32',
    exec: async (_command, args) => { calls.push(args.join(' ')); return { ok: true } }
  })
  await assert.rejects(
    manager.withHost('CO-01', { domain: 'okcs', username: 'a', password: 'b' }, async () => { throw new Error('copy blew up') }),
    /copy blew up/
  )
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(calls.filter((line) => line.includes('/delete')).length >= 2)
})

/* The SOFTWARE hive is mounted at its root, not beneath another SOFTWARE. */
test('backup hive queries the correct paths and unloads/cleans up on failure', async () => {
  const { readHiveOverShare } = require('../electron/services/registry.service')
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-backup-test-'))
  const mounts = []
  try {
    for (const failQuery of [false, true]) {
      const calls = []
      const operation = readHiveOverShare('CO-01', {
        tempDir: dir,
        stat: async () => ({ size: 100 }),
        copyFile: async (_source, target) => fs.writeFileSync(target, 'fixture'),
        exec: async (args) => {
          calls.push(args)
          return { ok: !(failQuery && args[0] === 'query'), stdout: SAMPLE }
        }
      })
      if (failQuery) await assert.rejects(operation, /Could not query/)
      else assert.equal((await operation).length, 2)
      const queries = calls.filter((args) => args[0] === 'query').map((args) => args[1])
      assert.ok(queries.some((key) => /\\Microsoft\\Windows\\CurrentVersion\\Uninstall$/.test(key)))
      assert.ok(queries.some((key) => /\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall$/.test(key)))
      assert.ok(queries.every((key) => !key.includes('\\SOFTWARE\\')))
      assert.equal(calls.at(-1)[0], 'unload')
      mounts.push(calls[0][1])
      assert.deepEqual(fs.readdirSync(dir), [])
    }
    assert.notEqual(mounts[0], mounts[1], 'overlapping reads of the same host need distinct mounts')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
