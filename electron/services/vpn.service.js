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
    this.healthTimer = null
    this.forticlientRunning = false
    this.lastLive = false
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
      live: this.isLive(),
      forticlientInstalled: this.isForticlientInstalled()
    }
  }

  /**
   * True when the tunnel is genuinely carrying traffic right now.
   *
   * The UI indicator must reflect reality rather than the last thing that was
   * clicked: an in-app tunnel is live only while its loopback proxy is still
   * listening, and the global mode is live only while a FortiClient tunnel
   * process is actually running.
   */
  isLive() {
    if (this.mode === 'in_app') return Boolean(this.proxy && this.proxy.listening)
    if (this.mode === 'global') return this.forticlientRunning
    return false
  }

  /**
   * Polls the real state once a second and emits a status update whenever it
   * changes, so the header button turns green/red on its own — including when
   * the tunnel drops or FortiClient is closed outside the app.
   */
  startHealthMonitor(intervalMs = 1000) {
    if (this.healthTimer) return
    this.healthTimer = setInterval(() => {
      this.refreshHealth().catch(() => {})
    }, intervalMs)
    this.healthTimer.unref?.()
  }

  stopHealthMonitor() {
    if (!this.healthTimer) return
    clearInterval(this.healthTimer)
    this.healthTimer = null
  }

  async refreshHealth() {
    if (this.state === 'connecting') return
    if (this.mode === 'global') this.forticlientRunning = await VPNService.isForticlientProcessRunning()

    const live = this.isLive()
    const claimsConnected = this.state.startsWith('connected')

    // The tunnel died underneath us (proxy closed, FortiClient exited).
    if (claimsConnected && !live) {
      const wasMode = this.mode
      this.portalCookie = ''
      this.gateway = null
      this.proxyPort = 0
      this.emit('disconnected', null, wasMode === 'global' ? 'FortiClient is no longer running' : 'The tunnel closed')
      return
    }

    // FortiClient was started outside the app while we were idle.
    if (!claimsConnected && this.mode === 'global' && this.forticlientRunning) {
      this.emit('connected_global', 'global')
      return
    }

    if (this.lastLive !== live) {
      this.lastLive = live
      this.sendEvent('vpn:status', this.getStatus())
    }
  }

  /** Windows-only: is a FortiClient VPN tunnel process running? */
  static isForticlientProcessRunning() {
    if (process.platform !== 'win32') return Promise.resolve(false)
    return new Promise((resolve) => {
      execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true }, (error, stdout) => {
        if (error) return resolve(false)
        resolve(/"(FortiSSLVPNdaemon|FortiClient|FortiTray|FortiSSLVPNclient)\.exe"/i.test(stdout))
      })
    })
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
      password: String(settings.vpn_pass)
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
      this.lastLive = true
      this.startHealthMonitor()
      return this.emit(normalized === 'in_app' ? 'connected_in_app' : 'connected_global', normalized)
    } catch (error) {
      this.database.audit(actor, 'VPN_ERROR', normalized, error.message)
      this.emit('error', null, error.message)
      throw error
    }
  }

  /* ------------------------------------------------------------------ in-app */

  /**
   * Performs the raw `/remote/logincheck` POST and resolves with everything the
   * gateway said — status line, headers, cookies and body — without judging it.
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
   *
   * Both the real login and the "Test & diagnose" button run through here, so
   * what the user sees in the diagnostics is exactly what the login logic saw.
   */
  portalRequest(profile) {
    return new Promise((resolve, reject) => {
      const body = new URLSearchParams({
        ajax: '1',
        username: profile.username,
        credential: profile.password,
        realm: ''
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
      const result = {
        statusCode: 0,
        statusMessage: '',
        headers: {},
        setCookie: [],
        cookies: [],
        cookie: '',
        body: '',
        transportError: ''
      }

      const done = () => {
        if (settled) return
        settled = true
        result.body = Buffer.concat(chunks).toString('utf8')
        resolve(result)
      }

      request.on('response', (response) => {
        result.statusCode = response.statusCode || 0
        result.statusMessage = response.statusMessage || ''
        result.headers = { ...response.headers }
        result.setCookie = response.headers['set-cookie'] || []
        // Keep every non-empty cookie: some builds authenticate the proxy with
        // SVPNNETWORKCOOKIE / SVPNTMPCOOKIE alongside (or instead of) SVPNCOOKIE.
        result.cookies = result.setCookie
          .map((item) => item.split(';')[0])
          .filter((item) => item.slice(item.indexOf('=') + 1).trim().length > 0)
        const svpn = result.cookies.find((item) => item.startsWith('SVPNCOOKIE='))
        if (svpn) result.cookie = svpn
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('aborted', done)
        // A body-level parse error after the headers arrived is survivable.
        response.on('error', (error) => { result.transportError = error.message; done() })
        response.on('end', done)
      })

      request.on('timeout', () => request.destroy(new Error('The VPN gateway did not respond in time')))
      request.on('error', (error) => {
        if (settled) return
        result.transportError = error.message
        // Headers already arrived — the response framing broke, not the login.
        if (result.statusCode || result.cookies.length) return done()
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

  /**
   * Turns a raw portal reply into a verdict.
   *
   * FortiGate reports the *outcome* in the body, not in the cookie jar:
   *   ret=1  -> credentials accepted (often with redir=... to the portal)
   *   ret=0  -> credentials rejected
   *   ret=2 / redir=/remote/twofactor -> a second factor is required
   *
   * The rule is deliberately lenient: only an explicit rejection counts as bad
   * credentials. FortiOS 7.6 builds answer HTTP 200 with no usable cookie and
   * no `ret=` at all, and several builds send a placeholder `SVPNCOOKIE=` on
   * the login response itself. Calling any of those "wrong password" is what
   * blocked logins that were in fact valid, so an unrecognised reply is now
   * treated as "probably fine, keep going" instead of a hard failure.
   */
  static verdict(reply) {
    const text = reply.body || ''
    const explicitAccept = /(^|[^a-z])ret=1(\D|$)/i.test(text)
    const explicitReject = /(^|[^a-z])ret=0(\D|$)/i.test(text)
      || /permission_denied|login_failed|invalid.{0,20}(username|password|credential)/i.test(text)
    const twoFactor = /(^|[^a-z])ret=2(\D|$)/i.test(text)
      || /redir=(%2f|\/)remote(%2f|\/)twofactor|tokeninfo|fortitoken/i.test(text)
    const hasCookie = Boolean(reply.cookie || reply.cookies.length)

    if (explicitReject && !explicitAccept) {
      return { outcome: 'rejected', reason: 'The SSL VPN portal rejected the username or password' }
    }
    if (twoFactor && !explicitAccept) {
      return { outcome: 'two_factor', reason: 'The gateway requires two-factor authentication; use the Global (FortiClient) mode' }
    }
    if (explicitAccept) return { outcome: 'accepted', reason: 'The gateway returned ret=1' }
    if (hasCookie) return { outcome: 'accepted', reason: 'The gateway issued a session cookie' }
    if (!text.trim() && !reply.statusCode) {
      return { outcome: 'unreachable', reason: 'The VPN gateway returned an empty response. Check that the Remote Gateway host and port point at the SSL-VPN portal.' }
    }
    // Nothing conclusive either way: continue rather than block a valid login.
    return { outcome: 'ambiguous', reason: 'The gateway did not report a result; continuing with the connection' }
  }

  /**
   * Runs a login attempt purely for reporting. Never throws for a rejected
   * login — the point is to hand the user (and support) the untouched gateway
   * reply so a misbehaving portal can be identified.
   */
  async diagnose() {
    const settings = this.safeSettings()
    const started = Date.now()
    let profile
    try {
      profile = this.requireProfile(settings)
    } catch (error) {
      return {
        ok: false,
        stage: 'profile',
        outcome: 'error',
        reason: error.message,
        durationMs: Date.now() - started
      }
    }

    const target = `https://${profile.gateway}:${profile.port}/remote/logincheck`
    try {
      const reply = await this.portalRequest(profile)
      const verdict = VPNService.verdict(reply)
      const bodyText = reply.body || ''
      return {
        ok: verdict.outcome === 'accepted' || verdict.outcome === 'ambiguous',
        stage: 'logincheck',
        target,
        username: profile.username,
        outcome: verdict.outcome,
        reason: verdict.reason,
        statusCode: reply.statusCode,
        statusMessage: reply.statusMessage,
        headers: reply.headers,
        setCookie: reply.setCookie,
        cookieNames: reply.cookies.map((item) => item.slice(0, item.indexOf('='))),
        bodyLength: bodyText.length,
        // Excerpt only: the body can be a full HTML portal page.
        bodyExcerpt: bodyText.slice(0, 2000),
        transportError: reply.transportError,
        durationMs: Date.now() - started
      }
    } catch (error) {
      return {
        ok: false,
        stage: 'transport',
        target,
        username: profile.username,
        outcome: 'error',
        reason: error.message,
        durationMs: Date.now() - started
      }
    }
  }

  /**
   * Authenticates against the FortiGate SSL-VPN web portal with an HTTP POST
   * and resolves with the cookie string the proxy should present.
   */
  async portalLogin(profile) {
    const reply = await this.portalRequest(profile)
    const verdict = VPNService.verdict(reply)
    if (verdict.outcome === 'rejected' || verdict.outcome === 'two_factor' || verdict.outcome === 'unreachable') {
      const error = new Error(verdict.reason)
      error.diagnosable = true
      throw error
    }
    return reply.cookie || reply.cookies.join('; ')
  }

  /* ------------------------------------------------------------- in-app mode */

  /**
   * Brings up the in-app tunnel: authenticate to the portal, then start the
   * loopback proxy that carries the app's traffic.
   *
   * Real gateways frequently answer `/remote/logincheck` with only a temporary
   * `SVPNTMPCOOKIE` plus `redir=/remote/hostcheck_install`, deferring the real
   * `SVPNCOOKIE` until the host check is acknowledged. Following that redirect
   * with the temporary cookie is what turns it into a session cookie, so the
   * proxy is given a usable credential instead of a placeholder.
   */
  async connectInApp(profile) {
    const cookie = await this.portalLogin(profile)
    this.portalCookie = await this.completeHostCheck(profile, cookie)
    await this.startProxy(profile)
  }

  /**
   * Exchanges a temporary portal cookie for a full session cookie by following
   * the hostcheck/portal redirect. Best-effort: if the gateway does not use the
   * hostcheck flow, or the follow-up fails, the original cookie is kept.
   */
  async completeHostCheck(profile, cookie) {
    if (!cookie) return cookie
    const hasSession = /(^|;\s*)SVPNCOOKIE=[^;\s]+/.test(cookie)
    if (hasSession) return cookie

    const paths = ['/remote/hostcheck_install', '/remote/portal']
    let current = cookie
    for (const target of paths) {
      const next = await this.followPortalPath(profile, target, current).catch(() => null)
      if (!next) continue
      current = VPNService.mergeCookies(current, next)
      if (/(^|;\s*)SVPNCOOKIE=[^;\s]+/.test(current)) break
    }
    return current
  }

  /** GETs a portal path with the current cookie and returns any new cookies. */
  followPortalPath(profile, target, cookie) {
    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => { if (!settled) { settled = true; resolve(value) } }
      const options = {
        host: profile.gateway,
        port: profile.port,
        path: target,
        method: 'GET',
        rejectUnauthorized: false,
        timeout: 15000,
        headers: { Cookie: cookie, 'User-Agent': 'HyperFamily-Branch-Monitor', Accept: '*/*', Connection: 'close' }
      }
      let request
      try { request = https.request({ ...options, insecureHTTPParser: true }) } catch { request = https.request(options) }

      request.on('response', (response) => {
        const jar = (response.headers['set-cookie'] || [])
          .map((item) => item.split(';')[0])
          .filter((item) => item.slice(item.indexOf('=') + 1).trim().length > 0)
        response.resume()
        response.on('end', () => finish(jar.join('; ')))
        response.on('error', () => finish(jar.join('; ')))
      })
      request.on('timeout', () => request.destroy())
      request.on('error', () => finish(''))
      request.end()
    })
  }

  /** Merges two cookie strings, letting the newer value win per cookie name. */
  static mergeCookies(existing, incoming) {
    const jar = new Map()
    for (const part of `${existing}; ${incoming}`.split(';')) {
      const item = part.trim()
      if (!item || !item.includes('=')) continue
      const name = item.slice(0, item.indexOf('='))
      const value = item.slice(item.indexOf('=') + 1)
      if (!value.trim()) continue
      jar.set(name, value)
    }
    return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
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
    // Give the client a moment to appear in the process list so the health
    // monitor does not immediately report the session as dead.
    this.forticlientRunning = true
    setTimeout(() => { this.refreshHealth().catch(() => {}) }, 4000)
  }

  /* -------------------------------------------------------------- disconnect */

  async disconnect(actor = 'Admin') {
    this.stopHealthMonitor()
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
    this.forticlientRunning = false
    this.lastLive = false
    return this.emit('disconnected', null)
  }

  stop() {
    this.stopHealthMonitor()
    if (this.proxy) { try { this.proxy.close() } catch {} }
    if (this.process) { try { this.process.kill() } catch {} }
  }
}

module.exports = { VPNService, findFortiClient, FORTICLIENT_DOWNLOAD }
