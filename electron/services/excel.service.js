const path = require('path')
const ExcelJS = require('exceljs')
const { dialog } = require('electron')

const DEVICE_TYPES = ['Router', 'Switch', 'iLO', 'Server', 'NVR', 'AccessPoint', 'Scale', 'Client', 'Checkout', 'POS']
const BRANCH_HEADERS = ['Name', 'Code', 'Warehouse Code', 'Link1', 'IP Link1', 'Link2', 'IP Link2', 'Manager Name', 'Manager Tell', 'Deputy Name', 'Deputy Tell']
const DEVICE_HEADERS = ['Branch Code', 'Device Type', 'Device Name', 'Model', 'Location', 'IP', 'Port', 'Asset Code', 'Connection Type', 'Connection Port', 'Hostname', 'User', 'Domain', 'ESXI Version', 'Software Version', 'Terminal ID', 'Acceptance ID', 'Brand', 'Checkout Number', 'Serial Number', 'Dashboard']
const SWITCH_PORT_HEADERS = ['Branch Code', 'Device Name', 'Device IP', 'Port Number', 'VLAN', 'Status', 'IP', 'Details']

function clean(value) { return String(value || 'All').replace(/[^a-z0-9_-]/gi, '_') }
function normalizedHeader(value) { return String(value || '').trim().toLowerCase() }
function importKey(...parts) { return parts.map((part) => String(part || '').trim().toLowerCase()).join('\u0000') }
function validHost(value) {
  if (!value || value.length > 253) return false
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
  const hostname = /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
  return ipv4.test(value) || hostname.test(value)
}

function cellText(cell) {
  const value = cell?.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if (value.result !== undefined) return String(value.result ?? '').trim()
    if (value.text !== undefined) return String(value.text ?? '').trim()
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim()
  }
  return String(value).trim()
}

function matchesQuery(device, query) {
  if (!query) return true
  const needle = String(query).toLowerCase()
  const values = [
    device.name, device.hostname, device.ip, device.port, device.model, device.asset_code, device.serial_number,
    device.location, device.connection_type, device.connection_port, device.esxi_version, device.version,
    device.user, device.domain, device.checkout_number, device.brand, device.terminal_id, device.acceptance_id,
    device.branch_name, device.branch_code, device.branch_warehouse_code,
    ...(device.switch_ports || []).flatMap((port) => [port.port_number, port.vlan, port.status, port.ip, port.details])
  ]
  return values.some((value) => String(value || '').toLowerCase().includes(needle))
}

function formatSwitchPorts(ports = []) {
  return ports.map((port) => {
    const details = [`Port ${port.port_number}`, port.vlan && `VLAN ${port.vlan}`, port.status, port.ip, port.details].filter(Boolean)
    return details.join(' · ')
  }).join('; ')
}

function styleDataSheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).height = 24
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFECEFF4' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E81AC' } }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }
  sheet.columns.forEach((column) => {
    column.width = Math.max(14, Math.min(28, String(column.header || '').length + 7))
    column.alignment = { vertical: 'top' }
  })
}

async function exportInventory(database, filters = {}, outputPath = null) {
  let rows = database.listInventory()
  if (filters.branch && filters.branch !== 'all') rows = rows.filter((row) => String(row.branch_id) === String(filters.branch))
  if (filters.type && filters.type !== 'all') rows = rows.filter((row) => row.device_type === filters.type)
  if (filters.query) rows = rows.filter((row) => matchesQuery(row, filters.query))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HyperFamily Branch Monitor'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Inventory', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    { header: 'Branch', key: 'branch_name', width: 22 },
    { header: 'Branch Code', key: 'branch_code', width: 15 },
    { header: 'Warehouse Code', key: 'branch_warehouse_code', width: 18 },
    { header: 'Device Type', key: 'device_type', width: 17 },
    { header: 'Model', key: 'model', width: 24 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Hostname', key: 'hostname', width: 22 },
    { header: 'IP', key: 'ip', width: 17 },
    { header: 'Port', key: 'port', width: 10 },
    { header: 'Location', key: 'location', width: 22 },
    { header: 'Asset Code', key: 'asset_code', width: 20 },
    { header: 'Serial Number', key: 'serial_number', width: 22 },
    { header: 'Connection Type', key: 'connection_type', width: 18 },
    { header: 'Connection Port', key: 'connection_port', width: 18 },
    { header: 'ESXI Version', key: 'esxi_version', width: 16 },
    { header: 'Software Version', key: 'version', width: 18 },
    { header: 'User', key: 'user', width: 20 },
    { header: 'Domain', key: 'domain', width: 18 },
    { header: 'Checkout Number', key: 'checkout_number', width: 17 },
    { header: 'Brand', key: 'brand', width: 18 },
    { header: 'Terminal ID', key: 'terminal_id', width: 18 },
    { header: 'Acceptance ID', key: 'acceptance_id', width: 18 },
    { header: 'Switch Ports', key: 'switch_ports_summary', width: 48 },
    { header: 'Dashboard', key: 'dashboard_visibility', width: 13 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Last Ping (ms)', key: 'ping_time', width: 15 }
  ]

  rows.forEach((row) => sheet.addRow({
    ...row,
    switch_ports_summary: formatSwitchPorts(row.switch_ports),
    dashboard_visibility: row.is_dashboard_visible ? 'Shown' : 'Hidden'
  }))

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E81AC' } }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: sheet.columnCount } }
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: rowNumber > 1 }
    if (rowNumber > 1 && rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6FA' } }
  })
  let filePath = outputPath
  if (!filePath) {
    const date = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog({
      title: 'Save inventory workbook',
      defaultPath: `Inventory_${clean(filters.branch)}_${clean(filters.type)}_${date}.xlsx`,
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    filePath = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`
  }

  await workbook.xlsx.writeFile(filePath)
  database.audit('Admin', 'INVENTORY_EXPORT', filePath, `${rows.length} devices exported`)
  return { success: true, path: filePath, count: rows.length }
}

async function createImportTemplate(database, outputPath = null, actor = 'Admin') {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HyperFamily Branch Monitor'
  workbook.created = new Date()

  const instructions = workbook.addWorksheet('Instructions')
  instructions.columns = [{ width: 25 }, { width: 105 }]
  instructions.addRows([
    ['HyperFamily Excel Import', 'Complete the Branches, Devices, and Switch Ports sheets. Do not rename sheets or column headers.'],
    ['Required branch fields', 'Name, Code, and Warehouse Code. Branch Code and Warehouse Code must each be unique.'],
    ['Required device fields', 'Branch Code, Device Type, Device Name, and IP. Every device must have a name.'],
    ['Device types', DEVICE_TYPES.join(', ')],
    ['Dashboard values', 'Use Yes or No. Blank is treated as No.'],
    ['Switch ports', 'Add Switch port records to the Switch Ports sheet. Match each Switch using Branch Code, Device Name, and Device IP.'],
    ['Update matching', 'Branches match by Branch Code. Routers match the one Router in their branch. Other devices match by Branch Code, Device Type, and IP.'],
    ['One Router per branch', 'Only one Router row is allowed for each Branch Code. Import updates an existing branch Router instead of adding a second one.'],
    ['Atomic import', 'The complete workbook is validated first. If any row is invalid, nothing is saved.'],
    ['Optional cells', 'When a matching record is updated, blank optional cells are saved as empty values.']
  ])
  instructions.getRow(1).height = 30
  instructions.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFECEFF4' } }
  instructions.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E81AC' } }
  instructions.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true }
    if (rowNumber > 1) row.getCell(1).font = { bold: true, color: { argb: 'FF5E81AC' } }
  })

  const branches = workbook.addWorksheet('Branches')
  branches.columns = BRANCH_HEADERS.map((header) => ({ header, key: normalizedHeader(header).replaceAll(' ', '_') }))
  styleDataSheet(branches)

  const devices = workbook.addWorksheet('Devices')
  devices.columns = DEVICE_HEADERS.map((header) => ({ header, key: normalizedHeader(header).replaceAll(' ', '_') }))
  styleDataSheet(devices)
  for (let row = 2; row <= 501; row += 1) {
    devices.getCell(row, DEVICE_HEADERS.indexOf('Device Type') + 1).dataValidation = { type: 'list', allowBlank: false, formulae: [`"${DEVICE_TYPES.join(',')}"`] }
    devices.getCell(row, DEVICE_HEADERS.indexOf('Dashboard') + 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] }
  }

  const switchPorts = workbook.addWorksheet('Switch Ports')
  switchPorts.columns = SWITCH_PORT_HEADERS.map((header) => ({ header, key: normalizedHeader(header).replaceAll(' ', '_') }))
  styleDataSheet(switchPorts)
  for (let row = 2; row <= 501; row += 1) {
    switchPorts.getCell(row, SWITCH_PORT_HEADERS.indexOf('Status') + 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"up,down,disabled"'] }
  }

  let filePath = outputPath
  if (!filePath) {
    const result = await dialog.showSaveDialog({
      title: 'Save Excel import template',
      defaultPath: 'HyperFamily_Import_Template.xlsx',
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    filePath = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`
  }

  await workbook.xlsx.writeFile(filePath)
  database?.audit(actor, 'IMPORT_TEMPLATE_DOWNLOAD', filePath, 'Excel import template created')
  return { success: true, path: filePath }
}

function readSheetRows(workbook, sheetName, expectedHeaders, errors) {
  const sheet = workbook.getWorksheet(sheetName)
  if (!sheet) {
    errors.push(`Missing worksheet: ${sheetName}`)
    return []
  }

  const columns = new Map()
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    columns.set(normalizedHeader(cellText(cell)), columnNumber)
  })
  for (const header of expectedHeaders) {
    if (!columns.has(normalizedHeader(header))) errors.push(`${sheetName}: missing column "${header}"`)
  }
  if (errors.length) return []

  const rows = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const values = {}
    for (const header of expectedHeaders) values[header] = cellText(row.getCell(columns.get(normalizedHeader(header))))
    if (Object.values(values).every((value) => value === '')) return
    rows.push({ rowNumber, values })
  })
  return rows
}

function canonicalDeviceType(value) {
  const compact = String(value || '').replace(/[\s_-]/g, '').toLowerCase()
  return DEVICE_TYPES.find((type) => type.toLowerCase() === compact) || null
}

function parseOptionalInteger(value, label, rowLabel, errors, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    errors.push(`${rowLabel}: ${label} must be a whole number from ${min}${max < Number.MAX_SAFE_INTEGER ? ` to ${max}` : ''}`)
    return null
  }
  return number
}

function parseDashboard(value, rowLabel, errors) {
  if (!value) return false
  const normalized = String(value).trim().toLowerCase()
  if (['yes', 'shown', 'show', 'true', '1'].includes(normalized)) return true
  if (['no', 'hidden', 'hide', 'false', '0'].includes(normalized)) return false
  errors.push(`${rowLabel}: Dashboard must be Yes or No`)
  return false
}

function parseImportWorkbook(workbook) {
  const errors = []
  const branchRows = readSheetRows(workbook, 'Branches', BRANCH_HEADERS, errors)
  const deviceRows = readSheetRows(workbook, 'Devices', DEVICE_HEADERS, errors)
  const portRows = readSheetRows(workbook, 'Switch Ports', SWITCH_PORT_HEADERS, errors)
  if (!branchRows.length) errors.push('Branches: add at least one branch row before importing')
  if (errors.length) throw new Error(`Excel import validation failed:\n${errors.join('\n')}`)

  const branches = []
  const branchCodes = new Set()
  const warehouseCodes = new Set()
  for (const { rowNumber, values } of branchRows) {
    const rowLabel = `Branches row ${rowNumber}`
    const name = values.Name
    const code = values.Code
    const warehouseCode = values['Warehouse Code']
    if (!name) errors.push(`${rowLabel}: Name is required`)
    if (!code) errors.push(`${rowLabel}: Code is required`)
    if (!warehouseCode) errors.push(`${rowLabel}: Warehouse Code is required`)
    if (code && !/^[A-Za-z0-9_-]+$/.test(code)) errors.push(`${rowLabel}: Code contains unsupported characters`)
    if (warehouseCode && !/^[A-Za-z0-9_-]+$/.test(warehouseCode)) errors.push(`${rowLabel}: Warehouse Code contains unsupported characters`)
    if (code.length > 20) errors.push(`${rowLabel}: Code must contain no more than 20 characters`)
    if (warehouseCode.length > 40) errors.push(`${rowLabel}: Warehouse Code must contain no more than 40 characters`)
    if (values['IP Link1'] && !validHost(values['IP Link1'])) errors.push(`${rowLabel}: IP Link1 must be a valid IP address or hostname`)
    if (values['IP Link2'] && !validHost(values['IP Link2'])) errors.push(`${rowLabel}: IP Link2 must be a valid IP address or hostname`)
    const codeKey = code.toLowerCase()
    const warehouseKey = warehouseCode.toLowerCase()
    if (code && branchCodes.has(codeKey)) errors.push(`${rowLabel}: duplicate Branch Code "${code}"`)
    if (warehouseCode && warehouseCodes.has(warehouseKey)) errors.push(`${rowLabel}: duplicate Warehouse Code "${warehouseCode}"`)
    branchCodes.add(codeKey)
    warehouseCodes.add(warehouseKey)
    branches.push({
      name, code, warehouse_code: warehouseCode,
      link1: values.Link1, ip_link1: values['IP Link1'], link2: values.Link2, ip_link2: values['IP Link2'],
      manager_name: values['Manager Name'], manager_tell: values['Manager Tell'],
      deputy_name: values['Deputy Name'], deputy_tell: values['Deputy Tell']
    })
  }

  const devices = []
  const deviceKeys = new Set()
  const routerBranches = new Set()
  const importedSwitches = new Map()
  for (const { rowNumber, values } of deviceRows) {
    const rowLabel = `Devices row ${rowNumber}`
    const branchCode = values['Branch Code']
    const deviceType = canonicalDeviceType(values['Device Type'])
    const name = values['Device Name']
    const ip = values.IP
    if (!branchCode) errors.push(`${rowLabel}: Branch Code is required`)
    if (!deviceType) errors.push(`${rowLabel}: Device Type must be one of ${DEVICE_TYPES.join(', ')}`)
    if (!name) errors.push(`${rowLabel}: Device Name is required`)
    if (!ip) errors.push(`${rowLabel}: IP is required`)
    if (branchCode && !branchCodes.has(branchCode.toLowerCase())) errors.push(`${rowLabel}: Branch Code "${branchCode}" is not defined in the Branches sheet`)
    if (ip && !validHost(ip)) errors.push(`${rowLabel}: IP must be a valid IP address or hostname`)

    const key = importKey(branchCode, deviceType, ip)
    if (branchCode && deviceType && ip && deviceKeys.has(key)) errors.push(`${rowLabel}: duplicate device identity for ${branchCode}, ${deviceType}, ${ip}`)
    deviceKeys.add(key)
    if (deviceType === 'Router') {
      const routerKey = importKey(branchCode)
      if (routerBranches.has(routerKey)) errors.push(`${rowLabel}: only one Router is allowed per branch`)
      routerBranches.add(routerKey)
    }

    const device = {
      branch_code: branchCode,
      device_type: deviceType || values['Device Type'],
      name,
      model: values.Model,
      location: values.Location,
      ip,
      port: parseOptionalInteger(values.Port, 'Port', rowLabel, errors, { min: 1, max: 65535 }),
      asset_code: values['Asset Code'],
      connection_type: values['Connection Type'],
      connection_port: values['Connection Port'],
      hostname: values.Hostname,
      user: values.User,
      domain: values.Domain,
      esxi_version: values['ESXI Version'],
      version: values['Software Version'],
      terminal_id: values['Terminal ID'],
      acceptance_id: values['Acceptance ID'],
      brand: values.Brand,
      checkout_number: parseOptionalInteger(values['Checkout Number'], 'Checkout Number', rowLabel, errors),
      serial_number: values['Serial Number'],
      is_dashboard_visible: parseDashboard(values.Dashboard, rowLabel, errors),
      switch_ports: []
    }
    devices.push(device)
    if (deviceType === 'Switch' && branchCode && ip) importedSwitches.set(importKey(branchCode, ip), device)
  }

  const portNumbers = new Map()
  for (const { rowNumber, values } of portRows) {
    const rowLabel = `Switch Ports row ${rowNumber}`
    const branchCode = values['Branch Code']
    const deviceName = values['Device Name']
    const deviceIp = values['Device IP']
    const status = (values.Status || 'up').toLowerCase()
    if (!branchCode) errors.push(`${rowLabel}: Branch Code is required`)
    if (!deviceName) errors.push(`${rowLabel}: Device Name is required`)
    if (!deviceIp) errors.push(`${rowLabel}: Device IP is required`)
    if (deviceIp && !validHost(deviceIp)) errors.push(`${rowLabel}: Device IP must be a valid IP address or hostname`)
    if (values.IP && !validHost(values.IP)) errors.push(`${rowLabel}: IP must be a valid IP address or hostname`)
    if (!['up', 'down', 'disabled'].includes(status)) errors.push(`${rowLabel}: Status must be up, down, or disabled`)
    const portNumber = parseOptionalInteger(values['Port Number'], 'Port Number', rowLabel, errors)
    if (!values['Port Number']) errors.push(`${rowLabel}: Port Number is required`)

    const switchKey = importKey(branchCode, deviceIp)
    const device = importedSwitches.get(switchKey)
    if (!device) {
      errors.push(`${rowLabel}: no matching Switch exists in the Devices sheet for ${branchCode} / ${deviceIp}`)
      continue
    }
    if (deviceName.toLowerCase() !== device.name.toLowerCase()) errors.push(`${rowLabel}: Device Name does not match ${device.name}`)
    if (!portNumbers.has(switchKey)) portNumbers.set(switchKey, new Set())
    if (portNumber && portNumbers.get(switchKey).has(portNumber)) errors.push(`${rowLabel}: duplicate Port Number ${portNumber} for this Switch`)
    if (portNumber) portNumbers.get(switchKey).add(portNumber)
    device.switch_ports.push({ port_number: portNumber, vlan: values.VLAN, status, ip: values.IP, details: values.Details })
  }

  if (errors.length) {
    const shown = errors.slice(0, 30)
    const remaining = errors.length - shown.length
    throw new Error(`Excel import validation failed:\n${shown.join('\n')}${remaining > 0 ? `\n…and ${remaining} more errors` : ''}`)
  }
  return { branches, devices }
}

async function importDirectory(database, inputPath = null, actor = 'Admin') {
  let filePath = inputPath
  if (!filePath) {
    const result = await dialog.showOpenDialog({
      title: 'Import branches and devices from Excel',
      properties: ['openFile'],
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    filePath = result.filePaths[0]
  }
  if (path.extname(filePath).toLowerCase() !== '.xlsx') throw new Error('Select an Excel .xlsx workbook created from the import template')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const payload = parseImportWorkbook(workbook)
  const result = database.importDirectory(payload, actor)
  return { ...result, path: filePath }
}

module.exports = {
  BRANCH_HEADERS,
  DEVICE_HEADERS,
  SWITCH_PORT_HEADERS,
  createImportTemplate,
  exportInventory,
  importDirectory,
  parseImportWorkbook
}
