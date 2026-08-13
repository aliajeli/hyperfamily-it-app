const { contextBridge, ipcRenderer, webUtils } = require('electron')

const session = JSON.parse(process.argv.find((arg) => arg.startsWith('--session='))?.slice(10) || '{}')

contextBridge.exposeInMainWorld('remoteViewer', {
  session,
  close: () => ipcRenderer.send('remote-viewer:close'),
  toggleFullScreen: () => ipcRenderer.send('remote-viewer:fullscreen'),
  pickFiles: () => ipcRenderer.invoke('remote-viewer:pick-files'),
  stageFiles: (paths) => ipcRenderer.invoke('remote-viewer:stage-files', paths),
  pathFor: (file) => { try { return webUtils.getPathForFile(file) } catch { return file?.path || null } }
})
