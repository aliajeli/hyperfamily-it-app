const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const handlers = new Map()
const guestListeners = new Map()
const windowListeners = new Map()
const callbacks = {}
let dialogResponse = 0
const guest = {
  hostWebContents: null,
  getType: () => 'webview',
  isDestroyed: () => false,
  executeJavaScript: () => {
    throw new Error('must not inject credentials')
  },
  getURL: () => 'https://camera.example:8443/login',
  on: (event, handler) => guestListeners.set(event, handler),
  setWindowOpenHandler: (handler) => (callbacks.openWindow = handler)
}
const shell = {
  webContents: {
    on: (event, handler) => windowListeners.set(event, handler),
    send: () => {}
  },
  setMenu: () => {},
  loadFile: () => {},
  once: () => {},
  on: () => {},
  isDestroyed: () => false
}
guest.hostWebContents = shell.webContents
const electron = {
  BrowserWindow: Object.assign(
    function () {
      return shell
    },
    { fromWebContents: () => shell }
  ),
  session: {
    fromPartition: () => ({
      setCertificateVerifyProc: (handler) => (callbacks.verify = handler),
      setPermissionRequestHandler: () => {}
    })
  },
  webContents: { fromId: () => guest },
  dialog: { showMessageBox: async () => ({ response: dialogResponse }) }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electron
  return originalLoad.call(this, request, parent, isMain)
}
const device = require('../../electron/main/webview-window')
Module._load = originalLoad

const config = {
  url: 'https://camera.example:8443/login',
  kind: 'NVR',
  deviceId: 9,
  title: 'Camera',
  username: 'secret-user',
  password: 'secret-password'
}

test('device navigation stays on exactly its original scheme, host and port', () => {
  assert.equal(device.sameDeviceOrigin('https://camera.example:8443/other', config.url), true)
  for (const url of [
    'http://camera.example:8443/login',
    'https://camera.example/login',
    'https://camera.example.evil:8443/login',
    'javascript:alert(1)',
    'not a URL'
  ]) {
    assert.equal(device.sameDeviceOrigin(url, config.url), false, url)
  }
  device.openDeviceWebview(config, null)
  windowListeners.get('did-attach-webview')({}, guest)
  assert.deepEqual(callbacks.openWindow(), { action: 'deny' })
  let blocked = false
  guestListeners.get('will-redirect')({ preventDefault: () => (blocked = true) }, 'https://evil.example/')
  assert.equal(blocked, true)
  blocked = false
  guestListeners.get('will-navigate')({ preventDefault: () => (blocked = true) }, config.url)
  assert.equal(blocked, false)
})

test('TLS verification defaults to reject and only trusts an approved fingerprint for this run', async () => {
  const verify = (hostname, verificationResult, fingerprint) =>
    new Promise((resolve) => {
      callbacks.verify({ hostname, verificationResult, certificate: { fingerprint } }, resolve)
    })
  assert.equal(await verify('evil.example', 'OK', 'A'), -2)
  assert.equal(await verify('camera.example', 'OK', 'A'), 0)
  assert.equal(await verify('camera.example', 'CERT_REVOKED', 'A'), -2)
  assert.equal(await verify('camera.example', 'CERT_AUTHORITY_INVALID', ''), -2)
  assert.equal(await verify('camera.example', 'CERT_AUTHORITY_INVALID', 'A'), -2)
  dialogResponse = 1
  assert.equal(await verify('camera.example', 'CERT_AUTHORITY_INVALID', 'A'), 0)
  dialogResponse = 0
  assert.equal(await verify('camera.example', 'CERT_AUTHORITY_INVALID', 'A'), 0)
  assert.equal(await verify('camera.example', 'CERT_AUTHORITY_INVALID', 'B'), -2)
})

test('the webview session bridge excludes the saved credentials', async () => {
  device.registerDeviceWebviewHandlers({ handle: (channel, handler) => handlers.set(channel, handler) })
  const publicSession = await handlers.get('device-webview:session')({ sender: shell.webContents })
  assert.equal(publicSession.url, config.url)
  assert.equal('password' in publicSession, false)
  assert.equal('username' in publicSession, false)
  assert.equal(publicSession.partition, device.PARTITION)
})

test('auto-login cannot inject credentials into a foreign guest or redirected origin', async () => {
  const login = handlers.get('device-webview:autologin')
  const event = { sender: shell.webContents }
  guest.hostWebContents = {}
  await assert.rejects(login(event, 4), /cannot control that device view/)
  guest.hostWebContents = shell.webContents
  const oldGetURL = guest.getURL
  guest.getURL = () => 'https://evil.example/'
  await assert.rejects(login(event, 4), /Device origin changed/)
  guest.getURL = oldGetURL
})
