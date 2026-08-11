const { ipcMain, dialog, shell, app } = require('electron')
const fs = require('fs')
const { exportInventory } = require('../services/excel.service')

function friendlyError(error) {
  if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) return new Error('That name or code already exists')
  if (String(error.code).includes('SQLITE_CONSTRAINT_FOREIGNKEY')) return new Error('The selected related record no longer exists')
  return error instanceof Error ? error : new Error(String(error))
}

function registerIpcHandlers({ database, remoteService, vpnService, updateService, getWindow }) {
  const sessions = new Set()
  const trusted = (event) => {
    const url = event.senderFrame?.url || ''
    if (!(url.startsWith('app://hyperfamily/') || url.startsWith('http://localhost:3000'))) throw new Error('Untrusted IPC sender')
  }
  const secure = (handler) => async (event, ...args) => {
    trusted(event)
    if (!sessions.has(event.sender.id)) throw new Error('Authentication required')
    try { return await handler(event, ...args) } catch (error) { throw friendlyError(error) }
  }
  const open = (handler) => async (event, ...args) => {
    trusted(event)
    try { return await handler(event, ...args) } catch (error) { throw friendlyError(error) }
  }

  ipcMain.handle('auth:login', open((event, payload) => {
    const user = database.authenticate(payload?.username, payload?.password)
    if (!user) throw new Error('Invalid username or password')
    sessions.add(event.sender.id)
    event.sender.once('destroyed', () => sessions.delete(event.sender.id))
    return user
  }))
  ipcMain.handle('auth:status', open((event) => ({ authenticated: sessions.has(event.sender.id) })))
  ipcMain.handle('auth:logout', open((event) => { sessions.delete(event.sender.id); database.audit('Admin', 'LOGOUT', 'Application', 'Local logout'); return { success: true } }))
  ipcMain.handle('auth:change-password', secure((_event, payload) => database.changePassword('Admin', payload.currentPassword, payload.newPassword)))

  ipcMain.handle('branches:list', secure(() => database.listBranches()))
  ipcMain.handle('branches:save', secure((_event, payload) => database.saveBranch(payload)))
  ipcMain.handle('branches:remove', secure((_event, id) => database.deleteBranch(id)))
  ipcMain.handle('devices:list', secure(() => database.listDevices()))
  ipcMain.handle('devices:save', secure((_event, payload) => database.saveDevice(payload)))
  ipcMain.handle('devices:remove', secure((_event, id) => database.deleteDevice(id)))
  ipcMain.handle('monitor:snapshot', secure(() => { const settings = database.getSettings(); return database.getMonitorSnapshot(settings.ping_history_count || 30) }))

  ipcMain.handle('settings:get', secure(() => database.getSettings()))
  ipcMain.handle('settings:save', secure((_event, patch) => database.saveSettings(patch)))
  ipcMain.handle('credentials:list', secure(() => database.listCredentials()))
  ipcMain.handle('credentials:reveal', secure((_event, id) => database.revealCredential(id)))
  ipcMain.handle('credentials:save', secure((_event, payload) => database.saveCredential(payload)))
  ipcMain.handle('credentials:remove', secure((_event, id) => database.deleteCredential(id)))
  ipcMain.handle('credentials:mappings', secure(() => database.getMappings()))
  ipcMain.handle('credentials:save-mappings', secure((_event, mappings) => database.saveMappings(mappings)))

  ipcMain.handle('inventory:list', secure(() => database.listInventory()))
  ipcMain.handle('inventory:export', secure((_event, filters) => exportInventory(database, filters || {})))
  ipcMain.handle('remote:connect', secure((_event, payload) => remoteService.connect(payload)))
  ipcMain.handle('vpn:status', secure(() => vpnService.getStatus()))
  ipcMain.handle('vpn:connect', secure((_event, mode) => vpnService.connect(mode)))
  ipcMain.handle('vpn:disconnect', secure(() => vpnService.disconnect()))
  ipcMain.handle('update:check', secure(() => updateService.check()))
  ipcMain.handle('update:download', secure(() => updateService.download()))
  ipcMain.handle('update:install', secure(() => updateService.install()))
  ipcMain.handle('audit:list', secure((_event, limit) => database.listAudit(limit)))

  ipcMain.handle('dialog:select-file', secure(async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(getWindow(), { title: options.title || 'Select file', properties: ['openFile'], filters: Array.isArray(options.filters) ? options.filters : [] })
    return result.canceled ? null : result.filePaths[0]
  }))
  ipcMain.handle('app:info', secure(() => ({ version: app.getVersion(), platform: `${process.platform} ${process.arch}`, dataPath: app.getPath('userData'), databasePath: database.filePath })))
  ipcMain.handle('app:open-external', secure(async (_event, value) => {
    const url = new URL(value)
    if (!['https:', 'mailto:'].includes(url.protocol)) throw new Error('Only HTTPS and email links are allowed')
    await shell.openExternal(url.toString())
    return { success: true }
  }))
  ipcMain.handle('app:path-exists', secure((_event, value) => fs.existsSync(String(value || ''))))

  return () => { ipcMain.removeHandler('auth:login') }
}

module.exports = { registerIpcHandlers }
