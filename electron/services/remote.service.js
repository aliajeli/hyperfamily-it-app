const fs = require('fs')
const { execFile, spawn } = require('child_process')
const { shell } = require('electron')

const safeHost = /^[a-zA-Z0-9.-]{1,253}$/

function detached(executable, args) {
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
  child.unref()
}

class RemoteService {
  constructor(database) { this.database = database }

  requireWindows(method) {
    if (process.platform !== 'win32') throw new Error(`${method} can only launch on Windows`)
  }

  async connect({ method, deviceId, credentialId }, actor = 'Admin') {
    const device = this.database.getDevice(deviceId)
    if (!device) throw new Error('Device not found')
    if (!safeHost.test(device.ip)) throw new Error('Unsafe or invalid device address')
    const credential = credentialId ? this.database.getCredential(credentialId) : null
    const target = `${device.name || device.device_type} (${device.ip})`
    try {
      if (method === 'rdp') await this.rdp(device, credential)
      else if (method === 'teamviewer') this.teamviewer(device)
      else if (method === 'winbox') this.winbox(device, credential)
      else if (method === 'browser') await this.browser(device, credential)
      else if (method === 'termius') await this.termius(device, credential)
      else throw new Error('Unsupported remote connection method')
      this.database.audit(actor, `${method.toUpperCase()}_CONNECT`, target, credential ? `Credential: ${credential.name}` : 'No mapped credential')
      return { success: true }
    } catch (error) {
      this.database.audit(actor, `${method.toUpperCase()}_ERROR`, target, error.message)
      throw error
    }
  }

  async rdp(device, credential) {
    this.requireWindows('Remote Desktop')
    if (!credential) throw new Error('Map and select an RDP credential first')
    await new Promise((resolve, reject) => execFile('cmdkey.exe', [`/generic:TERMSRV/${device.ip}`, `/user:${credential.username}`, `/pass:${credential.password}`], { windowsHide: true }, (error) => error ? reject(new Error('Windows Credential Manager rejected the RDP credential')) : resolve()))
    detached('mstsc.exe', [`/v:${device.ip}${device.port ? `:${device.port}` : ''}`])
  }

  teamviewer(device) {
    this.requireWindows('TeamViewer')
    const settings = this.database.getSettings()
    if (!fs.existsSync(settings.teamviewer_path || '')) throw new Error('TeamViewer executable was not found; update Device Settings')
    const remoteId = device.remote_id || device.terminal_id
    if (!remoteId) throw new Error('This device has no TeamViewer / remote ID')
    const args = ['-i', String(remoteId)]
    if (settings.teamviewer_password) args.push('-p', String(settings.teamviewer_password))
    detached(settings.teamviewer_path, args)
  }

  winbox(device, credential) {
    this.requireWindows('Winbox')
    const settings = this.database.getSettings()
    if (!fs.existsSync(settings.winbox_path || '')) throw new Error('Winbox executable was not found; update Device Settings')
    const endpoint = `${device.ip}:${device.port || settings.winbox_port || 8291}`
    const args = credential ? [endpoint, credential.username, credential.password] : [endpoint]
    detached(settings.winbox_path, args)
  }

  async browser(device, credential) {
    const protocol = device.protocol === 'http' ? 'http' : 'https'
    const port = device.port ? `:${device.port}` : ''
    let authority = device.ip
    if (credential) authority = `${encodeURIComponent(credential.username)}:${encodeURIComponent(credential.password)}@${device.ip}`
    await shell.openExternal(`${protocol}://${authority}${port}`, { activate: true })
  }

  async termius(device, credential) {
    const username = credential?.username ? `${encodeURIComponent(credential.username)}@` : ''
    await shell.openExternal(`termius://${username}${device.ip}:${device.port || 22}`)
  }
}

module.exports = { RemoteService }
