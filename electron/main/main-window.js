// Electron links BoringSSL, which dropped the small named MODP groups that
// older switches still require for SSH key exchange. This restores them and
// must run before anything pulls in ssh2, which captures the crypto functions
// it needs at require time.
require('../services/dh-compat').installDhCompat()

const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { app, BrowserWindow, Menu, protocol, net, shell, session, screen, ipcMain } = require('electron')
const isDev = process.env.NODE_ENV === 'development'
const { SecureVault } = require('../services/crypto.service')
const { AppDatabase } = require('../database')
const { PingMonitor } = require('../services/ping.service')
const { RemoteService } = require('../services/remote.service')
const { VPNService } = require('../services/vpn.service')
const { TerminalService } = require('../services/terminal.service')
const { UpdateService } = require('../services/update.service')
const { StoreUpdateService } = require('../services/store-update.service')
const { StoreInstallService } = require('../services/store-install.service')
const { SmbSessionManager } = require('../services/smb.service')
let storeUpdateServiceRef = null
const { registerIpcHandlers } = require('./ipc-handlers')
const { registerDeviceWebviewHandlers } = require('./webview-window')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }])

// Electron kills the process and shows a raw "A JavaScript error occurred in
// the main process" dialog for anything unhandled. Log it and keep the app
// alive instead: a broken optional feature should never take the window down.
process.on('uncaughtException', (error) => {
  console.error('[main] uncaught exception:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandled rejection:', reason)
})

let mainWindow = null
let database = null
let pingMonitor = null
let vpnService = null
let terminalService = null

function sendEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function registerAppProtocol() {
  const root = path.resolve(__dirname, '../../out')
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let requested = decodeURIComponent(url.pathname)
    if (requested.endsWith('/')) requested += 'index.html'
    if (!path.extname(requested)) requested += '/index.html'
    const filePath = path.resolve(root, `.${requested}`)
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1500, workArea.width), height: Math.min(940, workArea.height),
    minWidth: Math.min(360, workArea.width), minHeight: Math.min(560, workArea.height),
    show: false, backgroundColor: '#2E3440', title: 'HyperFamily Branch Monitor',
    icon: path.join(__dirname, '../../public/electron/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      spellcheck: false, devTools: isDev, webviewTag: false
    }
  })
  Menu.setApplicationMenu(null)
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Uniform viewport scaling: the renderer is designed around a 1366×768
  // layout viewport. Zooming the page so the real window maps onto that
  // viewport makes the interface look exactly the same on every monitor —
  // higher resolutions render the identical layout, simply larger, and
  // smaller ones simply smaller. (getContentSize is DPI-aware, so Windows
  // display scaling is compensated automatically.) The browser preview
  // mirrors this with a CSS zoom in AppProviders.
  //
  // The factor is snapped to quarter steps instead of hundredths. An arbitrary
  // factor such as 1.12 — which is what a maximised 1920×1080 window at 125 %
  // Windows scaling produced — puts every glyph on a fractional device pixel,
  // and the interface is dominated by 8–13 px labels, so the whole screen read
  // as slightly out of focus. Quarter steps keep the same uniform behaviour
  // while giving the text rasteriser positions it can actually resolve.
  const applyViewportScale = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [width, height] = mainWindow.getContentSize()
    const scale = Math.min(width / 1366, height / 768)
    const zoom = Math.min(2.5, Math.max(0.5, Math.round(scale * 4) / 4))
    if (Math.abs(mainWindow.webContents.getZoomFactor() - zoom) > 0.015) mainWindow.webContents.setZoomFactor(zoom)
  }
  mainWindow.on('resize', applyViewportScale)
  mainWindow.on('maximize', applyViewportScale)
  mainWindow.on('unmaximize', applyViewportScale)
  mainWindow.webContents.on('did-finish-load', applyViewportScale)
  applyViewportScale()
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { const parsed = new URL(url); if (['https:', 'mailto:'].includes(parsed.protocol)) shell.openExternal(url) } catch {}
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:3000') : url.startsWith('app://hyperfamily/')
    if (!allowed) { event.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url) }
  })
  if (isDev) mainWindow.loadURL('http://localhost:3000/login')
  else mainWindow.loadURL('app://hyperfamily/login/')
  mainWindow.webContents.on('destroyed', () => terminalService?.closeAllFor(mainWindow?.webContents))
  mainWindow.on('closed', () => { mainWindow = null })
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) app.quit()
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } })
  app.whenReady().then(() => {
    if (!isDev) registerAppProtocol()
    const csp = isDev
      ? "default-src 'self' http://localhost:3000 ws://localhost:3000; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:3000 ws://localhost:3000; font-src 'self' data:"
      : "default-src 'self' app:; script-src 'self' 'unsafe-inline' app:; style-src 'self' 'unsafe-inline' app:; img-src 'self' data: blob: app:; connect-src 'self' app:; font-src 'self' data: app:"
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } }))

    const vault = new SecureVault(app.getPath('userData'))
    // The recovery tool looks in a canonical folder that does not depend on
    // how the packaged app resolves its own userData name, so the file is
    // mirrored there as well (v2.0.20).
    const recoveryFile = path.join(app.getPath('appData'), 'HyperFamily Branch Monitor', 'credentials.dat')
    database = new AppDatabase(app.getPath('userData'), vault, recoveryFile)
    const remoteService = new RemoteService(database)
    vpnService = new VPNService(database, app.getPath('userData'), sendEvent)
    // Keeps the header indicator honest: the real tunnel state is re-checked
    // every second, so it also turns red if the tunnel drops on its own.
    vpnService.startHealthMonitor()
    const updateService = new UpdateService(sendEvent)
    // Restore the persisted update channel (main/beta). With nothing stored,
    // prerelease builds follow beta and stable builds follow main.
    try { updateService.setChannel(database.getSettings().update_channel) } catch { /* default channel stays */ }
    terminalService = new TerminalService(database, sendEvent)
    // Credentials are read fresh on every call so a change in Settings takes
    // effect immediately, without restarting the app.
    const storeUpdateService = new StoreUpdateService(sendEvent, {
      agentSourcePath: app.isPackaged
        ? require('path').join(process.resourcesPath, 'agent', 'HyperFamilyStoreAgent.exe')
        : require('path').join(__dirname, '../../agent/build/HyperFamilyStoreAgent.exe'),
      getCredentials: () => {
        try { return SmbSessionManager.credentialsFrom(database.getSettings()) } catch { return null }
      },
      // Read per call so changing it in Settings applies without a restart.
      getProgramName: () => {
        try { return database.getSettings().store_program_name || '' } catch { return '' }
      }
    })
    storeUpdateServiceRef = storeUpdateService
    const storeInstallService = new StoreInstallService(sendEvent, {
      getCredentials: () => {
        try { return SmbSessionManager.credentialsFrom(database.getSettings()) } catch { return null }
      }
    })
    registerIpcHandlers({ database, remoteService, vpnService, terminalService, updateService, storeUpdateService, storeInstallService, getWindow: () => mainWindow })
    registerDeviceWebviewHandlers(ipcMain)
    createWindow()
    pingMonitor = new PingMonitor(database, sendEvent)
    pingMonitor.start()
    database.audit('System', 'APP_START', app.getVersion(), `${process.platform} ${process.arch}`)
  })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { pingMonitor?.stop(); vpnService?.stop(); terminalService?.stop(); storeUpdateServiceRef?.smb?.releaseAll?.().catch(() => {}); if (database) { try { database.audit('System', 'APP_STOP', app.getVersion(), 'Normal shutdown'); database.close() } catch {} } })
