const fs = require('node:fs')
const { execFile, spawn } = require('node:child_process')
const { shell } = require('electron')

const safeHost = /^[a-zA-Z0-9.-]{1,253}$/

function detached(executable, args) {
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
  child.unref()
}

const TEAMVIEWER_CANDIDATES = [
  'C:\\Program Files\\TeamViewer\\TeamViewer.exe',
  'C:\\Program Files (x86)\\TeamViewer\\TeamViewer.exe'
]

const WINBOX_CANDIDATES = [
  'C:\\Program Files\\Mikrotik\\Winbox\\winbox64.exe',
  'C:\\Program Files\\Winbox\\winbox64.exe',
  'C:\\Program Files (x86)\\Winbox\\winbox.exe'
]

function resolveExecutable(configured, candidates) {
  const list = [configured, ...candidates].filter(Boolean)
  return list.find((item) => { try { return fs.existsSync(item) } catch { return false } }) || null
}

class RemoteService {
  constructor(database) {
    this.database = database
  }

  requireWindows(method) {
    if (process.platform !== 'win32') throw new Error(`${method} can only launch on Windows`)
  }

  /** Credential explicitly chosen in the menu, else the one mapped to the device. */
  resolveCredential(deviceId, credentialId) {
    if (credentialId) return this.database.getCredential(credentialId)
    return this.database.resolveDeviceCredential(deviceId)
  }

  async connect({ method, deviceId, credentialId }, actor = 'Admin') {
    const device = this.database.getDevice(deviceId)
    if (!device) throw new Error('Device not found')
    if (!safeHost.test(device.ip)) throw new Error('Unsafe or invalid device address')

    const credential = this.resolveCredential(deviceId, credentialId)
    const target = `${device.name || device.device_type} (${device.ip})`

    try {
      let result = { success: true }
      if (method === 'rdp') await this.rdp(device, credential)
      else if (method === 'teamviewer') this.teamviewer(device)
      else if (method === 'winbox') this.winbox(device, credential)
      else if (method === 'browser') await this.browser(device, credential)
      else if (method === 'webview') result = { success: true, webview: this.webviewSession(device, credential) }
      else throw new Error('Unsupported remote connection method')

      this.database.audit(actor, `${method.toUpperCase()}_CONNECT`, target, credential ? `Credential: ${credential.name}` : 'No mapped credential')
      return result
    } catch (error) {
      this.database.audit(actor, `${method.toUpperCase()}_ERROR`, target, error.message)
      throw error
    }
  }

  async rdp(device, credential) {
    this.requireWindows('Remote Desktop')
    if (!credential) throw new Error('Assign a credential to this device in Settings → Credentials first')
    await new Promise((resolve, reject) => execFile('cmdkey.exe', [`/generic:TERMSRV/${device.ip}`, `/user:${credential.username}`, `/pass:${credential.password}`], { windowsHide: true }, (error) => error ? reject(new Error('Windows Credential Manager rejected the RDP credential')) : resolve()))
    detached('mstsc.exe', [`/v:${device.ip}${device.port ? `:${device.port}` : ''}`])
  }

  /**
   * TeamViewer in LAN mode: the target is reached by IP address instead of a
   * TeamViewer ID. The password is typed by the user in the TeamViewer prompt,
   * unless a shared default password is stored in Device Tools settings.
   */
  teamviewer(device) {
    this.requireWindows('TeamViewer')
    const settings = this.database.getSettings()
    const executable = resolveExecutable(settings.teamviewer_path, TEAMVIEWER_CANDIDATES)
    if (!executable) throw new Error('TeamViewer executable was not found; set its path in Settings → Device Tools')

    const lanMode = settings.teamviewer_lan_mode !== false
    // In LAN mode TeamViewer accepts the IP address in the -i / --id slot.
    const identifier = lanMode ? device.ip : (device.remote_id || device.terminal_id)
    if (!identifier) throw new Error('This device has no TeamViewer ID. Enable LAN connections to connect by IP instead.')

    const args = ['-i', String(identifier)]
    if (settings.teamviewer_password) args.push('-p', String(settings.teamviewer_password))
    detached(executable, args)
  }

  /**
   * Winbox: device IP + the port from Device Tools settings + the credential
   * assigned to the device, so the session opens already logged in.
   */
  winbox(device, credential) {
    this.requireWindows('Winbox')
    const settings = this.database.getSettings()
    const executable = resolveExecutable(settings.winbox_path, WINBOX_CANDIDATES)
    if (!executable) throw new Error('Winbox executable was not found; set its path in Settings → Device Tools')

    const port = device.port || settings.winbox_port || 8291
    const endpoint = `${device.ip}:${port}`
    if (!credential) throw new Error('Assign a credential to this router in Settings → Credentials so Winbox can log in automatically')

    // winbox64.exe <host:port> <login> <password>
    detached(executable, [endpoint, credential.username, credential.password])
  }

  async browser(device, credential) {
    const protocol = device.protocol === 'http' ? 'http' : 'https'
    const port = device.port ? `:${device.port}` : ''
    let authority = device.ip
    if (credential) authority = `${encodeURIComponent(credential.username)}:${encodeURIComponent(credential.password)}@${device.ip}`
    await shell.openExternal(`${protocol}://${authority}${port}`, { activate: true })
  }

  /**
   * Descriptor for the embedded <webview> window used by iLO and NVR devices.
   * The credential travels to the main process only, which injects it into the
   * guest page; it is never exposed to the renderer that requested the window.
   */
  webviewSession(device, credential) {
    if (!credential) throw new Error('Assign a credential to this device in Settings \u2192 Credentials so it can sign in automatically')
    const protocol = device.protocol === 'http' ? 'http' : 'https'
    const port = device.port ? `:${device.port}` : ''
    return {
      deviceId: device.id,
      title: `${device.name || device.device_type} \u00b7 ${device.ip}`,
      kind: device.device_type === 'NVR' ? 'nvr' : 'ilo',
      url: `${protocol}://${device.ip}${port}/`,
      username: credential.username,
      password: credential.password
    }
  }

  probe() {
    const settings = (() => { try { return this.database.getSettings() } catch { return {} } })()
    return {
      teamviewer: resolveExecutable(settings.teamviewer_path, TEAMVIEWER_CANDIDATES),
      winbox: resolveExecutable(settings.winbox_path, WINBOX_CANDIDATES)
    }
  }
}

module.exports = { RemoteService, resolveExecutable, TEAMVIEWER_CANDIDATES, WINBOX_CANDIDATES }
