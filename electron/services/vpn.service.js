const fs = require('fs')
const path = require('path')
const { execFile, spawn } = require('child_process')

class VPNService {
  constructor(database, userDataPath, sendEvent) {
    this.database = database
    this.userDataPath = userDataPath
    this.sendEvent = sendEvent
    this.process = null
    this.mode = null
    this.state = 'disconnected'
    this.authFile = path.join(userDataPath, '.openvpn-auth')
  }

  emit(state, mode = this.mode, message = '') {
    this.state = state
    this.mode = mode
    const status = { state, mode, message }
    this.sendEvent('vpn:status', status)
    return status
  }

  getStatus() { return { state: this.state, mode: this.mode, message: '' } }

  async connect(mode, actor = 'Admin') {
    if (process.platform !== 'win32') throw new Error('VPN control is only supported in the Windows desktop build')
    if (!['split', 'full'].includes(mode)) throw new Error('Invalid VPN mode')
    if (this.state === 'connecting' || this.state.startsWith('connected')) throw new Error('A VPN session is already active')
    const settings = this.database.getSettings()
    if (!settings.vpn_gateway || !settings.vpn_user || !settings.vpn_pass) throw new Error('Complete VPN gateway and credentials in Settings first')
    this.emit('connecting', mode)
    try {
      if (mode === 'split') await this.connectSplit(settings)
      else await this.connectFull(settings)
      this.database.audit(actor, 'VPN_CONNECT', mode, `Gateway ${settings.vpn_gateway}:${settings.vpn_port}`)
      return this.emit(mode === 'split' ? 'connected_split' : 'connected_full', mode)
    } catch (error) {
      this.database.audit(actor, 'VPN_ERROR', mode, error.message)
      this.emit('error', null, error.message)
      throw error
    }
  }

  async connectSplit(settings) {
    if (!fs.existsSync(settings.openvpn_path || '')) throw new Error('OpenVPN executable was not found')
    if (!fs.existsSync(settings.openvpn_config || '')) throw new Error('Select an approved OpenVPN profile for split tunnel mode')
    const profile = fs.readFileSync(settings.openvpn_config, 'utf8')
    if (!/^\s*route-nopull\s*$/im.test(profile)) throw new Error('Split profile must include route-nopull')
    if (!/^\s*route\s+(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/im.test(profile)) throw new Error('Split profile must declare at least one private network route')
    fs.writeFileSync(this.authFile, `${settings.vpn_user}\n${settings.vpn_pass}\n`, { mode: 0o600 })
    this.process = spawn(settings.openvpn_path, ['--config', settings.openvpn_config, '--auth-user-pass', this.authFile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    await this.waitForOutput(this.process, /Initialization Sequence Completed/i, 25000)
    this.process.once('exit', () => { this.cleanupAuth(); if (this.state === 'connected_split') this.emit('disconnected', null) })
  }

  async connectFull(settings) {
    const candidates = [
      'C:\\Program Files\\Fortinet\\FortiClient\\FortiSSLVPNclient.exe',
      'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe'
    ]
    const executable = candidates.find(fs.existsSync)
    if (!executable) throw new Error('FortiClient CLI was not found. Install the approved enterprise client or use split tunnel.')
    const args = path.basename(executable).toLowerCase().includes('fortisslvpnclient')
      ? ['connect', '-h', `${settings.vpn_gateway}:${settings.vpn_port || 443}`, '-u', settings.vpn_user, '-p', settings.vpn_pass]
      : ['connect', '-s', `${settings.vpn_gateway}:${settings.vpn_port || 443}`, '-u', settings.vpn_user, '-p', settings.vpn_pass]
    await new Promise((resolve, reject) => execFile(executable, args, { windowsHide: true, timeout: 20000 }, (error) => error ? reject(new Error(`FortiClient connection failed: ${error.message}`)) : resolve()))
  }

  waitForOutput(child, pattern, timeout) {
    return new Promise((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error('VPN connection timed out')), timeout)
      const receive = (chunk) => { output += chunk.toString(); if (pattern.test(output)) { clearTimeout(timer); resolve() } }
      child.stdout?.on('data', receive)
      child.stderr?.on('data', receive)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('exit', (code) => { if (!pattern.test(output)) { clearTimeout(timer); reject(new Error(`VPN process exited with code ${code}`)) } })
    })
  }

  async disconnect(actor = 'Admin') {
    if (this.mode === 'split' && this.process) {
      this.process.kill()
      this.process = null
      this.cleanupAuth()
    } else if (this.mode === 'full' && process.platform === 'win32') {
      const candidates = ['C:\\Program Files\\Fortinet\\FortiClient\\FortiSSLVPNclient.exe', 'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe']
      const executable = candidates.find(fs.existsSync)
      if (executable) await new Promise((resolve) => execFile(executable, ['disconnect'], { windowsHide: true, timeout: 15000 }, () => resolve()))
    }
    this.database.audit(actor, 'VPN_DISCONNECT', this.mode || 'unknown', 'VPN session disconnected')
    return this.emit('disconnected', null)
  }

  cleanupAuth() { try { if (fs.existsSync(this.authFile)) fs.unlinkSync(this.authFile) } catch {} }
  stop() { if (this.process) this.process.kill(); this.cleanupAuth() }
}

module.exports = { VPNService }
