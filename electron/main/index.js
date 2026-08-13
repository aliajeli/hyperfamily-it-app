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
    database = new AppDatabase(app.getPath('userData'), vault)
    const remoteService = new RemoteService(database)
    vpnService = new VPNService(database, app.getPath('userData'), sendEvent)
    const updateService = new UpdateService(sendEvent)
    terminalService = new TerminalService(database, sendEvent)
    registerIpcHandlers({ database, remoteService, vpnService, terminalService, updateService, getWindow: () => mainWindow })
    registerDeviceWebviewHandlers(ipcMain)
    createWindow()
    pingMonitor = new PingMonitor(database, sendEvent)
    pingMonitor.start()
    database.audit('System', 'APP_START', app.getVersion(), `${process.platform} ${process.arch}`)
  })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { pingMonitor?.stop(); vpnService?.stop(); terminalService?.stop(); if (database) { try { database.audit('System', 'APP_STOP', app.getVersion(), 'Normal shutdown'); database.close() } catch {} } })
