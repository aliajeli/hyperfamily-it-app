const path = require('path')
const ExcelJS = require('exceljs')
const { dialog } = require('electron')

function clean(value) { return String(value || 'All').replace(/[^a-z0-9_-]/gi, '_') }

function matchesQuery(device, query) {
  if (!query) return true
  const needle = String(query).toLowerCase()
  const values = [
    device.name, device.hostname, device.ip, device.port, device.model, device.asset_code, device.serial_number,
    device.location, device.connection_type, device.connection_port, device.esxi_version, device.version,
    device.user, device.domain, device.checkout_number, device.brand, device.terminal_id, device.acceptance_id,
    device.branch_name, device.branch_code,
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
  sheet.autoFilter = { from: 'A1', to: `Y${Math.max(1, rows.length + 1)}` }
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

module.exports = { exportInventory }
