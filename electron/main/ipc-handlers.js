const { ipcMain, dialog, shell, app } = require('electron')
const fs = require('fs')
const { createImportTemplate, exportInventory, importDirectory } = require('../services/excel.service')
const { openDeviceWebview, broadcastPalette } = require('./webview-window')

function friendlyError(error) {
  if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE') && String(error.message).includes('devices.branch_id')) return new Error('Only one Router can be defined for each branch')
  if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) return new Error('That name, Branch Code, Warehouse Code, or device identity already exists')
  if (String(error.code).includes('SQLITE_CONSTRAINT_FOREIGNKEY')) return new Error('The selected related record no longer exists')
  return error instanceof Error ? error : new Error(String(error))
}

function registerIpcHandlers({ database, remoteService, vpnService, terminalService, updateService, getWindow }) {
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
  // Must return the unified { types, devices } shape. Returning the legacy
  // types-only map made every per-device assignment invisible after a reload,
  // and the next save then wrote that empty set back — silently erasing them.
  ipcMain.handle('credentials:mappings', secure(() => database.getCredentialMap()))
  ipcMain.handle('credentials:credential-map', secure(() => database.getCredentialMap()))
  ipcMain.handle('credentials:for-device', secure((_event, deviceId) => database.listCredentialsForDevice(deviceId)))
  ipcMain.handle('credentials:save-mappings', secure((event, mappings) => database.saveMappings(mappings, sessions.get(event.sender.id).username)))
  // Simplified assignment flow: one device (or one whole type) at a time.
  ipcMain.handle('credentials:assign-device', secure((event, payload) =>
    database.setDeviceCredential(payload?.deviceId, payload?.credentialId ?? null, sessions.get(event.sender.id).username)))
  ipcMain.handle('credentials:assign-type', secure((event, payload) =>
    database.setTypeCredential(payload?.deviceType, payload?.credentialId ?? null, sessions.get(event.sender.id).username)))
  ipcMain.handle('credentials:overview', secure(() => database.listDeviceCredentialOverview()))

  ipcMain.handle('inventory:list', secure(() => database.listInventory()))
  ipcMain.handle('inventory:export', secure((_event, filters) => exportInventory(database, filters || {})))
  // Directory import: the operator downloads a template, fills one sheet per
  // device type, then imports it back. Both open a native file dialog.
  ipcMain.handle('directory:template', secure((event) => createImportTemplate(database, null, sessions.get(event.sender.id).username)))
  ipcMain.handle('directory:import', secure((event) => importDirectory(database, null, sessions.get(event.sender.id).username)))
  ipcMain.handle('remote:connect', secure(async (event, payload) => {
    const result = await remoteService.connect(payload, sessions.get(event.sender.id).username)
    // iLO and NVR open inside a themed application window rather than an
    // external browser, so the credential can be injected into the login form.
    if (result?.webview) {
      // Auto sign-in is a global preference; the renderer only supplies the palette.
      const autologin = database.getSettings().webview_autologin !== false
      return openDeviceWebview({ ...result.webview, palette: payload?.palette || {}, autologin }, getWindow())
    }
    return result
  }))
  ipcMain.handle('remote:probe', secure(() => remoteService.probe()))
  // The theme is applied by the renderer before anybody signs in (the login
  // screen is themed too), so this one carries no private data and must stay
  // outside the authentication guard — otherwise every launch logged
  // "Error invoking remote method 'remote:palette': Authentication required".
  ipcMain.handle('remote:palette', open((_event, palette) => { broadcastPalette(palette || {}); return true }))

  ipcMain.handle('terminal:targets', secure(() => terminalService.targets()))
  ipcMain.handle('terminal:open', secure((event, payload) => terminalService.open(payload || {}, event.sender, sessions.get(event.sender.id).username)))
  ipcMain.handle('terminal:write', secure((event, payload) => terminalService.write(payload?.sessionId, payload?.data ?? '', event.sender)))
  ipcMain.handle('terminal:resize', secure((event, payload) => terminalService.resize(payload?.sessionId, payload || {}, event.sender)))
  ipcMain.handle('terminal:close', secure((event, sessionId) => { terminalService.owned(sessionId, event.sender); return terminalService.close(sessionId, 'Closed by the operator') }))

  ipcMain.handle('snippets:list', secure(() => database.listSnippets()))
  ipcMain.handle('snippets:save', secure((event, payload) => database.saveSnippet(payload, sessions.get(event.sender.id).username)))
  ipcMain.handle('snippets:remove', secure((event, id) => database.deleteSnippet(id, sessions.get(event.sender.id).username)))

  ipcMain.handle('notes:list', secure(() => database.listNotes()))
  ipcMain.handle('notes:save', secure((event, payload) => database.saveNote(payload, sessions.get(event.sender.id).username)))
  ipcMain.handle('notes:remove', secure((event, id) => database.deleteNote(id, sessions.get(event.sender.id).username)))

  ipcMain.handle('vpn:status', secure(() => vpnService.getStatus()))
  ipcMain.handle('vpn:probe', secure(() => vpnService.probe()))
  ipcMain.handle('vpn:connect', secure((event, mode) => vpnService.connect(mode, sessions.get(event.sender.id).username)))
  ipcMain.handle('vpn:disconnect', secure((event) => vpnService.disconnect(sessions.get(event.sender.id).username)))
  // Reports the untouched gateway reply so a misbehaving portal can be identified.
  ipcMain.handle('vpn:diagnose', secure(() => vpnService.diagnose()))
  ipcMain.handle('update:check', secure(() => updateService.check()))
  // Lets the About page restore the Download/Install button after navigation.
  ipcMain.handle('update:state', secure(() => updateService.state()))
  ipcMain.handle('update:download', secure(() => updateService.download()))
  ipcMain.handle('update:pause', secure(() => updateService.pause()))
  ipcMain.handle('update:resume', secure(() => updateService.resume()))
  ipcMain.handle('update:stop', secure(() => updateService.stop()))
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
