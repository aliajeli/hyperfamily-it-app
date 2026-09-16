const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// excel.service only touches `electron` for its save/open dialogs, which are
// never reached when an explicit output path is supplied — so the export can
// be exercised (and round-tripped through the real importer) in plain Node.
const { exportDirectory, parseImportWorkbook } = require('../../electron/services/excel.service')

const BRANCHES = [
  {
    id: 1,
    name: 'Tehran Flagship',
    code: 'THR-001',
    warehouse_code: 'WH-10',
    link1: 'Main',
    ip_link1: '10.0.0.1',
    link2: 'Backup',
    ip_link2: '10.0.1.1',
    manager_name: 'Ali Rezaei',
    manager_tell: '021-1234',
    deputy_name: 'Sara Karimi',
    deputy_tell: '021-5678'
  },
  {
    id: 2,
    name: 'Shiraz Center',
    code: 'SHZ-002',
    warehouse_code: 'WH-20',
    link1: null,
    ip_link1: null,
    link2: null,
    ip_link2: null,
    manager_name: 'Reza Moradi',
    manager_tell: '071-1111',
    deputy_name: null,
    deputy_tell: null
  }
]

const DEVICES = [
  {
    id: 10,
    branch_id: 1,
    device_type: 'Router',
    name: 'Core Router',
    model: 'RB4011',
    ip: '192.168.1.1',
    port: 443,
    asset_code: 'A-1',
    is_dashboard_visible: 1,
    switch_ports: []
  },
  {
    id: 11,
    branch_id: 1,
    device_type: 'Switch',
    name: 'SW-Floor1',
    model: 'S5720',
    location: 'Rack 1',
    ip: '192.168.1.2',
    connection_type: 'Fiber',
    connection_port: 'SFP1',
    asset_code: 'A-2',
    is_dashboard_visible: 0,
    switch_ports: [
      { port_number: 1, vlan: '10', status: 'up', ip: '192.168.10.2', details: 'Uplink' },
      { port_number: 24, vlan: null, status: 'down', ip: null, details: null }
    ]
  },
  {
    id: 12,
    branch_id: 2,
    device_type: 'POS',
    name: 'POS-3',
    checkout_number: 3,
    brand: 'OKCS',
    model: 'X1',
    version: '2.19.13',
    ip: '192.168.2.5',
    terminal_id: 'T-9',
    acceptance_id: 'AC-2',
    asset_code: 'A-3',
    is_dashboard_visible: 1,
    switch_ports: []
  },
  {
    id: 13,
    branch_id: 2,
    device_type: 'iLO',
    name: 'iLO-SRV2',
    ip: '192.168.2.9',
    esxi_version: '7.0',
    model: 'DL380',
    asset_code: 'A-4',
    is_dashboard_visible: 0,
    switch_ports: []
  }
]

function fakeDatabase() {
  const audits = []
  return {
    audits,
    listBranches: () => BRANCHES,
    listDevices: () => DEVICES,
    audit: (actor, action, target, detail) => audits.push({ actor, action, target, detail })
  }
}

test('exportDirectory writes a workbook the importer reads back unchanged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-export-'))
  const file = path.join(dir, 'directory.xlsx')
  const database = fakeDatabase()

  const result = await exportDirectory(database, file)
  assert.equal(result.success, true)
  assert.equal(result.path, file)
  assert.equal(result.branches, 2)
  assert.equal(result.devices, 4)
  assert.equal(database.audits.length, 1)
  assert.equal(database.audits[0].action, 'DIRECTORY_EXPORT')

  const payload = await parseImportWorkbook(file)
  assert.equal(payload.layout, 'type-specific')

  // Branches survive the round trip field-for-field.
  assert.equal(payload.branches.length, 2)
  assert.deepEqual(payload.branches[0], {
    name: 'Tehran Flagship',
    code: 'THR-001',
    warehouse_code: 'WH-10',
    link1: 'Main',
    ip_link1: '10.0.0.1',
    link2: 'Backup',
    ip_link2: '10.0.1.1',
    manager_name: 'Ali Rezaei',
    manager_tell: '021-1234',
    deputy_name: 'Sara Karimi',
    deputy_tell: '021-5678'
  })
  assert.equal(payload.branches[1].code, 'SHZ-002')
  assert.equal(payload.branches[1].warehouse_code, 'WH-20')

  // Devices land on their type sheets and parse back with the same values.
  assert.equal(payload.devices.length, 4)
  const byKey = new Map(payload.devices.map((device) => [`${device.device_type}:${device.name}`, device]))

  const router = byKey.get('Router:Core Router')
  assert.equal(router.branch_code, 'THR-001')
  assert.equal(router.ip, '192.168.1.1')
  assert.equal(router.port, 443)
  assert.equal(router.model, 'RB4011')
  assert.equal(router.asset_code, 'A-1')
  assert.equal(router.is_dashboard_visible, 1)

  const sw = byKey.get('Switch:SW-Floor1')
  assert.equal(sw.branch_code, 'THR-001')
  assert.equal(sw.location, 'Rack 1')
  assert.equal(sw.connection_type, 'Fiber')
  assert.equal(sw.connection_port, 'SFP1')
  assert.equal(sw.is_dashboard_visible, 0)
  assert.deepEqual(sw.switch_ports, [
    { port_number: 1, vlan: '10', status: 'up', ip: '192.168.10.2', details: 'Uplink' },
    { port_number: 24, vlan: null, status: 'down', ip: null, details: null }
  ])

  const pos = byKey.get('POS:POS-3')
  assert.equal(pos.branch_code, 'SHZ-002')
  assert.equal(pos.checkout_number, 3)
  assert.equal(pos.brand, 'OKCS')
  assert.equal(pos.version, '2.19.13')
  assert.equal(pos.terminal_id, 'T-9')
  assert.equal(pos.acceptance_id, 'AC-2')
  assert.equal(pos.is_dashboard_visible, 1)

  const ilo = byKey.get('iLO:iLO-SRV2')
  assert.equal(ilo.branch_code, 'SHZ-002')
  assert.equal(ilo.ip, '192.168.2.9')
  assert.equal(ilo.esxi_version, '7.0')
  assert.equal(ilo.model, 'DL380')
})

test('exportDirectory appends the .xlsx extension when missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-export-'))
  const result = await exportDirectory(fakeDatabase(), path.join(dir, 'no-extension'))
  assert.equal(result.success, true)
  assert.ok(result.path.endsWith('.xlsx'))
  assert.ok(fs.existsSync(result.path))
})

test('exportDirectory handles an empty directory without failing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-export-'))
  const file = path.join(dir, 'empty.xlsx')
  const result = await exportDirectory(
    { listBranches: () => [], listDevices: () => [], audit: () => {} },
    file
  )
  assert.equal(result.success, true)
  assert.equal(result.branches, 0)
  assert.equal(result.devices, 0)
  // The workbook still opens; an all-empty import is rejected only at import time.
  const workbook = new (require('exceljs').Workbook)()
  await workbook.xlsx.readFile(file)
  assert.ok(workbook.getWorksheet('Branches'))
  assert.ok(workbook.getWorksheet('Switch'))
})
