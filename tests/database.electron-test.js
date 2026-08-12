const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const NativeDatabase = require('better-sqlite3-multiple-ciphers')
const bcrypt = require('bcryptjs')
const { AppDatabase } = require('../electron/database')

class TestVault {
  constructor(directory) { this.keyFile = path.join(directory, '.test-db-key') }
  encrypt(value) { return `test:${Buffer.from(String(value)).toString('base64')}` }
  decrypt(value) { return Buffer.from(String(value).replace(/^test:/, ''), 'base64').toString() }
  hasDatabaseKey() { return fs.existsSync(this.keyFile) }
  getDatabaseKey() {
    if (!this.hasDatabaseKey()) fs.writeFileSync(this.keyFile, '1'.repeat(64))
    return fs.readFileSync(this.keyFile, 'utf8')
  }
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-test-'))
  const database = new AppDatabase(directory, new TestVault(directory))
  return { database, cleanup: () => { database.close(); fs.rmSync(directory, { recursive: true, force: true }) } }
}

function createPlaintextDatabase(filePath, value = 'legacy-value') {
  const plain = new NativeDatabase(filePath)
  try {
    plain.exec('CREATE TABLE legacy_probe (value TEXT NOT NULL)')
    plain.prepare('INSERT INTO legacy_probe (value) VALUES (?)').run(value)
  } finally { plain.close() }
}

test('creates default admin and authenticates Admin/Admin', () => {
  const { database, cleanup } = fixture()
  try {
    assert.deepEqual(database.authenticate('Admin', 'Admin'), { id: 1, username: 'Admin' })
    assert.equal(database.authenticate('Admin', 'wrong'), null)
  } finally { cleanup() }
})

test('updates username and password without recreating the default Admin account', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-account-test-'))
  const vault = new TestVault(directory)
  let database = new AppDatabase(directory, vault)
  try {
    const storedHash = database.db.prepare('SELECT password FROM users WHERE id = 1').pluck().get()
    assert.equal(bcrypt.compareSync('Admin', storedHash), true)

    const updated = database.updateCredentials(1, { currentPassword: 'Admin', newUsername: 'OperationsAdmin', newPassword: 'SecurePass123!' })
    assert.deepEqual(updated, { id: 1, username: 'OperationsAdmin' })
    assert.equal(database.authenticate('Admin', 'Admin'), null)
    assert.deepEqual(database.authenticate('operationsadmin', 'SecurePass123!'), { id: 1, username: 'OperationsAdmin' })

    const renamed = database.updateCredentials(1, { currentPassword: 'SecurePass123!', newUsername: 'BranchAdmin' })
    assert.deepEqual(renamed, { id: 1, username: 'BranchAdmin' })
    assert.deepEqual(database.authenticate('BranchAdmin', 'SecurePass123!'), { id: 1, username: 'BranchAdmin' })

    database.updateCredentials(1, { currentPassword: 'SecurePass123!', newUsername: 'BranchAdmin', newPassword: 'AnotherSecurePass!' })
    assert.deepEqual(database.authenticate('BranchAdmin', 'AnotherSecurePass!'), { id: 1, username: 'BranchAdmin' })
    assert.throws(() => database.updateCredentials(1, { currentPassword: 'wrong', newUsername: 'OtherAdmin' }), /Current password is incorrect/)

    database.close()
    database = new AppDatabase(directory, vault)
    assert.equal(database.db.prepare('SELECT COUNT(*) FROM users').pluck().get(), 1)
    assert.deepEqual(database.authenticate('BranchAdmin', 'AnotherSecurePass!'), { id: 1, username: 'BranchAdmin' })
  } finally {
    database?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('persists branch, device, ping snapshot, and encrypted settings', () => {
  const { database, cleanup } = fixture()
  try {
    const branch = database.saveBranch({ name: 'Test Branch', code: 'TEST-01' })
    const device = database.saveDevice({ branch_id: branch.id, device_type: 'Router', name: 'Gateway', ip: '10.0.0.1', is_dashboard_visible: true, protocol: 'https' })
    database.recordPingBatch([{ device_id: device.id, status: 'online', ping_time: 12 }])
    const snapshot = database.getMonitorSnapshot(30)
    assert.equal(snapshot.branches.length, 1)
    assert.equal(snapshot.devices[0].status, 'online')
    assert.equal(snapshot.devices[0].history[0].ping_time, 12)
    database.saveSettings({ vpn_pass: 'sensitive-secret' })
    assert.equal(database.getSettings().vpn_pass, 'sensitive-secret')
    const raw = database.db.prepare("SELECT value FROM settings WHERE key = 'vpn_pass'").get().value
    assert.equal(raw.includes('sensitive-secret'), false)
  } finally { cleanup() }
})

test('credential mappings cascade when a credential is deleted', () => {
  const { database, cleanup } = fixture()
  try {
    const credential = database.saveCredential({ name: 'Admin set', username: 'DOMAIN\\admin', password: 'secret' })
    database.saveMappings({ Router: [credential.id], Server: [credential.id] })
    assert.deepEqual(database.getMappings(), { Router: [credential.id], Server: [credential.id] })
    database.deleteCredential(credential.id)
    assert.deepEqual(database.getMappings(), {})
  } finally { cleanup() }
})

test('migrates a plaintext database only after validating the encrypted copy', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-migration-'))
  const filePath = path.join(directory, 'hyperfamily-monitor.db')
  const vault = new TestVault(directory)
  createPlaintextDatabase(filePath)

  let database
  try {
    database = new AppDatabase(directory, vault)
    assert.equal(database.db.prepare('SELECT value FROM legacy_probe').pluck().get(), 'legacy-value')
    assert.equal(database.isPlaintextDatabase(), false)
    assert.equal(fs.existsSync(`${filePath}.plaintext-backup`), true)

    const backup = new NativeDatabase(`${filePath}.plaintext-backup`, { readonly: true })
    try { assert.equal(backup.prepare('SELECT value FROM legacy_probe').pluck().get(), 'legacy-value') } finally { backup.close() }

    const unkeyed = new NativeDatabase(filePath, { readonly: true })
    try { assert.throws(() => unkeyed.prepare('SELECT value FROM legacy_probe').get(), /file is not a database|encrypted/i) } finally { unkeyed.close() }

    database.close()
    database = new AppDatabase(directory, vault)
    assert.equal(database.db.prepare('SELECT value FROM legacy_probe').pluck().get(), 'legacy-value')
  } finally {
    database?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('keeps plaintext intact after a failed migration and retries with an existing key', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-migration-retry-'))
  const filePath = path.join(directory, 'hyperfamily-monitor.db')
  const vault = new TestVault(directory)
  const malformed = Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.from('malformed')])
  fs.writeFileSync(filePath, malformed)

  try {
    assert.throws(() => new AppDatabase(directory, vault), /Could not safely encrypt the legacy database/)
    assert.deepEqual(fs.readFileSync(filePath), malformed)
    assert.equal(vault.hasDatabaseKey(), true)
    assert.equal(fs.existsSync(`${filePath}.encrypted-migration`), false)

    fs.unlinkSync(filePath)
    createPlaintextDatabase(filePath, 'retry-succeeded')
    const database = new AppDatabase(directory, vault)
    try { assert.equal(database.db.prepare('SELECT value FROM legacy_probe').pluck().get(), 'retry-succeeded') } finally { database.close() }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
