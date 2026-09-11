/**
 * Credential recovery mode — runs when the app is started with `--recovery`
 * (wired up in electron/main/index.js).
 *
 * Replaces the old standalone HyperFamily-Credential-Recovery.exe: that was a
 * second full Electron runtime (~80 MB) shipped inside every installer just
 * to show one small window. The same window now lives in the main executable
 * at zero extra size, using the exact same page, preload and gate logic from
 * ../recovery. The standalone build (build:recovery) remains available but is
 * no longer bundled with the installer.
 *
 * Deliberately NOT guarded by the single-instance lock so recovery can open
 * while the dashboard is already running.
 */
'use strict'

const path = require('node:path')
const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const { createRecoverySession } = require('../recovery/core')

const session = createRecoverySession(app)

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  session.load()

  // Same channels and payload shapes as the standalone tool, so preload.js
  // and page.html work unchanged in both hosts.
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
    icon: path.join(__dirname, '../../public/electron/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../recovery/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => app.quit())
  window.loadFile(path.join(__dirname, '../recovery/page.html'))
})

app.on('window-all-closed', () => app.quit())
