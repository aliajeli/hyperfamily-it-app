const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)
const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('hyperfamily', {
  platform: 'electron',
  auth: {
    login: (payload) => invoke('auth:login', payload),
    status: () => invoke('auth:status'),
    logout: () => invoke('auth:logout'),
    updateCredentials: (payload) => invoke('auth:update-credentials', payload),
    changePassword: (payload) => invoke('auth:change-password', payload)
  },
  branches: { list: () => invoke('branches:list'), save: (payload) => invoke('branches:save', payload), remove: (id) => invoke('branches:remove', id) },
  devices: { list: () => invoke('devices:list'), save: (payload) => invoke('devices:save', payload), remove: (id) => invoke('devices:remove', id) },
  monitor: { snapshot: () => invoke('monitor:snapshot'), subscribe: (callback) => subscribe('monitor:update', callback) },
  settings: { get: () => invoke('settings:get'), save: (patch) => invoke('settings:save', patch) },
  credentials: {
    list: () => invoke('credentials:list'), reveal: (id) => invoke('credentials:reveal', id),
    save: (payload) => invoke('credentials:save', payload), remove: (id) => invoke('credentials:remove', id),
    mappings: () => invoke('credentials:mappings'), saveMappings: (mappings) => invoke('credentials:save-mappings', mappings)
  },
  inventory: { list: () => invoke('inventory:list'), export: (filters) => invoke('inventory:export', filters) },
  remote: { connect: (payload) => invoke('remote:connect', payload) },
  vpn: { status: () => invoke('vpn:status'), connect: (mode) => invoke('vpn:connect', mode), disconnect: () => invoke('vpn:disconnect'), subscribe: (callback) => subscribe('vpn:status', callback) },
  update: { check: () => invoke('update:check'), download: () => invoke('update:download'), install: () => invoke('update:install'), subscribe: (callback) => subscribe('update:event', callback) },
  audit: { list: (limit) => invoke('audit:list', limit) },
  dialog: { selectFile: (options) => invoke('dialog:select-file', options) },
  app: { info: () => invoke('app:info'), openExternal: (url) => invoke('app:open-external', url), pathExists: (path) => invoke('app:path-exists', path) }
})
