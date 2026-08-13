const path = require('node:path')
const fs = require('node:fs')
const { BrowserWindow, ipcMain, dialog, session: electronSession } = require('electron')

/**
 * Dedicated window that hosts the Apache Guacamole client. It is kept outside
 * the main renderer so the strict app:// CSP is not relaxed for the whole UI:
 * this window gets its own partition with a policy that only permits the
 * Guacamole origin.
 */

let viewerWindow = null
let currentSession = null

function paletteFrom(colors = {}) {
  const allowed = ['canvas', 'surface', 'border', 'text', 'muted', 'primary', 'danger', 'success']
  return Object.fromEntries(Object.entries(colors).filter(([key]) => allowed.includes(key)))
}

function openRemoteViewer(descriptor, parent, palette = {}) {
  currentSession = { ...descriptor, palette: paletteFrom(palette) }

  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.close()
    viewerWindow = null
  }

  const partition = 'persist:guacamole'
  const viewerSession = electronSession.fromPartition(partition)
  const origin = descriptor.origin || ''
  viewerSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = `default-src 'self' 'unsafe-inline' data: blob: ${origin}; connect-src 'self' ${origin} ${origin.replace(/^http/, 'ws')}; img-src 'self' data: blob: ${origin}; frame-src ${origin}`
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })

  viewerWindow = new BrowserWindow({
    parent: parent || undefined,
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#2E3440',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    titleBarOverlay: process.platform === 'win32' ? { color: '#3B4252', symbolColor: '#ECEFF4', height: 46 } : false,
    webPreferences: {
      partition,
      preload: path.join(__dirname, '..', 'preload', 'remote-viewer.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--session=${JSON.stringify(currentSession)}`]
    }
  })

  viewerWindow.loadFile(path.join(__dirname, 'remote-viewer.html'))
  viewerWindow.once('ready-to-show', () => viewerWindow.show())
  viewerWindow.on('closed', () => { viewerWindow = null; currentSession = null })

  return { success: true }
}

async function stageFiles(paths) {
  const target = currentSession?.drivePath
  if (!target) return { count: 0, error: 'No shared drive is configured for this session' }
  try { fs.mkdirSync(target, { recursive: true }) } catch { /* the drive may be remote-managed */ }
  let count = 0
  for (const source of paths) {
    try {
      fs.copyFileSync(source, path.join(target, path.basename(source)))
      count += 1
    } catch { /* skip unreadable files */ }
  }
  return { count }
}

function registerRemoteViewerHandlers() {
  ipcMain.on('remote-viewer:close', () => { if (viewerWindow && !viewerWindow.isDestroyed()) viewerWindow.close() })
  ipcMain.on('remote-viewer:fullscreen', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) viewerWindow.setFullScreen(!viewerWindow.isFullScreen())
  })
  ipcMain.handle('remote-viewer:pick-files', async () => {
    if (!viewerWindow) return { count: 0 }
    const result = await dialog.showOpenDialog(viewerWindow, { title: 'Copy files to the remote machine', properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return { count: 0 }
    return stageFiles(result.filePaths)
  })
  ipcMain.handle('remote-viewer:stage-files', (_event, paths) => stageFiles(Array.isArray(paths) ? paths : []))
}

module.exports = { openRemoteViewer, registerRemoteViewerHandlers }
