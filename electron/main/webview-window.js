const path = require('node:path')
const { BrowserWindow, session, webContents } = require('electron')
const { buildLoginScript } = require('./autologin')

// Every auto-login window shares one partition so that a device that sets a
// session cookie on first sign-in is still authenticated on the next open,
// while staying isolated from the application's own session.
const PARTITION = 'persist:hyperfamily-devices'

const windows = new Map()
let partitionReady = false

function preparePartition() {
  if (partitionReady) return
  partitionReady = true
  const deviceSession = session.fromPartition(PARTITION)

  // Appliance web UIs (iLO, NVR) almost always ship a self-signed certificate.
  // Accepting it here is scoped to this partition only; the main application
  // session keeps full certificate verification.
  deviceSession.setCertificateVerifyProc((_request, callback) => callback(0))
  deviceSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(['fullscreen', 'clipboard-sanitized-write'].includes(permission))
  })
}

function paletteCss(palette = {}) {
  return Object.entries(palette)
    .filter(([, value]) => typeof value === 'string' && /^[\d\s.,]+$/.test(value))
    .map(([key, value]) => `--${key}: ${value};`)
    .join(' ')
}

/**
 * Opens a themed shell window that hosts the device UI inside a <webview> and
 * injects the assigned credential into the guest's login form.
 */
function openDeviceWebview(session_, parent) {
  preparePartition()
  const key = `${session_.kind}:${session_.deviceId}`
  const existing = windows.get(key)
  if (existing && !existing.isDestroyed()) { existing.focus(); return { success: true, reused: true } }

  const palette = session_.palette || {}
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 720, minHeight: 520,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    show: false,
    title: session_.title,
    backgroundColor: '#111318',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/device-webview.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      devTools: process.env.NODE_ENV === 'development'
    }
  })

  win.setMenu(null)
  const payload = {
    url: session_.url,
    title: session_.title,
    kind: session_.kind,
    username: session_.username,
    password: session_.password,
    autologin: session_.autologin !== false,
    partition: PARTITION,
    palette,
    paletteCss: paletteCss(palette)
  }
  win.__hyperfamilySession = payload

  win.loadFile(path.join(__dirname, 'device-webview.html'))
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => windows.delete(key))
  windows.set(key, win)
  return { success: true, reused: false }
}

/** Pushes a live theme change into every open device window. */
function broadcastPalette(palette) {
  const css = paletteCss(palette)
  for (const win of windows.values()) {
    if (win.isDestroyed()) continue
    win.__hyperfamilySession = { ...win.__hyperfamilySession, palette, paletteCss: css }
    win.webContents.send('device-webview:palette', { palette, paletteCss: css })
  }
}

/**
 * Guest pages keep their own look, but the scrollbars and form controls are
 * tinted so the embedded UI does not clash with the application shell.
 */
function guestThemeCss(palette = {}) {
  const surface = palette.surface || '24 27 34'
  const border = palette.border || '44 48 58'
  const primary = palette.primary || '96 165 250'
  return `
    ::-webkit-scrollbar { width: 11px; height: 11px; }
    ::-webkit-scrollbar-track { background: rgb(${surface}); }
    ::-webkit-scrollbar-thumb { background: rgb(${border}); border-radius: 8px; border: 2px solid rgb(${surface}); }
    ::-webkit-scrollbar-thumb:hover { background: rgb(${primary}); }
    :focus-visible { outline: 2px solid rgb(${primary}) !important; outline-offset: 1px; }
    ::selection { background: rgb(${primary} / .35); }
  `
}

function guestContents(win, webContentsId) {
  const guest = webContents.fromId(Number(webContentsId))
  if (!guest || guest.isDestroyed()) throw new Error('The device view is no longer available')
  // Only accept ids that belong to a window this module opened.
  const owner = [...windows.values()].find((item) => !item.isDestroyed() && item === win)
  if (!owner) throw new Error('This window cannot control device views')
  return guest
}

function registerDeviceWebviewHandlers(ipcMain) {
  ipcMain.handle('device-webview:autologin', async (event, webContentsId) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const config = win?.__hyperfamilySession
    if (!config) throw new Error('This window has no device session')
    const guest = guestContents(win, webContentsId)
    const script = buildLoginScript({ username: config.username, password: config.password, kind: config.kind })
    return guest.executeJavaScript(script, true)
  })

  ipcMain.handle('device-webview:guest-theme', async (event, webContentsId) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const config = win?.__hyperfamilySession
    if (!config) return false
    const guest = guestContents(win, webContentsId)
    await guest.insertCSS(guestThemeCss(config.palette))
    return true
  })

  ipcMain.handle('device-webview:session', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.__hyperfamilySession || null
  })
  ipcMain.handle('device-webview:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return true
  })
}

module.exports = { openDeviceWebview, registerDeviceWebviewHandlers, broadcastPalette, PARTITION }
