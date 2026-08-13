const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const NativeDatabase = require('better-sqlite3-multiple-ciphers')
const bcrypt = require('bcryptjs')
const ExcelJS = require('exceljs')
const { AppDatabase } = require('../electron/database')
const { createImportTemplate, exportInventory, importDirectory } = require('../electron/services/excel.service')

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
    const branch = database.saveBranch({ name: 'Test Branch', code: 'TEST-01', warehouse_code: 'WH-TEST-01' })
    const device = database.saveDevice({ branch_id: branch.id, device_type: 'Router', name: 'Gateway', ip: '10.0.0.1', is_dashboard_visible: true, protocol: 'https' })
    database.recordPingBatch([{ device_id: device.id, status: 'online', ping_time: 12 }])
    const snapshot = database.getMonitorSnapshot(30)
    assert.equal(snapshot.branches.length, 1)
    assert.equal(snapshot.devices[0].status, 'online')
    assert.equal(snapshot.devices[0].history[0].ping_time, 12)
    assert.equal(database.getSettings().dashboard_branch_mode, 'compact_over_four')
    assert.equal(database.getSettings().dashboard_branch_details_view, 'modal')
    database.saveSettings({ vpn_pass: 'sensitive-secret', dashboard_branch_mode: 'always_compact', dashboard_branch_details_view: 'side_panel' })
    assert.equal(database.getSettings().dashboard_branch_mode, 'always_compact')
    assert.equal(database.getSettings().dashboard_branch_details_view, 'side_panel')
    assert.equal(database.getSettings().vpn_pass, 'sensitive-secret')
    const raw = database.db.prepare("SELECT value FROM settings WHERE key = 'vpn_pass'").get().value
    assert.equal(raw.includes('sensitive-secret'), false)
  } finally { cleanup() }
})

test('persists device-specific fields, edits devices, and replaces managed switch ports', () => {
  const { database, cleanup } = fixture()
  try {
    const branch = database.saveBranch({ name: 'Port Test Branch', code: 'PORT-01', warehouse_code: 'WH-PORT-01' })
    const created = database.saveDevice({
      branch_id: branch.id,
      device_type: 'Switch',
      model: 'Cisco CBS350',
      name: 'Core Switch',
      location: 'Network room',
      ip: '10.20.1.2',
      connection_type: 'Fiber',
      connection_port: 'Gi1/0/24',
      asset_code: 'SW-001',
      is_dashboard_visible: true,
      switch_ports: [
        { port_number: 1, vlan: '10', status: 'up', ip: '10.20.10.1', details: 'Server uplink' },
        { port_number: 2, vlan: '20', status: 'down', ip: '', details: 'Checkout lane' }
      ]
    })

    assert.equal(created.switch_ports.length, 2)
    assert.equal(database.listDevices()[0].switch_ports[1].status, 'down')

    const updated = database.saveDevice({
      ...created,
      name: 'Core Distribution Switch',
      switch_ports: [
        { port_number: 1, vlan: '110', status: 'up', ip: '10.20.110.1', details: 'Updated uplink' },
        { port_number: 3, vlan: '30', status: 'disabled', ip: '', details: 'Reserved' }
      ]
    })
    assert.equal(updated.name, 'Core Distribution Switch')
    assert.deepEqual(updated.switch_ports.map((port) => [port.port_number, port.vlan, port.status]), [[1, '110', 'up'], [3, '30', 'disabled']])

    const scale = database.saveDevice({ branch_id: branch.id, device_type: 'Scale', name: 'Deli Scale', model: 'Mettler', location: 'Deli', ip: '10.20.1.40', serial_number: 'SN-4400', asset_code: 'SC-001' })
    assert.equal(database.getDevice(scale.id).serial_number, 'SN-4400')

    database.deleteBranch(branch.id)
    assert.equal(database.db.prepare('SELECT COUNT(*) FROM switch_ports').pluck().get(), 0)
  } finally { cleanup() }
})

test('upgrades older databases with Warehouse Code, scale serial numbers, and managed switch ports', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-schema-upgrade-'))
  const vault = new TestVault(directory)
  let database = new AppDatabase(directory, vault)
  database.saveBranch({ name: 'Legacy Branch', code: 'LEGACY-1', warehouse_code: 'OLD-WH-1' })
  database.close()

  const legacy = new NativeDatabase(path.join(directory, 'hyperfamily-monitor.db'))
  try {
    legacy.pragma("cipher='sqlcipher'")
    legacy.pragma(`key="x'${vault.getDatabaseKey()}'"`)
    legacy.exec('DROP TABLE switch_ports; ALTER TABLE devices DROP COLUMN serial_number; DROP INDEX idx_branches_warehouse_code_unique; DROP INDEX idx_devices_one_router_per_branch; ALTER TABLE branches DROP COLUMN warehouse_code; PRAGMA user_version = 1;')
  } finally { legacy.close() }

  try {
    database = new AppDatabase(directory, vault)
    const deviceColumns = database.db.prepare('PRAGMA table_info(devices)').all().map((column) => column.name)
    assert.equal(deviceColumns.includes('serial_number'), true)
    const branchColumns = database.db.prepare('PRAGMA table_info(branches)').all().map((column) => column.name)
    assert.equal(branchColumns.includes('warehouse_code'), true)
    assert.equal(database.listBranches()[0].warehouse_code, 'LEGACY-LEGACY-1')
    assert.equal(database.db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'switch_ports'").pluck().get(), 1)
    assert.equal(database.db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_devices_one_router_per_branch'").pluck().get(), 1)
    assert.equal(database.db.pragma('user_version', { simple: true }), 3)
  } finally {
    database?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('exports serial numbers, dashboard choices, and managed Switch ports to Excel', async () => {
  const { database, cleanup } = fixture()
  const filePath = path.join(os.tmpdir(), `hyperfamily-inventory-${Date.now()}.xlsx`)
  const filteredPath = path.join(os.tmpdir(), `hyperfamily-inventory-filtered-${Date.now()}.xlsx`)
  try {
    const branch = database.saveBranch({ name: 'Export Branch', code: 'EXP-01', warehouse_code: 'WH-EXP-01' })
    database.saveDevice({
      branch_id: branch.id,
      device_type: 'Switch',
      model: 'Cisco C9300',
      name: 'Export Switch',
      ip: '10.30.1.2',
      is_dashboard_visible: true,
      switch_ports: [{ port_number: 7, vlan: '170', status: 'up', ip: '10.30.170.1', details: 'Export uplink' }]
    })
    database.saveDevice({ branch_id: branch.id, device_type: 'Scale', name: 'Export Scale', model: 'Mettler', location: 'Deli', ip: '10.30.1.40', serial_number: 'EXPORT-SN-1' })

    const result = await exportInventory(database, { branch: 'all', type: 'all', query: '' }, filePath)
    assert.equal(result.success, true)
    assert.equal(result.count, 2)
    assert.equal(database.listAudit(1)[0].action, 'INVENTORY_EXPORT')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.getWorksheet('Inventory')
    const headers = sheet.getRow(1).values
    assert.equal(headers.includes('Warehouse Code'), true)
    assert.equal(headers.includes('Serial Number'), true)
    assert.equal(headers.includes('Switch Ports'), true)
    assert.equal(sheet.getColumn(headers.indexOf('Warehouse Code')).values.includes('WH-EXP-01'), true)
    assert.equal(sheet.getColumn(headers.indexOf('Serial Number')).values.includes('EXPORT-SN-1'), true)
    assert.match(sheet.getColumn(headers.indexOf('Switch Ports')).values.join(' '), /Port 7 · VLAN 170 · up · 10\.30\.170\.1 · Export uplink/)
    assert.equal(sheet.getColumn(headers.indexOf('Dashboard')).values.includes('Shown'), true)

    const filtered = await exportInventory(database, { branch: branch.id, type: 'Switch', query: 'Export uplink' }, filteredPath)
    assert.equal(filtered.count, 1)
    const filteredWorkbook = new ExcelJS.Workbook()
    await filteredWorkbook.xlsx.readFile(filteredPath)
    const filteredSheet = filteredWorkbook.getWorksheet('Inventory')
    const filteredHeaders = filteredSheet.getRow(1).values
    assert.equal(filteredSheet.rowCount, 2)
    assert.equal(filteredSheet.getRow(2).getCell(filteredHeaders.indexOf('Device Type')).value, 'Switch')
    assert.equal(filteredSheet.getRow(2).getCell(filteredHeaders.indexOf('Name')).value, 'Export Switch')
  } finally {
    cleanup()
    fs.rmSync(filePath, { force: true })
    fs.rmSync(filteredPath, { force: true })
  }
})

test('requires Device Name and enforces one Router per branch during add and edit', () => {
  const { database, cleanup } = fixture()
  try {
    const branch = database.saveBranch({ name: 'Router Branch', code: 'RTR-01', warehouse_code: 'WH-RTR-01' })
    assert.throws(() => database.saveBranch({ name: 'Duplicate Warehouse', code: 'RTR-02', warehouse_code: 'wh-rtr-01' }), /UNIQUE constraint failed/)
    assert.throws(() => database.saveDevice({ branch_id: branch.id, device_type: 'Scale', ip: '10.41.1.20' }), /Device Name is required/)
    const router = database.saveDevice({ branch_id: branch.id, device_type: 'Router', name: 'Primary Router', ip: '10.41.1.1' })
    assert.throws(() => database.saveDevice({ branch_id: branch.id, device_type: 'Router', name: 'Backup Router', ip: '10.41.1.2' }), /Only one Router/)
    const updated = database.saveDevice({ ...router, name: 'Renamed Router', model: 'CCR2116' })
    assert.equal(updated.name, 'Renamed Router')
    assert.equal(database.getDevice(router.id).model, 'CCR2116')
  } finally { cleanup() }
})

test('creates the official template and atomically imports branches, devices, and Switch ports', async () => {
  const { database, cleanup } = fixture()
  const templatePath = path.join(os.tmpdir(), `hyperfamily-template-${Date.now()}.xlsx`)
  try {
    const template = await createImportTemplate(database, templatePath)
    assert.equal(template.success, true)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    assert.ok(workbook.getWorksheet('Instructions'))
    assert.deepEqual(workbook.getWorksheet('Branches').getRow(1).values.slice(1), ['Name', 'Code', 'Warehouse Code', 'Link1', 'IP Link1', 'Link2', 'IP Link2', 'Manager Name', 'Manager Tell', 'Deputy Name', 'Deputy Tell'])
    assert.equal(workbook.getWorksheet('Devices').getCell('B2').dataValidation.type, 'list')

    workbook.getWorksheet('Branches').getRow(2).values = ['Imported Branch', 'IMP-01', 'WH-IMP-01', 'Fiber', '10.50.1.1', 'LTE', '10.50.1.2', 'Manager', '100', 'Deputy', '101']
    workbook.getWorksheet('Devices').getRow(2).values = ['IMP-01', 'Router', 'Imported Gateway', 'CCR2004', 'Network Room', '10.50.1.1', '8291', 'RTR-001', '', '', '', '', '', '', '', '', '', '', '', '', 'Yes']
    workbook.getWorksheet('Devices').getRow(3).values = ['IMP-01', 'Switch', 'Imported Core', 'CBS350', 'Network Room', '10.50.1.2', '', 'SW-001', 'Fiber', 'Gi1/0/24', '', '', '', '', '', '', '', '', '', '', 'Yes']
    workbook.getWorksheet('Devices').getRow(4).values = ['IMP-01', 'Scale', 'Deli Scale', 'Mettler', 'Deli', '10.50.1.40', '', 'SC-001', '', '', '', '', '', '', '', '', '', '', '', 'SN-IMPORT-1', 'No']
    workbook.getWorksheet('Switch Ports').getRow(2).values = ['IMP-01', 'Imported Core', '10.50.1.2', '1', '10', 'up', '10.50.10.1', 'Server uplink']
    workbook.getWorksheet('Switch Ports').getRow(3).values = ['IMP-01', 'Imported Core', '10.50.1.2', '2', '20', 'disabled', '', 'Reserved']
    await workbook.xlsx.writeFile(templatePath)

    const imported = await importDirectory(database, templatePath, 'ImportAdmin')
    assert.equal(imported.branches_added, 1)
    assert.equal(imported.devices_added, 3)
    assert.equal(imported.switch_ports_imported, 2)
    assert.equal(database.listBranches()[0].warehouse_code, 'WH-IMP-01')
    assert.equal(database.listDevices().find((device) => device.device_type === 'Switch').switch_ports.length, 2)
    assert.equal(database.listDevices().find((device) => device.device_type === 'Scale').serial_number, 'SN-IMPORT-1')

    workbook.getWorksheet('Devices').getRow(2).getCell(3).value = 'Updated Gateway'
    workbook.getWorksheet('Devices').getRow(2).getCell(4).value = 'CCR2116'
    workbook.getWorksheet('Branches').getRow(2).getCell(1).value = 'Updated Branch'
    await workbook.xlsx.writeFile(templatePath)
    const updated = await importDirectory(database, templatePath, 'ImportAdmin')
    assert.equal(updated.branches_updated, 1)
    assert.equal(updated.devices_updated, 3)
    assert.equal(database.listDevices().find((device) => device.device_type === 'Router').name, 'Updated Gateway')
    assert.equal(database.listBranches()[0].name, 'Updated Branch')
    assert.equal(database.listAudit(1)[0].action, 'DIRECTORY_IMPORT')
  } finally {
    cleanup()
    fs.rmSync(templatePath, { force: true })
  }
})

test('rejects an invalid Excel import without partially saving valid rows', async () => {
  const { database, cleanup } = fixture()
  const templatePath = path.join(os.tmpdir(), `hyperfamily-invalid-import-${Date.now()}.xlsx`)
  try {
    await createImportTemplate(database, templatePath)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    workbook.getWorksheet('Branches').getRow(2).values = ['Atomic Branch', 'ATM-01', 'WH-ATM-01']
    workbook.getWorksheet('Devices').getRow(2).values = ['ATM-01', 'Router', 'Router One', '', '', '10.60.1.1', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Yes']
    workbook.getWorksheet('Devices').getRow(3).values = ['ATM-01', 'Router', 'Router Two', '', '', '10.60.1.2', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Yes']
    await workbook.xlsx.writeFile(templatePath)

    await assert.rejects(importDirectory(database, templatePath), /only one Router is allowed/)
    assert.equal(database.listBranches().length, 0)
    assert.equal(database.listDevices().length, 0)

    assert.throws(() => database.importDirectory({
      branches: [{ name: 'Transaction Branch', code: 'TX-01', warehouse_code: 'WH-TX-01' }],
      devices: [
        { branch_code: 'TX-01', device_type: 'Switch', name: 'Valid Before Failure', ip: '10.61.1.2' },
        { branch_code: 'TX-01', device_type: 'Scale', name: '', ip: '10.61.1.3' }
      ]
    }), /Device Name is required/)
    assert.equal(database.listBranches().length, 0)
    assert.equal(database.listDevices().length, 0)
  } finally {
    cleanup()
    fs.rmSync(templatePath, { force: true })
  }
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
