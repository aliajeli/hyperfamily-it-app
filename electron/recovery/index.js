/**
 * HyperFamily Credential Recovery — standalone build (optional).
 * --------------------------------------------------------------
 * Since v3.1 the recovery window is integrated into the main application and
 * opens with `HyperFamily-Branch-Monitor.exe --recovery`, so the installer no
 * longer bundles this separate tool. This standalone build remains for cases
 * where a tiny independent binary is handy (e.g. handing recovery to someone
 * without the full app); build it with `npm run build:recovery`.
 *
 * All gate logic is shared with the integrated mode via ./core.js — keep the
 * two in lockstep only through that file.
 */
'use strict'

const path = require('node:path')
const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const { createRecoverySession } = require('./core')

const session = createRecoverySession(app)

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  session.load()

  ipcMain.handle('recovery:state', () => session.publicState())
  ipcMain.handle('recovery:verify', (_event, pin) => session.verify(pin))

  const window = new BrowserWindow({
    width: 440,
    height: 340,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'HyperFamily Credential Recovery',
    backgroundColor: '#eef1f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => app.quit())
  window.loadFile(path.join(__dirname, 'page.html'))
})

app.on('window-all-closed', () => app.quit())
