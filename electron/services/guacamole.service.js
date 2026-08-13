const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')

/**
 * Apache Guacamole integration.
 *
 * The desktop app never embeds Guacamole credentials in the renderer. Instead
 * the main process authenticates against the Guacamole REST API, creates (or
 * refreshes) a connection object that targets the device IP with the mapped
 * credential, and returns a short-lived one-time URL that the in-app remote
 * viewer loads inside a sandboxed <webview>/<iframe>.
 *
 * File transfer is enabled by turning on the Guacamole virtual drive
 * ("enable-drive"), which exposes a shared folder to the remote machine and
 * makes drag-and-drop uploads and downloads available in the client toolbar.
 */

function request(urlValue, { method = 'GET', headers = {}, body = null, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try { url = new URL(urlValue) } catch { return reject(new Error('The Guacamole server URL is not valid')) }
    if (!['http:', 'https:'].includes(url.protocol)) return reject(new Error('Guacamole must be reached over HTTP or HTTPS'))

    const transport = url.protocol === 'https:' ? https : http
    const payload = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body)
    const requestHeaders = { Accept: 'application/json', ...headers }
    if (payload !== null && !requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json'
    if (payload !== null) requestHeaders['Content-Length'] = Buffer.byteLength(payload)

    const clientRequest = transport.request(url, { method, headers: requestHeaders, timeout }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
        if (response.statusCode >= 400) {
          const message = parsed?.message || parsed?.translatableMessage?.key || `Guacamole responded with HTTP ${response.statusCode}`
          return reject(new Error(message))
        }
        resolve(parsed)
      })
    })

    clientRequest.on('timeout', () => { clientRequest.destroy(new Error('The Guacamole server did not respond in time')) })
    clientRequest.on('error', (error) => reject(new Error(error.message || 'Unable to reach the Guacamole server')))
    if (payload !== null) clientRequest.write(payload)
    clientRequest.end()
  })
}

// Guacamole client identifiers are base64 of "id\0type\0datasource".
function clientIdentifier(connectionId, dataSource) {
  return Buffer.from(`${connectionId}\u0000c\u0000${dataSource}`, 'utf8').toString('base64')
}

const PROTOCOL_DEFAULT_PORT = { rdp: 3389, vnc: 5900, ssh: 22, telnet: 23 }

class GuacamoleService {
  constructor(database) {
    this.database = database
    this.session = null
  }

  config() {
    const settings = this.database.getSettings()
    const base = String(settings.guacamole_url || '').trim().replace(/\/+$/, '')
    if (!base) throw new Error('Set the Guacamole server URL in Settings → Remote before connecting')
    return {
      base,
      username: String(settings.guacamole_user || '').trim(),
      password: String(settings.guacamole_pass || ''),
      dataSource: String(settings.guacamole_datasource || 'postgresql').trim() || 'postgresql',
      enableDrive: settings.guacamole_enable_drive !== false,
      drivePath: String(settings.guacamole_drive_path || '').trim()
    }
  }

  async authenticate(force = false) {
    const config = this.config()
    const fresh = this.session && this.session.base === config.base && Date.now() - this.session.issuedAt < 9 * 60 * 1000
    if (fresh && !force) return { ...this.session, config }

    if (!config.username) throw new Error('Set the Guacamole username in Settings → Remote')
    const body = new URLSearchParams({ username: config.username, password: config.password }).toString()
    const result = await request(`${config.base}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!result?.authToken) throw new Error('Guacamole did not return an authentication token')

    this.session = {
      base: config.base,
      token: result.authToken,
      dataSource: result.dataSource || config.dataSource,
      issuedAt: Date.now()
    }
    return { ...this.session, config }
  }

  async test() {
    const session = await this.authenticate(true)
    return { success: true, dataSource: session.dataSource, server: session.base }
  }

  protocolFor(device) {
    if (device.guacamole_protocol) return device.guacamole_protocol
    if (['Router', 'Switch'].includes(device.device_type)) return 'ssh'
    if (['Server', 'Client', 'Checkout', 'POS'].includes(device.device_type)) return 'rdp'
    return 'rdp'
  }

  parameters(device, credential, protocol, config) {
    const port = device.port || PROTOCOL_DEFAULT_PORT[protocol] || 3389
    const shared = {
      hostname: device.ip,
      port: String(port),
      username: credential?.username || '',
      password: credential?.password || ''
    }

    if (protocol === 'rdp') {
      return {
        ...shared,
        security: 'any',
        'ignore-cert': 'true',
        'resize-method': 'display-update',
        'enable-wallpaper': 'false',
        'enable-font-smoothing': 'true',
        'server-layout': 'en-us-qwerty',
        'enable-drive': config.enableDrive ? 'true' : 'false',
        'create-drive-path': config.enableDrive ? 'true' : 'false',
        'drive-name': 'HyperFamily Transfer',
        'drive-path': config.drivePath || `/guac-drive/${device.id}`,
        'enable-printing': 'false',
        domain: device.domain || ''
      }
    }

    if (protocol === 'vnc') return { ...shared, 'enable-sftp': 'false', 'cursor': 'local' }
    if (protocol === 'ssh') {
      return {
        ...shared,
        'enable-sftp': config.enableDrive ? 'true' : 'false',
        'sftp-root-directory': '/',
        'color-scheme': 'gray-black',
        'font-size': '11'
      }
    }
    return shared
  }

  async findConnection(session, name) {
    const list = await request(`${session.base}/api/session/data/${session.dataSource}/connections?token=${encodeURIComponent(session.token)}`)
    return Object.values(list || {}).find((item) => item.name === name) || null
  }

  /**
   * Creates or updates a Guacamole connection for the device and returns the
   * URL the in-app viewer should load.
   */
  async prepare({ deviceId, credentialId = null, protocol: requested = null }, actor = 'Admin') {
    const device = this.database.getDevice(deviceId)
    if (!device) throw new Error('Device not found')

    const credential = credentialId
      ? this.database.getCredential(credentialId)
      : this.database.resolveDeviceCredential(deviceId)

    const session = await this.authenticate()
    const config = session.config
    const protocol = requested || this.protocolFor(device)
    const name = `HFM-${device.id}-${device.name || device.device_type}`.slice(0, 100)

    const payload = {
      parentIdentifier: 'ROOT',
      name,
      protocol,
      parameters: this.parameters(device, credential, protocol, config),
      attributes: { 'max-connections': '2', 'max-connections-per-user': '1' }
    }

    const existing = await this.findConnection(session, name)
    let connection
    if (existing) {
      await request(`${session.base}/api/session/data/${session.dataSource}/connections/${encodeURIComponent(existing.identifier)}?token=${encodeURIComponent(session.token)}`, { method: 'PUT', body: payload })
      connection = existing
    } else {
      connection = await request(`${session.base}/api/session/data/${session.dataSource}/connections?token=${encodeURIComponent(session.token)}`, { method: 'POST', body: payload })
    }

    const identifier = clientIdentifier(connection.identifier, session.dataSource)
    const url = `${session.base}/#/client/${identifier}?token=${encodeURIComponent(session.token)}`

    this.database.audit(actor, 'GUACAMOLE_SESSION', `${device.name || device.device_type} (${device.ip})`, `${protocol.toUpperCase()} via Guacamole${credential ? ` as ${credential.username}` : ''}`)

    return {
      url,
      origin: new URL(session.base).origin,
      protocol,
      identifier,
      fileTransfer: config.enableDrive && ['rdp', 'ssh'].includes(protocol),
      drivePath: config.drivePath || '',
      device: { id: device.id, name: device.name, ip: device.ip, type: device.device_type },
      credential: credential ? { id: credential.id, name: credential.name, username: credential.username } : null
    }
  }

  async disconnect() {
    if (!this.session) return { success: true }
    try {
      await request(`${this.session.base}/api/tokens/${encodeURIComponent(this.session.token)}`, { method: 'DELETE' })
    } catch { /* token expiry is not an error worth surfacing */ }
    this.session = null
    return { success: true }
  }
}

module.exports = { GuacamoleService, clientIdentifier }
