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

test('enforces the 48-port Switch boundary in service validation and SQLite triggers', () => {
  const { database, cleanup } = fixture()
  try {
    const branch = database.saveBranch({ name: 'Boundary Branch', code: 'LIMIT-01', warehouse_code: 'WH-LIMIT-01' })
    const ports = Array.from({ length: 48 }, (_, index) => ({
      port_number: index + 1, vlan: String(100 + index), status: 'up', ip: '', details: `Port ${index + 1}`
    }))
    const fullSwitch = database.saveDevice({ branch_id: branch.id, device_type: 'Switch', name: 'Full Switch', ip: '10.22.1.2', switch_ports: ports })
    assert.equal(fullSwitch.switch_ports.length, 48)

    assert.throws(() => database.saveDevice({
      ...fullSwitch,
      switch_ports: [...ports, { port_number: 1, vlan: '', status: 'up', ip: '', details: '49th row' }]
    }), /at most 48 ports/)
    assert.throws(() => database.saveDevice({ ...fullSwitch, switch_ports: [{ port_number: 49, status: 'up' }] }), /from 1 through 48/)
    assert.throws(() => database.saveDevice({ ...fullSwitch, switch_ports: [{ port_number: 1, status: 'up' }, { port_number: 1, status: 'down' }] }), /duplicated|unique/)

    const otherSwitch = database.saveDevice({
      branch_id: branch.id, device_type: 'Switch', name: 'Other Switch', ip: '10.22.1.3',
      switch_ports: [{ port_number: 1, vlan: '', status: 'up', ip: '', details: '' }]
    })
    assert.throws(() => database.db.prepare(`
      INSERT INTO switch_ports (device_id, port_number, status) VALUES (?, 49, 'up')
    `).run(otherSwitch.id), /from 1 through 48|CHECK constraint failed/)
    assert.throws(() => database.db.prepare(`
      INSERT INTO switch_ports (device_id, port_number, status) VALUES (?, 1, 'up')
    `).run(fullSwitch.id), /at most 48 ports/)
    assert.throws(() => database.db.prepare(`
      UPDATE switch_ports SET device_id = ? WHERE device_id = ? AND port_number = 1
    `).run(fullSwitch.id, otherSwitch.id), /at most 48 ports/)
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
    // Notes gained a colour and a priority in 2.1.0; an upgraded database must
    // carry both, with existing rows defaulted rather than left null.
    const noteColumns = database.db.prepare('PRAGMA table_info(notes)').all().map((column) => column.name)
    assert.equal(noteColumns.includes('color'), true)
    assert.equal(noteColumns.includes('priority'), true)
    const upgradedNote = database.saveNote({ name: 'Upgraded note', body: 'kept' })
    assert.equal(upgradedNote.color, 'default')
    assert.equal(upgradedNote.priority, 0)
    assert.equal(database.db.pragma('user_version', { simple: true }), 7)
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

test('creates the official type-specific template and atomically imports branches, devices, and Switch ports', async () => {
  const { database, cleanup } = fixture()
  const templatePath = path.join(os.tmpdir(), `hyperfamily-template-${Date.now()}.xlsx`)
  const setValues = (sheet, rowNumber, values) => {
    const headers = sheet.getRow(1).values.map((value) => String(value || ''))
    for (const [header, value] of Object.entries(values)) {
      const column = headers.indexOf(header)
      assert.notEqual(column, -1, `${sheet.name} must contain ${header}`)
      sheet.getRow(rowNumber).getCell(column).value = value
    }
  }
  try {
    const template = await createImportTemplate(database, templatePath)
    assert.equal(template.success, true)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    const expectedSheets = ['Instructions', 'Branches', 'Router', 'Switch', 'iLO', 'Server', 'NVR', 'AccessPoint', 'Scale', 'Client', 'Checkout', 'POS']
    const expectedEquipmentHeaders = {
      Router: ['Branch Code', 'Device Name', 'Model', 'IP', 'Port', 'Asset Code', 'Dashboard'],
      Switch: ['Branch Code', 'Device Name', 'Model', 'Location', 'IP', 'Connection Type', 'Connection Port', 'Asset Code', 'Dashboard'],
      iLO: ['Branch Code', 'Device Name', 'IP', 'ESXI Version', 'Server Model', 'Asset Code', 'Dashboard'],
      Server: ['Branch Code', 'Device Name', 'Hostname', 'IP', 'Dashboard'],
      NVR: ['Branch Code', 'Device Name', 'IP', 'Model', 'Asset Code', 'Dashboard'],
      AccessPoint: ['Branch Code', 'Device Name', 'Model', 'Location', 'IP', 'Port', 'Asset Code', 'Dashboard'],
      Scale: ['Branch Code', 'Device Name', 'Model', 'Location', 'IP', 'Serial Number', 'Asset Code', 'Dashboard'],
      Client: ['Branch Code', 'Device Name', 'Hostname', 'User', 'IP', 'Domain', 'Dashboard'],
      Checkout: ['Branch Code', 'Device Name', 'Checkout Number', 'Hostname', 'IP', 'Dashboard'],
      POS: ['Branch Code', 'Device Name', 'Checkout Number', 'Brand', 'Model', 'Software Version', 'IP', 'Terminal ID', 'Acceptance ID', 'Asset Code', 'Dashboard']
    }
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), expectedSheets)
    assert.deepEqual(workbook.getWorksheet('Branches').getRow(1).values.slice(1), ['Branch Name', 'Branch Code', 'Warehouse Code', 'Link1', 'IP Link1', 'Link2', 'IP Link2', 'Manager Name', 'Manager Tell', 'Deputy Name', 'Deputy Tell'])
    for (const type of expectedSheets.slice(2)) {
      const sheet = workbook.getWorksheet(type)
      assert.equal(sheet.getRow(1).values.includes('Branch Code'), true)
      assert.equal(sheet.getRow(1).values.includes('Device Name'), true)
      assert.equal(sheet.getRow(1).values.includes('Dashboard'), true)
      const headers = sheet.getRow(1).values.slice(1)
      if (type === 'Switch') {
        assert.deepEqual(headers.slice(0, expectedEquipmentHeaders.Switch.length), expectedEquipmentHeaders.Switch)
        assert.equal(headers.length, expectedEquipmentHeaders.Switch.length + (48 * 5))
      } else assert.deepEqual(headers, expectedEquipmentHeaders[type])
      const dashboardColumn = sheet.getRow(1).values.indexOf('Dashboard')
      assert.equal(sheet.getRow(2).getCell(dashboardColumn).dataValidation.type, 'list')
    }
    const switchSheet = workbook.getWorksheet('Switch')
    assert.equal(switchSheet.getRow(1).values.includes('Port 48 Number'), true)
    assert.equal(switchSheet.getRow(1).values.includes('Port 48 VLAN'), true)
    assert.equal(switchSheet.getRow(1).values.includes('Port 48 Status'), true)
    assert.equal(switchSheet.getRow(1).values.includes('Port 48 IP'), true)
    assert.equal(switchSheet.getRow(1).values.includes('Port 48 Details'), true)
    assert.equal(switchSheet.getRow(2).getCell(switchSheet.getRow(1).values.indexOf('Port 48 Number')).dataValidation.formulae[1], 48)

    setValues(workbook.getWorksheet('Branches'), 2, {
      'Branch Name': 'Imported Branch', 'Branch Code': 'IMP-01', 'Warehouse Code': 'WH-IMP-01',
      Link1: 'Fiber', 'IP Link1': '10.50.1.1', Link2: 'LTE', 'IP Link2': '10.50.1.2',
      'Manager Name': 'Manager', 'Manager Tell': '100', 'Deputy Name': 'Deputy', 'Deputy Tell': '101'
    })
    setValues(workbook.getWorksheet('Router'), 2, {
      'Branch Code': 'IMP-01', 'Device Name': 'Imported Gateway', Model: 'CCR2004', IP: '10.50.1.1', Port: 8291, 'Asset Code': 'RTR-001', Dashboard: 'Show'
    })
    setValues(switchSheet, 2, {
      'Branch Code': 'IMP-01', 'Device Name': 'Imported Core', Model: 'CBS350', Location: 'Network Room', IP: '10.50.1.2',
      'Connection Type': 'Fiber', 'Connection Port': 'Gi1/0/24', 'Asset Code': 'SW-001', Dashboard: 'Show',
      'Port 1 Number': 1, 'Port 1 VLAN': '10', 'Port 1 Status': 'Up', 'Port 1 IP': '10.50.10.1', 'Port 1 Details': 'Server uplink',
      'Port 2 Number': 2, 'Port 2 VLAN': '20', 'Port 2 Status': 'Disabled', 'Port 2 Details': 'Reserved'
    })
    setValues(workbook.getWorksheet('Scale'), 2, {
      'Branch Code': 'IMP-01', 'Device Name': 'Deli Scale', Model: 'Mettler', Location: 'Deli', IP: '10.50.1.40',
      'Serial Number': 'SN-IMPORT-1', 'Asset Code': 'SC-001', Dashboard: 'Hide'
    })
    await workbook.xlsx.writeFile(templatePath)

    const imported = await importDirectory(database, templatePath, 'ImportAdmin')
    assert.equal(imported.layout, 'type-specific')
    assert.equal(imported.branches_added, 1)
    assert.equal(imported.devices_added, 3)
    assert.equal(imported.switch_ports_imported, 2)
    assert.equal(database.listBranches()[0].warehouse_code, 'WH-IMP-01')
    assert.equal(database.listDevices().find((device) => device.device_type === 'Switch').switch_ports.length, 2)
    assert.equal(database.listDevices().find((device) => device.device_type === 'Scale').serial_number, 'SN-IMPORT-1')

    setValues(workbook.getWorksheet('Router'), 2, { 'Device Name': 'Updated Gateway', Model: 'CCR2116' })
    setValues(workbook.getWorksheet('Branches'), 2, { 'Branch Name': 'Updated Branch' })
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

test('continues to import legacy Devices and Switch Ports workbooks', async () => {
  const { database, cleanup } = fixture()
  const filePath = path.join(os.tmpdir(), `hyperfamily-legacy-import-${Date.now()}.xlsx`)
  try {
    const workbook = new ExcelJS.Workbook()
    const branches = workbook.addWorksheet('Branches')
    branches.addRow(['Name', 'Code', 'Warehouse Code', 'Link1', 'IP Link1', 'Link2', 'IP Link2', 'Manager Name', 'Manager Tell', 'Deputy Name', 'Deputy Tell'])
    branches.addRow(['Legacy Import', 'LEG-01', 'WH-LEG-01'])
    const devices = workbook.addWorksheet('Devices')
    devices.addRow(['Branch Code', 'Device Type', 'Device Name', 'Model', 'Location', 'IP', 'Port', 'Asset Code', 'Connection Type', 'Connection Port', 'Hostname', 'User', 'Domain', 'ESXI Version', 'Software Version', 'Terminal ID', 'Acceptance ID', 'Brand', 'Checkout Number', 'Serial Number', 'Dashboard'])
    devices.addRow(['LEG-01', 'Switch', 'Legacy Switch', 'CBS350', 'Network Room', '10.70.1.2', '', 'LEG-SW-1', 'Fiber', 'Gi1/0/24', '', '', '', '', '', '', '', '', '', '', 'Yes'])
    const ports = workbook.addWorksheet('Switch Ports')
    ports.addRow(['Branch Code', 'Device Name', 'Device IP', 'Port Number', 'VLAN', 'Status', 'IP', 'Details'])
    ports.addRow(['LEG-01', 'Legacy Switch', '10.70.1.2', 48, '480', 'up', '10.70.48.1', 'Legacy boundary port'])
    await workbook.xlsx.writeFile(filePath)

    const result = await importDirectory(database, filePath, 'LegacyAdmin')
    assert.equal(result.layout, 'legacy')
    assert.equal(result.branches_added, 1)
    assert.equal(result.devices_added, 1)
    assert.equal(result.switch_ports_imported, 1)
    assert.equal(database.listDevices()[0].switch_ports[0].port_number, 48)
  } finally {
    cleanup()
    fs.rmSync(filePath, { force: true })
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
    workbook.getWorksheet('Router').getRow(2).values = ['ATM-01', 'Router One', '', '10.60.1.1', '', '', 'Show']
    workbook.getWorksheet('Router').getRow(3).values = ['ATM-01', 'Router Two', '', '10.60.1.2', '', '', 'Show']
    await workbook.xlsx.writeFile(templatePath)

    await assert.rejects(importDirectory(database, templatePath), /only one Router/)
    assert.equal(database.listBranches().length, 0)
    assert.equal(database.listDevices().length, 0)

    workbook.getWorksheet('Router').getRow(3).values = []
    workbook.getWorksheet('Switch').getRow(2).values = ['ATM-01', 'Out of Range Switch', '', '', '10.60.1.2', '', '', '', 'Hide', 49]
    await workbook.xlsx.writeFile(templatePath)
    await assert.rejects(importDirectory(database, templatePath), /1 through 48/)
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
    const branch = database.saveBranch({ name: 'Mapping Branch', code: 'MAP-01', warehouse_code: 'WH-MAP-01' })
    const device = database.saveDevice({ branch_id: branch.id, device_type: 'Checkout', name: 'Checkout 2', ip: '10.40.1.2' })
    const credential = database.saveCredential({ name: 'Admin set', username: 'DOMAIN\\admin', password: 'secret' })

    // Legacy call shape (types only) must keep working.
    database.saveMappings({ Router: [credential.id], Server: [credential.id] })
    assert.deepEqual(database.getMappings(), { Router: [credential.id], Server: [credential.id] })

    // Unified shape assigns one credential to device types AND individual devices.
    database.saveMappings({ types: { Checkout: [credential.id] }, devices: { [device.id]: [credential.id] } })
    assert.deepEqual(database.getCredentialMap(), {
      types: { Checkout: [credential.id] },
      devices: { [device.id]: [credential.id] }
    })

    const resolved = database.listCredentialsForDevice(device.id)
    assert.equal(resolved[0].id, credential.id)
    assert.equal(resolved[0].scope, 'device')

    // Deleting the credential cascades through both mapping tables.
    database.deleteCredential(credential.id)
    assert.deepEqual(database.getCredentialMap(), { types: {}, devices: {} })
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

test('notes carry a pin, a colour, and a priority, and come back in that order', () => {
  const { database, cleanup } = fixture()
  try {
    const plain = database.saveNote({ name: 'Plain' })
    assert.equal(plain.pinned, 0)
    assert.equal(plain.color, 'default')
    assert.equal(plain.priority, 0)

    const urgent = database.saveNote({ name: 'Urgent', color: 'red', priority: 2 })
    assert.equal(urgent.color, 'red')
    assert.equal(urgent.priority, 2)

    // An unknown colour and an out-of-range priority must be corrected rather
    // than stored, otherwise the page would have nothing to render them with.
    const sanitised = database.saveNote({ name: 'Odd', color: 'chartreuse', priority: 99 })
    assert.equal(sanitised.color, 'default')
    assert.equal(sanitised.priority, 2)
    const negative = database.saveNote({ name: 'Negative', priority: -5 })
    assert.equal(negative.priority, 0)

    // Pinned notes lead, then higher priority, regardless of when each was
    // written. Distinct priorities are used here so the assertion does not
    // depend on how two notes saved in the same second are tie-broken.
    database.saveNote({ id: plain.id, name: 'Plain', pinned: true, priority: 0 })
    database.saveNote({ id: sanitised.id, name: 'Odd', priority: 1 })
    const order = database.listNotes().map((note) => note.name)
    assert.equal(order[0], 'Plain')          // pinned wins outright
    assert.equal(order[1], 'Urgent')         // priority 2
    assert.equal(order[2], 'Odd')            // priority 1
    assert.equal(order[3], 'Negative')       // priority 0

    // Editing keeps the colour and priority that were passed back in.
    const edited = database.saveNote({ id: urgent.id, name: 'Urgent', color: 'blue', priority: 1 })
    assert.equal(edited.color, 'blue')
    assert.equal(edited.priority, 1)
  } finally {
    cleanup()
  }
})

test('stores a recoverable copy of the administrator password', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-recovery-test-'))
  const vault = new TestVault(directory)
  const database = new AppDatabase(directory, vault)
  try {
    // The default account is seeded with its initial password.
    let row = database.db.prepare('SELECT password_recovery FROM users WHERE id = 1').get()
    assert.equal(vault.decrypt(row.password_recovery), 'Admin')

    // Changing the password refreshes the copy.
    database.updateCredentials(1, { currentPassword: 'Admin', newUsername: 'Admin', newPassword: 'NewPass9' })
    row = database.db.prepare('SELECT password_recovery FROM users WHERE id = 1').get()
    assert.equal(vault.decrypt(row.password_recovery), 'NewPass9')

    // Keeping the password keeps the existing copy.
    database.updateCredentials(1, { currentPassword: 'NewPass9', newUsername: 'Boss' })
    row = database.db.prepare('SELECT password_recovery FROM users WHERE id = 1').get()
    assert.equal(vault.decrypt(row.password_recovery), 'NewPass9')
  } finally { database.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})

test('deleteAllBranchesAndDevices wipes the whole directory', () => {
  const { database, cleanup } = fixture()
  try {
    const branchA = database.saveBranch({ name: 'Branch A', code: 'WIPE-A', warehouse_code: 'WH-WIPE-A' })
    const branchB = database.saveBranch({ name: 'Branch B', code: 'WIPE-B', warehouse_code: 'WH-WIPE-B' })
    database.saveDevice({ branch_id: branchA.id, device_type: 'Router', name: 'Gateway A', ip: '10.1.0.1', is_dashboard_visible: true })
    database.saveDevice({ branch_id: branchB.id, device_type: 'Client', name: 'Till B', ip: '10.2.0.9' })

    const result = database.deleteAllBranchesAndDevices('Admin')
    assert.equal(result.success, true)
    assert.equal(result.branchCount, 2)
    assert.equal(result.deviceCount, 2)
    assert.equal(database.listBranches().length, 0)
    assert.equal(database.listDevices().length, 0)
    assert.equal(database.listAudit(10).some((entry) => entry.action === 'DIRECTORY_CLEAR'), true)

    // Wiping an already empty directory is harmless.
    const again = database.deleteAllBranchesAndDevices('Admin')
    assert.equal(again.branchCount, 0)
    assert.equal(again.deviceCount, 0)
  } finally { cleanup() }
})

test('mirrors the administrator credentials into the recovery file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperfamily-recoveryfile-test-'))
  const vault = new TestVault(directory)
  const database = new AppDatabase(directory, vault)
  try {
    const file = path.join(directory, 'credentials.dat')
    assert.equal(fs.existsSync(file), true, 'the mirror file must be written at startup')

    let data = JSON.parse(vault.decrypt(fs.readFileSync(file, 'utf8')))
    assert.equal(data.username, 'Admin')
    assert.equal(data.password, 'Admin')

    // Changing the password refreshes the file.
    database.updateCredentials(1, { currentPassword: 'Admin', newUsername: 'Admin', newPassword: 'Recover9' })
    data = JSON.parse(vault.decrypt(fs.readFileSync(file, 'utf8')))
    assert.equal(data.password, 'Recover9')

    // Changing only the username keeps the password copy.
    database.updateCredentials(1, { currentPassword: 'Recover9', newUsername: 'BranchBoss' })
    data = JSON.parse(vault.decrypt(fs.readFileSync(file, 'utf8')))
    assert.equal(data.username, 'BranchBoss')
    assert.equal(data.password, 'Recover9')
  } finally { database.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})
