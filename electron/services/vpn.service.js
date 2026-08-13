const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const { execFile, spawn } = require('node:child_process')
const { URL } = require('node:url')

/**
 * Two VPN modes are supported.
 *
 * 1. "in_app"  — Application-level tunnel. A loopback HTTP/CONNECT proxy is
 *                started inside the main process and every request the app
 *                makes to branch equipment is forwarded through the FortiGate
 *                SSL-VPN web portal (HTTP POST authentication + the portal's
 *                HTTP proxy endpoint). Only the application's own traffic is
 *                routed; the rest of Windows is untouched.
 *
 * 2. "global"  — Launches the FortiClient VPN that is installed on the system
 *                so the user completes the connection there. If FortiClient is
 *                not installed the user is warned with a download hint instead
 *                of a generic failure.
 */

const FORTICLIENT_CANDIDATES = [
  'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe',
  'C:\\Program Files\\Fortinet\\FortiClient\\FortiSSLVPNclient.exe',
  'C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiClient.exe',
  'C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiSSLVPNclient.exe'
]

const FORTICLIENT_DOWNLOAD = 'https://www.fortinet.com/support/product-downloads#vpn'

function findFortiClient(configuredPath) {
  const candidates = [configuredPath, ...FORTICLIENT_CANDIDATES].filter(Boolean)
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate) } catch { return false }
  }) || null
}

class VPNService {
  constructor(database, userDataPath, sendEvent) {
    this.database = database
    this.userDataPath = userDataPath
    this.sendEvent = sendEvent
    this.process = null
    this.mode = null
    this.state = 'disconnected'
    this.proxy = null
    this.proxyPort = 0
    this.portalCookie = ''
    this.gateway = null
    this.stats = { requests: 0, bytes: 0, since: null }
  }

  emit(state, mode = this.mode, message = '') {
    this.state = state
    this.mode = mode
    const status = this.getStatus()
    status.message = message
    this.sendEvent('vpn:status', status)
    return status
  }

  getStatus() {
    return {
      state: this.state,
      mode: this.mode,
      message: '',
      proxyPort: this.proxyPort || null,
      gateway: this.gateway,
      stats: this.stats,
      forticlientInstalled: this.isForticlientInstalled()
    }
  }

  isForticlientInstalled() {
    if (process.platform !== 'win32') return false
    const settings = this.safeSettings()
    return Boolean(findFortiClient(settings.forticlient_path))
  }

  safeSettings() {
    try { return this.database.getSettings() } catch { return {} }
  }

  /** Availability probe used by the UI before offering the global mode. */
  probe() {
    const settings = this.safeSettings()
    const executable = findFortiClient(settings.forticlient_path)
    return {
      installed: Boolean(executable),
      path: executable,
      downloadUrl: FORTICLIENT_DOWNLOAD,
      configured: Boolean(settings.vpn_gateway && settings.vpn_user)
    }
  }

  requireProfile(settings) {
    if (!settings.vpn_gateway) throw new Error('Set the FortiClient Remote Gateway in Settings → VPN first')
    if (!settings.vpn_user || !settings.vpn_pass) throw new Error('Set the VPN username and password in Settings → VPN first')
    return {
      gateway: String(settings.vpn_gateway).trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
      port: Number(settings.vpn_port) || 443,
      username: String(settings.vpn_user),
      password: String(settings.vpn_pass),
      realm: String(settings.vpn_realm || '')
    }
  }

  async connect(mode, actor = 'Admin') {
    const normalized = mode === 'split' ? 'in_app' : mode === 'full' ? 'global' : mode
    if (!['in_app', 'global'].includes(normalized)) throw new Error('Invalid VPN mode')
    if (this.state === 'connecting' || this.state.startsWith('connected')) throw new Error('A VPN session is already active')

    const settings = this.database.getSettings()
    const profile = this.requireProfile(settings)
    this.emit('connecting', normalized)

    try {
      if (normalized === 'in_app') await this.connectInApp(profile)
      else await this.connectGlobal(profile, settings)
      this.gateway = `${profile.gateway}:${profile.port}`
      this.stats = { requests: 0, bytes: 0, since: new Date().toISOString() }
      this.database.audit(actor, 'VPN_CONNECT', normalized, `Gateway ${this.gateway}`)
      return this.emit(normalized === 'in_app' ? 'connected_in_app' : 'connected_global', normalized)
    } catch (error) {
      this.database.audit(actor, 'VPN_ERROR', normalized, error.message)
      this.emit('error', null, error.message)
      throw error
    }
  }

  /* ------------------------------------------------------------------ in-app */

  /**
   * Authenticates against the FortiGate SSL-VPN web portal with an HTTP POST.
   *
   * FortiGate portals answer this endpoint with a slightly malformed chunked
   * body (stray bytes around the chunk-size line), which Node's strict HTTP
   * parser rejects with "Parse Error: Invalid character in chunk size" before
   * the response is delivered. Two things make the login survive that:
   *
   *   - `insecureHTTPParser` puts Node back on the lenient parser, which is
   *     what browsers and FortiClient itself use for this endpoint.
   *   - Anything the parser did hand over before failing is still evaluated:
   *     the SVPNCOOKIE arrives in the response headers, so a late body parse
   *     error must not throw away a login that already succeeded.
   */
  portalLogin(profile) {
    return new Promise((resolve, reject) => {
      const body = new URLSearchParams({
        ajax: '1',
        username: profile.username,
        credential: profile.password,
        realm: profile.realm
      }).toString()

      const options = {
        host: profile.gateway,
        port: profile.port,
        path: '/remote/logincheck',
        method: 'POST',
        rejectUnauthorized: false,
        timeout: 20000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'HyperFamily-Branch-Monitor',
          Accept: '*/*',
          Connection: 'close'
        }
      }
      // Older Node builds may refuse the option outright; fall back silently.
      let request
      try {
        request = https.request({ ...options, insecureHTTPParser: true })
      } catch {
        request = https.request(options)
      }

      let settled = false
      const chunks = []
      let cookie = ''
      let allCookies = []

      // FortiGate reports the *outcome* in the body, not in the cookie jar:
      //   ret=1  -> credentials accepted (often with redir=... to the portal)
      //   ret=0  -> credentials rejected
      //   ret=2 / redir=/remote/twofactor -> a second factor is required
      // The SVPNCOOKIE is frequently issued only on the follow-up redirect, and
      // several FortiOS builds send a placeholder `SVPNCOOKIE=` on the login
      // response itself. Treating "no cookie yet" as "wrong password" is what
      // rejected valid credentials, so the body verdict now wins and the cookie
      // is only a fallback signal.
      const finish = (text) => {
        if (settled) return
        settled = true
        const bodyText = text || ''
        const accepted = /(^|[^a-z])ret=1(\D|$)/i.test(bodyText)
        const rejected = /(^|[^a-z])ret=0(\D|$)/i.test(bodyText)
          || /permission_denied|login_failed|invalid.{0,20}(username|password|credential)/i.test(bodyText)
        const twoFactor = /(^|[^a-z])ret=2(\D|$)/i.test(bodyText)
          || /redir=(%2f|\/)remote(%2f|\/)twofactor|tokeninfo|fortitoken/i.test(bodyText)

        if (twoFactor && !accepted) {
          return reject(new Error('The gateway requires two-factor authentication; use the Global (FortiClient) mode'))
        }
        if (rejected && !accepted) {
          return reject(new Error('The SSL VPN portal rejected the username or password'))
        }
        // Accepted, or an unparsable/empty body that still carried a session
        // cookie — either way the portal did not say "no".
        if (accepted || cookie) return resolve(cookie || allCookies.join('; '))
        if (!bodyText.trim()) {
          return reject(new Error('The VPN gateway returned an empty response. Check that the Remote Gateway host and port point at the SSL-VPN portal.'))
        }
        reject(new Error('The SSL VPN portal rejected the username or password'))
      }

      request.on('response', (response) => {
        const cookies = (response.headers['set-cookie'] || []).map((item) => item.split(';')[0])
        // Keep every non-empty cookie: some builds authenticate the proxy with
        // SVPNNETWORKCOOKIE / SVPNTMPCOOKIE alongside (or instead of) SVPNCOOKIE.
        allCookies = cookies.filter((item) => {
          const value = item.slice(item.indexOf('=') + 1).trim()
          return value.length > 0
        })
        const svpn = allCookies.find((item) => item.startsWith('SVPNCOOKIE='))
        if (svpn) cookie = svpn
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('aborted', () => finish(Buffer.concat(chunks).toString('utf8')))
        // A body-level parse error after the headers arrived is survivable.
        response.on('error', () => finish(Buffer.concat(chunks).toString('utf8')))
        response.on('end', () => finish(Buffer.concat(chunks).toString('utf8')))
      })

      request.on('timeout', () => request.destroy(new Error('The VPN gateway did not respond in time')))
      request.on('error', (error) => {
        if (settled) return
        // The cookie already came in with the headers — the portal accepted the
        // login and only its response framing was broken.
        if (cookie) { settled = true; resolve(cookie); return }
        settled = true
        const message = /parse error/i.test(error.message)
          ? `${error.message} — the gateway sent a malformed reply. Check that the Remote Gateway host and port point at the SSL-VPN portal, or use the Global (FortiClient) mode.`
          : error.message
        reject(new Error(`Unable to reach the VPN gateway: ${message}`))
      })
      request.write(body)
      request.end()
    })
  }

  async connectInApp(profile) {
    this.portalCookie = await this.portalLogin(profile)
    await this.startProxy(profile)
  }

  /**
   * Loopback proxy. Plain HTTP requests are forwarded to the portal's web-mode
   * HTTP proxy; CONNECT tunnels are relayed over a TLS socket to the gateway so
   * that TCP services (SSH/Telnet, Winbox, HTTPS device UIs) work.
   */
  startProxy(profile) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((clientRequest, clientResponse) => {
        let target
        try { target = new URL(clientRequest.url, `http://${clientRequest.headers.host}`) } catch {
          clientResponse.writeHead(400).end('Invalid request target')
          return
        }

        const upstream = https.request({
          host: profile.gateway,
          port: profile.port,
          method: clientRequest.method,
          path: `/proxy/http/${target.host}${target.pathname}${target.search}`,
          rejectUnauthorized: false,
          headers: { ...clientRequest.headers, cookie: this.portalCookie, host: target.host }
        }, (upstreamResponse) => {
          this.stats.requests += 1
          clientResponse.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
          upstreamResponse.on('data', (chunk) => { this.stats.bytes += chunk.length })
          upstreamResponse.pipe(clientResponse)
        })

        upstream.on('error', (error) => {
          if (!clientResponse.headersSent) clientResponse.writeHead(502)
          clientResponse.end(`VPN proxy error: ${error.message}`)
        })
        clientRequest.pipe(upstream)
      })

      server.on('connect', (request, clientSocket, head) => {
        const [host, rawPort] = request.url.split(':')
        const port = Number(rawPort) || 443
        const tunnel = net.connect({ host, port }, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          if (head?.length) tunnel.write(head)
          this.stats.requests += 1
          tunnel.pipe(clientSocket)
          clientSocket.pipe(tunnel)
        })
        const fail = () => { try { clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') } catch {} }
        tunnel.on('error', fail)
        clientSocket.on('error', () => tunnel.destroy())
      })

      server.on('error', (error) => reject(new Error(`Unable to start the in-app VPN proxy: ${error.message}`)))
      server.listen(0, '127.0.0.1', () => {
        this.proxy = server
        this.proxyPort = server.address().port
        resolve()
      })
    })
  }

  /* ------------------------------------------------------------------ global */

  async connectGlobal(profile, settings) {
    if (process.platform !== 'win32') throw new Error('The global VPN mode is only available in the Windows desktop build')
    const executable = findFortiClient(settings.forticlient_path)
    if (!executable) {
      const error = new Error('FortiClient VPN is not installed on this computer. Install the FortiClient VPN client, then try the Global mode again.')
      error.code = 'FORTICLIENT_MISSING'
      error.downloadUrl = FORTICLIENT_DOWNLOAD
      throw error
    }

    // Launch the installed client so the user completes the connection there.
    const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
    child.unref()
    this.process = null
  }

  /* -------------------------------------------------------------- disconnect */

  async disconnect(actor = 'Admin') {
    if (this.proxy) {
      await new Promise((resolve) => this.proxy.close(resolve))
      this.proxy = null
      this.proxyPort = 0
    }
    this.portalCookie = ''

    if (this.mode === 'global' && process.platform === 'win32') {
      const settings = this.safeSettings()
      const executable = findFortiClient(settings.forticlient_path)
      if (executable && /fortisslvpnclient/i.test(path.basename(executable))) {
        await new Promise((resolve) => execFile(executable, ['disconnect'], { windowsHide: true, timeout: 15000 }, () => resolve()))
      }
    }

    this.database.audit(actor, 'VPN_DISCONNECT', this.mode || 'unknown', 'VPN session disconnected')
    this.gateway = null
    return this.emit('disconnected', null)
  }

  stop() {
    if (this.proxy) { try { this.proxy.close() } catch {} }
    if (this.process) { try { this.process.kill() } catch {} }
  }
}

module.exports = { VPNService, findFortiClient, FORTICLIENT_DOWNLOAD }
