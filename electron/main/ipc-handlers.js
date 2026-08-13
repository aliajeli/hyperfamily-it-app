const { ipcMain, dialog, shell, app } = require('electron')
const fs = require('fs')
const { createImportTemplate, exportInventory, importDirectory } = require('../services/excel.service')

function friendlyError(error) {
  if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE') && String(error.message).includes('devices.branch_id')) return new Error('Only one Router can be defined for each branch')
  if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) return new Error('That name, Branch Code, Warehouse Code, or device identity already exists')
  if (String(error.code).includes('SQLITE_CONSTRAINT_FOREIGNKEY')) return new Error('The selected related record no longer exists')
  return error instanceof Error ? error : new Error(String(error))
}

function registerIpcHandlers({ database, remoteService, vpnService, updateService, getWindow }) {
  const sessions = new Map()
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
    sessions.set(event.sender.id, user)
    event.sender.once('destroyed', () => sessions.delete(event.sender.id))
    return user
  }))
  ipcMain.handle('auth:status', open((event) => ({ authenticated: sessions.has(event.sender.id), user: sessions.get(event.sender.id) || null })))
  ipcMain.handle('auth:logout', open((event) => {
    const session = sessions.get(event.sender.id)
    sessions.delete(event.sender.id)
    database.audit(session?.username || 'System', 'LOGOUT', 'Application', 'Local logout')
    return { success: true }
  }))
  ipcMain.handle('auth:update-credentials', secure((event, payload) => {
    const session = sessions.get(event.sender.id)
    const updatedUser = database.updateCredentials(session.id, payload)
    sessions.set(event.sender.id, updatedUser)
    return updatedUser
  }))
  ipcMain.handle('auth:change-password', secure((event, payload) => {
    const session = sessions.get(event.sender.id)
    const updatedUser = database.updateCredentials(session.id, { ...payload, newUsername: session.username })
    sessions.set(event.sender.id, updatedUser)
    return { success: true }
  }))

  ipcMain.handle('branches:list', secure(() => database.listBranches()))
  ipcMain.handle('branches:save', secure((event, payload) => database.saveBranch(payload, sessions.get(event.sender.id).username)))
  ipcMain.handle('branches:remove', secure((event, id) => database.deleteBranch(id, sessions.get(event.sender.id).username)))
  ipcMain.handle('devices:list', secure(() => database.listDevices()))
  ipcMain.handle('devices:save', secure((event, payload) => database.saveDevice(payload, sessions.get(event.sender.id).username)))
  ipcMain.handle('devices:remove', secure((event, id) => database.deleteDevice(id, sessions.get(event.sender.id).username)))
  ipcMain.handle('monitor:snapshot', secure(() => { const settings = database.getSettings(); return database.getMonitorSnapshot(settings.ping_history_count || 30) }))

  ipcMain.handle('settings:get', secure(() => database.getSettings()))
  ipcMain.handle('settings:save', secure((event, patch) => database.saveSettings(patch, sessions.get(event.sender.id).username)))
  ipcMain.handle('credentials:list', secure(() => database.listCredentials()))
  ipcMain.handle('credentials:reveal', secure((_event, id) => database.revealCredential(id)))
  ipcMain.handle('credentials:save', secure((event, payload) => database.saveCredential(payload, sessions.get(event.sender.id).username)))
  ipcMain.handle('credentials:remove', secure((event, id) => database.deleteCredential(id, sessions.get(event.sender.id).username)))
  ipcMain.handle('credentials:mappings', secure(() => database.getMappings()))
  ipcMain.handle('credentials:save-mappings', secure((event, mappings) => database.saveMappings(mappings, sessions.get(event.sender.id).username)))

  ipcMain.handle('inventory:list', secure(() => database.listInventory()))
  ipcMain.handle('inventory:export', secure((_event, filters) => exportInventory(database, filters || {})))
  ipcMain.handle('inventory:download-template', secure((event) => createImportTemplate(database, null, sessions.get(event.sender.id).username)))
  ipcMain.handle('inventory:import', secure((event) => importDirectory(database, null, sessions.get(event.sender.id).username)))
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
