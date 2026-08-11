const path = require('path')
const ExcelJS = require('exceljs')
const { dialog } = require('electron')

function clean(value) { return String(value || 'All').replace(/[^a-z0-9_-]/gi, '_') }

async function exportInventory(database, filters) {
  const rows = database.listInventory().filter((item) => (filters.branch === 'all' || String(item.branch_id) === String(filters.branch)) && (filters.type === 'all' || item.device_type === filters.type) && (!filters.query || [item.name, item.ip, item.model, item.asset_code, item.hostname].some((v) => String(v || '').toLowerCase().includes(String(filters.query).toLowerCase()))))
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HyperFamily Branch Monitor'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('Devices', { views: [{ state: 'frozen', ySplit: 1 }] })
  worksheet.columns = [
    { header: 'Branch Name', key: 'branch_name', width: 24 }, { header: 'Device Type', key: 'device_type', width: 16 },
    { header: 'Device Name', key: 'name', width: 24 }, { header: 'IP Address', key: 'ip', width: 18 },
    { header: 'Port', key: 'port', width: 10 }, { header: 'Model', key: 'model', width: 22 },
    { header: 'Location', key: 'location', width: 22 }, { header: 'Asset Code', key: 'asset_code', width: 18 },
    { header: 'Hostname', key: 'hostname', width: 24 }, { header: 'Status', key: 'status', width: 12 }
  ]
  const header = worksheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E81AC' } }
  header.alignment = { vertical: 'middle' }
  header.height = 24
  rows.forEach((item) => worksheet.addRow({ ...item, name: item.name || '—', port: item.port || '—', model: item.model || '—', location: item.location || '—', asset_code: item.asset_code || '—', hostname: item.hostname || '—', status: item.status || 'Unknown' }))
  worksheet.eachRow((row, index) => {
    row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFD8DEE9' } } }; if (index > 1) cell.alignment = { vertical: 'middle' } })
    if (index > 1) row.height = 21
  })
  worksheet.autoFilter = { from: 'A1', to: 'J1' }
  const date = new Date().toISOString().slice(0, 10)
  const result = await dialog.showSaveDialog({ title: 'Save inventory workbook', defaultPath: `Inventory_${clean(filters.branch)}_${clean(filters.type)}_${date}.xlsx`, filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] })
  if (result.canceled || !result.filePath) return { canceled: true }
  const filePath = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`
  await workbook.xlsx.writeFile(filePath)
  database.audit('Admin', 'INVENTORY_EXPORT', filePath, `${rows.length} devices exported`)
  return { success: true, path: filePath, count: rows.length }
}

module.exports = { exportInventory }
