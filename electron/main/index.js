const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { app, BrowserWindow, Menu, protocol, net, shell, session } = require('electron')
const isDev = process.env.NODE_ENV === 'development'
const { SecureVault } = require('../services/crypto.service')
const { AppDatabase } = require('../database')
const { PingMonitor } = require('../services/ping.service')
const { RemoteService } = require('../services/remote.service')
const { VPNService } = require('../services/vpn.service')
const { UpdateService } = require('../services/update.service')
const { registerIpcHandlers } = require('./ipc-handlers')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }])

let mainWindow = null
let database = null
let pingMonitor = null
let vpnService = null

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
  mainWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1180, minHeight: 720,
    show: false, backgroundColor: '#2E3440', title: 'HyperFamily Branch Monitor',
    icon: path.join(__dirname, '../../public/electron/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      spellcheck: false, devTools: isDev
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
    registerIpcHandlers({ database, remoteService, vpnService, updateService, getWindow: () => mainWindow })
    createWindow()
    pingMonitor = new PingMonitor(database, sendEvent)
    pingMonitor.start()
    database.audit('System', 'APP_START', app.getVersion(), `${process.platform} ${process.arch}`)
  })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { pingMonitor?.stop(); vpnService?.stop(); if (database) { try { database.audit('System', 'APP_STOP', app.getVersion(), 'Normal shutdown'); database.close() } catch {} } })
