const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deviceWebview', {
  session: () => ipcRenderer.invoke('device-webview:session'),
  // The credential never enters this renderer: the main process injects it
  // straight into the guest page identified by its webContents id.
  autologin: (webContentsId) => ipcRenderer.invoke('device-webview:autologin', webContentsId),
  applyGuestTheme: (webContentsId) => ipcRenderer.invoke('device-webview:guest-theme', webContentsId),
  close: () => ipcRenderer.invoke('device-webview:close'),
  onPalette: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('device-webview:palette', listener)
    return () => ipcRenderer.removeListener('device-webview:palette', listener)
  }
})
