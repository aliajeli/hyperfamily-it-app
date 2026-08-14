/**
 * Guards the Branches & Devices import template.
 *
 * The template is what operators fill in by hand, so its shape is a contract:
 * every device type gets its own sheet, and each sheet must expose exactly the
 * fields that type's form accepts — a missing column silently drops data, and
 * an extra one makes the operator supply something the app cannot store.
 * This test also round-trips a filled workbook back through the parser so the
 * template and the importer can never drift apart.
 *
 * Must run under Electron: cross-env ELECTRON_RUN_AS_NODE=1 electron --test
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

// excel.service pulls `dialog` from Electron's main process, which does not
// exist under ELECTRON_RUN_AS_NODE, so stub the module before requiring it.
const load = Module._load
Module._load = function (request, ...rest) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir(), isPackaged: false }, shell: {}, dialog: {} }
  }
  return load.call(this, request, ...rest)
}

const ExcelJS = require('exceljs')
const {
  createImportTemplate,
  parseImportWorkbook,
  DEVICE_TYPES,
  DEVICE_SHEET_FIELDS
} = require('../electron/services/excel.service')

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-template-'))
const templatePath = path.join(tmpdir, 'template.xlsx')

const headersOf = (worksheet) => {
  const headers = []
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? '').trim())
  })
  return headers
}

const readTemplate = async () => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  return workbook
}

test('the template is generated and the export is audited', async () => {
  const audits = []
  const database = { audit: (...args) => audits.push(args) }

  const result = await createImportTemplate(database, templatePath, 'Admin')

  assert.equal(result.success, true)
  assert.equal(result.path, templatePath)
  assert.ok(fs.existsSync(templatePath), 'template file should exist on disk')
  assert.equal(audits.length, 1)
  assert.equal(audits[0][1], 'IMPORT_TEMPLATE_EXPORT')
})

test('every device type gets its own sheet', async () => {
  const workbook = await readTemplate()
  const names = workbook.worksheets.map((sheet) => sheet.name)

  assert.ok(names.includes('Branches'), 'Branches sheet is required')
  for (const type of DEVICE_TYPES) {
    assert.ok(names.includes(type), `missing a sheet for ${type}`)
  }
})

test('each sheet carries exactly the fields its device form accepts', async () => {
  const workbook = await readTemplate()

  for (const type of DEVICE_TYPES) {
    const headers = headersOf(workbook.getWorksheet(type))
    const expected = ['Branch Code', ...DEVICE_SHEET_FIELDS[type].map(([header]) => header), 'Dashboard']

    if (type === 'Switch') {
      // Switch additionally repeats a column group per physical port.
      const portColumns = headers.filter((header) => /^Port\s*\d+/i.test(header))
      assert.ok(portColumns.length > 0, 'Switch sheet should expose per-port columns')
      const base = headers.filter((header) => !portColumns.includes(header))
      assert.deepEqual(base, expected)
    } else {
      assert.deepEqual(headers, expected, `${type} sheet headers drifted`)
    }
  }
})

test('a filled template parses back into branches and devices', async () => {
  const workbook = await readTemplate()

  const branches = workbook.getWorksheet('Branches')
  const branchHeaders = headersOf(branches)
  const branchCell = (name) => branches.getRow(2).getCell(branchHeaders.indexOf(name) + 1)
  branchCell('Branch Name').value = 'Test Branch'
  branchCell('Branch Code').value = 'TB01'
  branchCell('Warehouse Code').value = 'WH01'

  const routers = workbook.getWorksheet('Router')
  const routerHeaders = headersOf(routers)
  const routerCell = (name) => routers.getRow(2).getCell(routerHeaders.indexOf(name) + 1)
  routerCell('Branch Code').value = 'TB01'
  routerCell('Device Name').value = 'Edge Router'
  routerCell('IP').value = '10.1.1.1'

  const filledPath = path.join(tmpdir, 'filled.xlsx')
  await workbook.xlsx.writeFile(filledPath)

  const parsed = await parseImportWorkbook(filledPath)

  assert.equal(parsed.layout, 'type-specific')
  assert.equal(parsed.branches.length, 1)
  assert.equal(parsed.branches[0].code, 'TB01')
  assert.equal(parsed.branches[0].warehouse_code, 'WH01')
  assert.equal(parsed.devices.length, 1)
  assert.equal(parsed.devices[0].device_type, 'Router')
  assert.equal(parsed.devices[0].branch_code, 'TB01')
  assert.equal(parsed.devices[0].ip, '10.1.1.1')
})

test('an unfilled template is rejected with a clear message', async () => {
  // The blank template has header rows on every sheet but no data. Importing it
  // must fail loudly rather than report a successful no-op import.
  await assert.rejects(
    () => parseImportWorkbook(templatePath),
    /does not contain any populated Branch or equipment rows/
  )
})
