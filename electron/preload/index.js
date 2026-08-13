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
    mappings: () => invoke('credentials:mappings'),
    map: () => invoke('credentials:credential-map'),
    forDevice: (deviceId) => invoke('credentials:for-device', deviceId),
    saveMappings: (mappings) => invoke('credentials:save-mappings', mappings),
    overview: () => invoke('credentials:overview'),
    assignDevice: (deviceId, credentialId) => invoke('credentials:assign-device', { deviceId, credentialId }),
    assignType: (deviceType, credentialId) => invoke('credentials:assign-type', { deviceType, credentialId })
  },
  inventory: {
    list: () => invoke('inventory:list'),
    export: (filters) => invoke('inventory:export', filters)
  },
  remote: {
    connect: (payload) => invoke('remote:connect', payload),
    probe: () => invoke('remote:probe'),
    palette: (palette) => invoke('remote:palette', palette)
  },
  terminal: {
    targets: () => invoke('terminal:targets'),
    open: (payload) => invoke('terminal:open', payload),
    write: (payload) => invoke('terminal:write', payload),
    resize: (payload) => invoke('terminal:resize', payload),
    close: (sessionId) => invoke('terminal:close', sessionId),
    onData: (callback) => subscribe('terminal:data', callback),
    onStatus: (callback) => subscribe('terminal:status', callback)
  },
  snippets: {
    list: () => invoke('snippets:list'),
    save: (payload) => invoke('snippets:save', payload),
    remove: (id) => invoke('snippets:remove', id)
  },
  notes: {
    list: () => invoke('notes:list'),
    save: (payload) => invoke('notes:save', payload),
    remove: (id) => invoke('notes:remove', id)
  },
  vpn: {
    status: () => invoke('vpn:status'),
    probe: () => invoke('vpn:probe'),
    connect: (mode) => invoke('vpn:connect', mode),
    disconnect: () => invoke('vpn:disconnect'),
    subscribe: (callback) => subscribe('vpn:status', callback)
  },
  update: {
    check: () => invoke('update:check'),
    state: () => invoke('update:state'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    subscribe: (callback) => subscribe('update:event', callback)
  },
  audit: { list: (limit) => invoke('audit:list', limit) },
  dialog: { selectFile: (options) => invoke('dialog:select-file', options) },
  app: { info: () => invoke('app:info'), openExternal: (url) => invoke('app:open-external', url), pathExists: (path) => invoke('app:path-exists', path) }
})
