/**
 * Bridges the recovery page to the main process (v2.0.21).
 *
 * contextIsolation stays on: the page only ever sees two small functions —
 * read the public state and verify a PIN — so the decrypted credentials never
 * touch the renderer until a correct PIN is entered.
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('recovery', {
  state: () => ipcRenderer.invoke('recovery:state'),
  verify: (pin) => ipcRenderer.invoke('recovery:verify', pin)
})
