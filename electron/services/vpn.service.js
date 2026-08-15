const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const os = require('node:os')
const { execFile, spawn } = require('node:child_process')

/**
 * One VPN mode is supported: "global".
 *
 * It launches the FortiClient VPN installed on the system so the user
 * completes the connection there, then watches for the resulting virtual
 * adapter and adopts it. If FortiClient is not installed the user is warned
 * with a download hint instead of a generic failure.
 *
 * An application-level tunnel ("in_app") used to sit alongside this: a
 * loopback HTTP/CONNECT proxy that carried the app's own traffic through the
 * FortiGate web portal. It never completed a TLS handshake against the
 * production gateway and was removed in v2.0.10. The portal HTTP layer below
 * is retained because Settings → VPN "Test & diagnose" still uses it to report
 * exactly how the gateway answers a sign-in.
 */

const FORTICLIENT_CANDIDATES = [
  'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe',
  'C:\\Program Files\\Fortinet\\FortiClient\\FortiSSLVPNclient.exe',
  'C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiClient.exe',
  'C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiSSLVPNclient.exe'
]

/**
 * Every FortiClient flavour accepts a CLI disconnect, but under a different
 * executable name per generation. All of them are tried until the tunnel
 * actually drops (verified afterwards by polling the adapter):
 *
 *   FortiVPN.exe          -- 7.4+ / 8.x full suite   (--cli --disconnect)
 *   FortiClient.exe       -- older full suites       (disconnect)
 *   FortiSSLVPNclient.exe -- standalone SSL VPN      (disconnect)
 */
const DISCONNECT_COMMANDS = [
  { exe: 'FortiVPN.exe', args: ['--cli', '--disconnect'] },
  { exe: 'FortiClient.exe', args: ['disconnect'] },
  { exe: 'FortiSSLVPNclient.exe', args: ['disconnect'] }
]

/** How long a disconnect may take before the app starts suspecting it. */
const DISCONNECT_TUNNEL_TIMEOUT_MS = 12000

const FORTICLIENT_DOWNLOAD = 'https://www.fortinet.com/support/product-downloads#vpn'

/**
 * FortiGate appliances are long-lived and many still terminate TLS with a
 * legacy stack: RSA key exchange, SHA-1 signature algorithms, or a narrow ECDH
 * curve set. Electron ships BoringSSL with a modern security level, which
 * rejects those handshakes outright and surfaces the failure as
 *   write EPROTO ... RSA routines:OPENSSL_internal:FIRST_OCTET_INVALID
 * long before any certificate is ever inspected — which is why
 * `rejectUnauthorized: false` alone never helped.
 *
 * Rather than permanently weakening every connection, each TLS attempt walks
 * this ladder and stops at the first rung that completes a handshake. Modern
 * gateways stay on rung 0 and keep full-strength crypto.
 */
/**
 * Handshake retry ladder, from strictest to most permissive.
 *
 * Electron links against BoringSSL, NOT OpenSSL. BoringSSL rejects OpenSSL's
 * `@SECLEVEL=n` cipher-string syntax outright with
 * `ERR_SSL_INVALID_COMMAND ... INVALID_COMMAND`, so a `DEFAULT:@SECLEVEL=0`
 * rung — the fix quoted all over the web for this error — throws before a
 * packet is ever sent and silently defeats the whole ladder. Setting
 * `secureProtocol` together with `minVersion` is rejected as well
 * (ERR_TLS_PROTOCOL_VERSION_CONFLICT). Every rung below is verified to be
 * accepted by the Electron runtime this app actually ships.
 *
 * The gateway's failure (`RSA routines: FIRST_OCTET_INVALID` during
 * `write EPROTO`) is an old appliance negotiating a legacy RSA key exchange,
 * so the ladder widens the version floor, the curves and the cipher list, and
 * finally offers the plain RSA suites modern defaults no longer include.
 */
const TLS_PROFILES = [
  {},
  { minVersion: 'TLSv1.2', ecdhCurve: 'auto' },
  { minVersion: 'TLSv1', ecdhCurve: 'auto', ciphers: 'DEFAULT', sigalgs: 'RSA+SHA1:RSA+SHA256:RSA+SHA384:ECDSA+SHA1:ECDSA+SHA256' },
  { minVersion: 'TLSv1', ecdhCurve: 'P-521:P-384:P-256', ciphers: 'ALL' },
  {
    minVersion: 'TLSv1',
    ecdhCurve: 'P-521:P-384:P-256',
    // Explicit legacy RSA key-exchange suites: the ones an appliance that
    // trips FIRST_OCTET_INVALID typically still wants to speak.
    ciphers: 'AES128-SHA:AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:DES-CBC3-SHA:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA'
  }
]

/** True when an error is a TLS negotiation failure worth retrying lower down. */
function isHandshakeFailure(error) {
  if (!error) return false
  const text = `${error.code || ''} ${error.message || ''}`
  return /EPROTO|ERR_SSL|SSL routines|RSA routines|FIRST_OCTET_INVALID|wrong version number|no ciphers|unsupported protocol|handshake|DECRYPTION_FAILED|sslv3 alert/i.test(text)
}

/** Merges a TLS profile into request options. */
function withTls(options, profile) {
  return { ...options, ...profile }
}

/** How long the Global mode waits for the user to finish signing in. */
const GLOBAL_TUNNEL_TIMEOUT_MS = 90000

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
    // Index into TLS_PROFILES that this gateway last completed a handshake on.
    this.tlsProfileIndex = 0
    this.tlsDowngraded = false
    this.gateway = null
    this.stats = { requests: 0, bytes: 0, since: null }
    this.healthTimer = null
    this.forticlientRunning = false
    this.serviceRunning = false
    this.tunnelUp = false
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
      gateway: this.gateway,
      stats: this.stats,
      live: this.isLive(),
      serviceRunning: this.serviceRunning,
      tunnelUp: this.tunnelUp,
      forticlientInstalled: this.isForticlientInstalled()
    }
  }

  /**
   * True when the tunnel is genuinely carrying traffic right now.
   *
   * The UI indicator must reflect reality rather than the last thing that was
   * clicked: the tunnel is live only while a FortiClient virtual adapter is
   * actually routable.
   */
  isLive() {
    // Global mode is live only when a real tunnel exists. Launching (or merely
    // installing) FortiClient is NOT a connection: its tray app and background
    // service run permanently on a healthy Windows box, so neither can be used
    // as the indicator. A routable virtual adapter is the honest signal.
    if (this.mode === 'global') return this.tunnelUp
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

    // The real tunnel is probed every tick regardless of the mode we think we
    // are in, so a tunnel raised or dropped in FortiClient itself is reflected
    // in the indicator within one second either way.
    const probe = await VPNService.detectGlobalTunnel(this.globalBaseline || null)
    this.serviceRunning = probe.serviceRunning
    this.forticlientRunning = probe.serviceRunning
    this.tunnelUp = probe.live

    const live = this.isLive()
    const claimsConnected = this.state.startsWith('connected')

    // The tunnel died underneath us (FortiClient disconnected or dropped).
    if (claimsConnected && !live) {
      this.gateway = null
      this.emit('disconnected', null, 'The FortiClient tunnel is no longer connected')
      return
    }

    // A tunnel was raised in FortiClient outside the app: adopt it, so the
    // header turns green for a connection the user made themselves. This also
    // completes a Global connect whose sign-in outlasted the initial wait.
    if (!claimsConnected && probe.live) {
      const wasAwaiting = this.state === 'awaiting_forticlient'
      this.mode = 'global'
      this.lastLive = true
      this.globalBaseline = null
      if (wasAwaiting) {
        try { this.database.audit('Admin', 'VPN_CONNECT', 'global', `Gateway ${this.gateway || ''}`) } catch {}
      }
      this.emit('connected_global', 'global', wasAwaiting
        ? 'FortiClient signed in — the tunnel is up'
        : 'FortiClient tunnel detected')
      return
    }

    if (this.lastLive !== live) {
      this.lastLive = live
      this.sendEvent('vpn:status', this.getStatus())
    }
  }

  /* ------------------------------------------------- global tunnel detection */

  /**
   * Windows service names used by the FortiClient VPN family. The SSL-VPN
   * daemon is the one that actually carries a tunnel; the others are the
   * scheduler/tray helpers that ship with the full FortiClient suite.
   */
  static VPN_SERVICES = ['FortiSSLVPNdaemon', 'FA_Scheduler', 'FortiClient', 'FortiClientService']

  /**
   * Is the FortiClient VPN Windows service running?
   *
   * `sc query <name>` prints `STATE : 4  RUNNING` for a live service and exits
   * non-zero (1060) when the service does not exist, so a missing service is
   * simply "not running" rather than an error.
   */
  static queryService(name) {
    return new Promise((resolve) => {
      execFile('sc', ['query', name], { windowsHide: true, timeout: 4000 }, (error, stdout = '') => {
        if (error && !stdout) return resolve(false)
        resolve(/STATE\s+:\s*4\s*RUNNING/i.test(stdout))
      })
    })
  }

  /** True when any FortiClient VPN service reports RUNNING. */
  static async isVpnServiceRunning() {
    if (process.platform !== 'win32') return false
    for (const name of VPNService.VPN_SERVICES) {
      if (await VPNService.queryService(name)) return true
    }
    return false
  }

  /**
   * True when a Fortinet virtual adapter currently holds a routable IPv4
   * address — the only trustworthy proof that a tunnel is actually carrying
   * traffic.
   *
   * This is what makes the indicator honest. The FortiClient service and tray
   * process run permanently on a healthy Windows machine, so neither of them
   * can distinguish "FortiClient is open" from "FortiClient is connected".
   * The virtual adapter only receives an address once the tunnel is
   * established, and loses it the moment the user disconnects.
   */
  static TUNNEL_NAME_PATTERN = /forti|ppp|ssl.?vpn|tap.?windows|vpn/i

  /** Every usable non-internal IPv4 address, keyed by adapter name. */
  static ipv4Addresses() {
    const found = []
    try {
      for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
        for (const address of addresses || []) {
          const isV4 = address.family === 4 || address.family === 'IPv4'
          if (!isV4 || address.internal) continue
          // 169.254.x.x is an APIPA self-assignment: the adapter is present
          // but the tunnel never came up.
          if (/^169\.254\./.test(address.address)) continue
          if (!address.address || address.address === '0.0.0.0') continue
          found.push({ name, address: address.address })
        }
      }
    } catch {}
    return found
  }

  /**
   * Name-based detection only. Windows lets an adapter be renamed, so the
   * FortiClient adapter frequently surfaces as plain "Ethernet 5" — which is
   * why this can never be the only signal (see detectGlobalTunnel).
   */
  static isTunnelAdapterUp() {
    return VPNService.ipv4Addresses().some((entry) => VPNService.TUNNEL_NAME_PATTERN.test(entry.name))
  }

  /**
   * Adapter *descriptions* via PowerShell. The friendly name can be anything,
   * but the hardware description keeps the vendor string, so this catches a
   * renamed FortiClient adapter that the name test misses.
   */
  static isTunnelAdapterUpByDescription() {
    if (process.platform !== 'win32') return Promise.resolve(false)
    return new Promise((resolve) => {
      const script = "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } | " +
        "ForEach-Object { (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).InterfaceDescription }"
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 8000 }, (error, stdout) => {
          if (error) return resolve(false)
          resolve(/forti|ssl.?vpn|pangp|tap-windows/i.test(stdout || ''))
        })
    })
  }

  /** Is a FortiClient VPN tunnel process running? (suite presence, not state) */
  static isForticlientProcessRunning() {
    if (process.platform !== 'win32') return Promise.resolve(false)
    return new Promise((resolve) => {
      execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, timeout: 6000 }, (error, stdout) => {
        if (error) return resolve(false)
        resolve(/"(FortiSSLVPNdaemon|FortiClient|FortiTray|FortiSSLVPNclient)\.exe"/i.test(stdout))
      })
    })
  }

  /**
   * Resolves the true global-mode tunnel state.
   *
   * A tunnel counts as up when the VPN service is running AND a Fortinet
   * adapter holds a real address. The adapter alone is enough evidence, but
   * requiring the service too keeps the reading stable while Windows tears a
   * disconnected adapter down.
   */
  static async detectGlobalTunnel(baseline = null) {
    if (process.platform !== 'win32') return { serviceRunning: false, adapterUp: false, live: false }
    const [serviceRunning, processRunning, byDescription] = await Promise.all([
      VPNService.isVpnServiceRunning(),
      VPNService.isForticlientProcessRunning(),
      VPNService.isTunnelAdapterUpByDescription()
    ])

    const byName = VPNService.isTunnelAdapterUp()

    // Third signal: an interface that simply was not there before the connect
    // attempt began. A renamed adapter defeats both string tests, but it still
    // has to appear, and it only appears because the tunnel came up.
    let byBaseline = false
    if (baseline) {
      const current = VPNService.ipv4Addresses()
      byBaseline = current.some((entry) => !baseline.has(`${entry.name}|${entry.address}`))
    }

    const adapterUp = byName || byDescription || byBaseline
    return {
      serviceRunning: serviceRunning || processRunning,
      adapterUp,
      live: adapterUp,
      signals: { byName, byDescription, byBaseline }
    }
  }

  /** Snapshot of the current addresses, used as the before-connect baseline. */
  static addressBaseline() {
    return new Set(VPNService.ipv4Addresses().map((entry) => `${entry.name}|${entry.address}`))
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
      // FortiClient carries the profile now, so being installed is all the
      // configuration the app needs.
      configured: Boolean(executable)
    }
  }

  /**
   * Describes the gateway profile, without demanding one.
   *
   * Signing in happens inside the FortiClient window, so the app no longer
   * needs — or asks for — a gateway, username or password: requiring them
   * blocked a connection the user could complete perfectly well by hand.
   * Stored values from earlier versions are still read, purely so the status
   * card and the audit log can name the gateway. Everything is optional.
   */
  profileFrom(settings) {
    const gateway = String(settings.vpn_gateway || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    return {
      gateway,
      port: Number(settings.vpn_port) || 443,
      username: String(settings.vpn_user || ''),
      password: String(settings.vpn_pass || '')
    }
  }

  /**
   * The portal diagnostics still need real credentials, so that one caller —
   * and only that one — insists on them.
   */
  requireProfile(settings) {
    const profile = this.profileFrom(settings)
    if (!profile.gateway) throw new Error('Set the FortiClient Remote Gateway in Settings → VPN first')
    if (!profile.username || !profile.password) throw new Error('Set the VPN username and password in Settings → VPN first')
    return profile
  }

  /**
   * Opens the VPN.
   *
   * Only one mode exists: "global", which drives the installed FortiClient.
   * The former application-level tunnel ("in_app") was removed — it could not
   * complete a TLS handshake against this gateway and offered no path that the
   * FortiClient route does not already cover. Legacy mode names are accepted
   * and folded into global so an old renderer, a queued IPC call or a stored
   * preference cannot fail with "Invalid VPN mode".
   */
  async connect(mode = 'global', actor = 'Admin') {
    const requested = mode === 'split' ? 'in_app' : mode === 'full' ? 'global' : mode
    if (requested && !['in_app', 'global'].includes(requested)) throw new Error('Invalid VPN mode')
    const normalized = 'global'
    if (this.state === 'connecting' || this.state.startsWith('connected')) throw new Error('A VPN session is already active')

    const settings = this.database.getSettings()
    const profile = this.profileFrom(settings)
    this.emit('connecting', normalized)

    try {
      const outcome = await this.connectGlobal(profile, settings)
      this.gateway = profile.gateway ? `${profile.gateway}:${profile.port}` : null
      this.stats = { requests: 0, bytes: 0, since: new Date().toISOString() }

      // Global mode where the user has not finished signing in yet: this is
      // not a failure. Keep watching and let refreshHealth flip the indicator
      // to green the moment the tunnel appears.
      if (outcome && outcome.pending) {
        this.mode = 'global'
        this.lastLive = false
        this.startHealthMonitor()
        return this.emit('awaiting_forticlient', 'global',
          'FortiClient is open — finish signing in there. The indicator turns green on its own as soon as the tunnel is up.')
      }

      this.database.audit(actor, 'VPN_CONNECT', normalized, this.gateway ? `Gateway ${this.gateway}` : 'FortiClient tunnel')
      this.lastLive = true
      this.startHealthMonitor()
      return this.emit('connected_global', normalized)
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
  /**
   * Walks the TLS ladder until a handshake succeeds, then remembers the rung
   * that worked so every later connection in the session starts there.
   */
  async portalRequest(profile) {
    const start = this.tlsProfileIndex || 0
    const order = [start, ...TLS_PROFILES.keys()].filter((index, position, all) => all.indexOf(index) === position)
    let lastError = null
    for (const index of order) {
      try {
        const result = await this.portalRequestWith(profile, TLS_PROFILES[index])
        this.tlsProfileIndex = index
        if (index > 0) this.tlsDowngraded = true
        return result
      } catch (error) {
        lastError = error
        // Only a handshake failure justifies trying weaker crypto; a refused
        // login or an unreachable host must surface immediately.
        if (!isHandshakeFailure(error)) throw error
      }
    }
    throw lastError
  }

  portalRequestWith(profile, tlsProfile = {}) {
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
      const tuned = withTls(options, tlsProfile)
      let request
      try {
        request = https.request({ ...tuned, insecureHTTPParser: true })
      } catch {
        request = https.request(tuned)
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
        let message = error.message
        if (/parse error/i.test(error.message)) {
          message = `${error.message} — the gateway sent a malformed reply. Check that the Remote Gateway host and port point at the SSL-VPN portal, or use the Global (FortiClient) mode.`
        } else if (isHandshakeFailure(error)) {
          message = `${error.message} — the gateway refused the TLS handshake. Its SSL-VPN service may be listening on a different port, or it only offers ciphers this build cannot negotiate. Verify the Remote Gateway port (commonly 443 or 10443) in Settings, or use the Global (FortiClient) mode.`
        }
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

    // Record which addresses existed *before* FortiClient starts, so a tunnel
    // adapter that Windows has renamed is still recognised: it is simply an
    // interface that was not there a moment ago.
    this.globalBaseline = VPNService.addressBaseline()

    // A tunnel may already be up from an earlier FortiClient session.
    const already = await VPNService.detectGlobalTunnel(null)
    if (already.live) {
      this.tunnelUp = true
      this.serviceRunning = true
      this.forticlientRunning = true
      return { adopted: true }
    }

    // Launch the installed client so the user completes the connection there.
    const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
    child.unref()
    this.process = null

    // Opening FortiClient is not the same as connecting through it: the user
    // still has to sign in there, and that can take longer than any timeout we
    // pick (2FA, a password prompt, a coffee). Waiting and then *failing* was
    // the bug — the tunnel would come up seconds later with the app still
    // insisting it had not. So the wait is now advisory: if it elapses we stay
    // in a watching state and the health monitor adopts the tunnel the instant
    // it appears, instead of throwing the session away.
    const appeared = await this.waitForTunnel(GLOBAL_TUNNEL_TIMEOUT_MS, this.globalBaseline)
    if (!appeared) return { pending: true }

    this.tunnelUp = true
    this.serviceRunning = true
    this.forticlientRunning = true
    return { adopted: false }
  }

  /** Polls for a real tunnel adapter, resolving true as soon as one appears. */
  async waitForTunnel(timeoutMs, baseline = null) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const probe = await VPNService.detectGlobalTunnel(baseline)
      if (probe.live) return true
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    return false
  }

  /* -------------------------------------------------------------- disconnect */

  /**
   * Drops the FortiClient tunnel.
   *
   * The bug this fixes (v2.0.12): the old code only issued the CLI disconnect
   * when the *standalone* client (FortiSSLVPNclient.exe) was the one found on
   * disk. With the full suite installed — the default forticlient_path points
   * at FortiClient.exe — nothing was ever executed, yet the method still
   * emitted `disconnected`, so the header flipped to "VPN off" while
   * FortiClient happily kept the tunnel up.
   *
   * Now every generation of the client gets its own disconnect command, and
   * the result is verified: the adapter is polled until it actually releases
   * its address. Only then is the session reported as disconnected — if the
   * tunnel is still up after every attempt, the state stays `connected_global`
   * and the error is surfaced instead of lying about it.
   */
  async disconnect(actor = 'Admin') {
    const modeBefore = this.mode || 'unknown'

    if (process.platform === 'win32') {
      const settings = this.safeSettings()
      const installed = findFortiClient(settings.forticlient_path)

      // Directories to look in: the configured executable's folder plus the
      // two standard FortiClient install roots.
      const roots = [...new Set([
        installed && path.dirname(installed),
        ...FORTICLIENT_CANDIDATES.map((candidate) => path.dirname(candidate))
      ].filter(Boolean))]

      for (const command of DISCONNECT_COMMANDS) {
        const executable = roots
          .map((root) => path.join(root, command.exe))
          .find((candidate) => { try { return fs.existsSync(candidate) } catch { return false } })
        if (!executable) continue
        await new Promise((resolve) => execFile(executable, command.args, { windowsHide: true, timeout: 15000 }, () => resolve()))
      }
    }

    // The CLI only *asks* FortiClient to drop the tunnel; the virtual adapter
    // releases its address a moment later. Poll until that really happens —
    // the health monitor keeps running meanwhile, so it would adopt or flag
    // any state change we miss.
    const deadline = Date.now() + DISCONNECT_TUNNEL_TIMEOUT_MS
    let probe = await VPNService.detectGlobalTunnel(this.globalBaseline || null)
    while (probe.live && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      probe = await VPNService.detectGlobalTunnel(this.globalBaseline || null)
    }

    // The tunnel is still carrying traffic. Claiming "disconnected" here is
    // exactly the bug this method exists to prevent.
    if (probe.live) {
      const message = 'FortiClient did not drop the tunnel. Disconnect it inside the FortiClient window, or press the button again.'
      this.database.audit(actor, 'VPN_DISCONNECT', modeBefore, message)
      this.emit('connected_global', 'global', message)
      throw new Error(message)
    }

    this.stopHealthMonitor()
    this.database.audit(actor, 'VPN_DISCONNECT', modeBefore, 'VPN session disconnected')
    this.gateway = null
    this.forticlientRunning = false
    this.serviceRunning = false
    this.tunnelUp = false
    this.lastLive = false
    this.globalBaseline = null
    return this.emit('disconnected', null)
  }

  stop() {
    this.stopHealthMonitor()
    if (this.process) { try { this.process.kill() } catch {} }
  }
}

module.exports = { VPNService, findFortiClient, FORTICLIENT_DOWNLOAD, TLS_PROFILES }
