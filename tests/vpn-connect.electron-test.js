/**
 * Regression guard for the VPN connect path.
 *
 * v2.0.5 shipped a refactor that left `connect()` calling a `connectInApp()`
 * that no longer existed, so every in-app connection died with
 * "TypeError: this.connectInApp is not a function". Nothing in the suite
 * exercised `connect()`, so the break reached users. This test drives the real
 * service against a mock FortiGate that replays the exact reply shape of the
 * production gateway: `ret=1` with a hostcheck redirect, expired placeholder
 * SVPNCOOKIE values, and the real session only reachable by following the
 * redirect while carrying SVPNTMPCOOKIE.
 *
 * Must run under Electron: cross-env ELECTRON_RUN_AS_NODE=1 electron --test
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const https = require('node:https')

// The service pulls `app.getPath` from Electron's main process, which does not
// exist in ELECTRON_RUN_AS_NODE, so stub the module before requiring it.
const load = Module._load
Module._load = function (request, ...rest) {
  if (request === 'electron') return { app: { getPath: () => require('node:os').tmpdir(), isPackaged: false }, shell: {} }
  return load.call(this, request, ...rest)
}
const { VPNService } = require('../electron/services/vpn.service')

// Long-lived self-signed pair for 127.0.0.1; the service connects with
// rejectUnauthorized:false, so this only needs to be syntactically valid.
const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCoiQ9KU30+c8CY
MDGFWHxOkXrrUpAYVIFe/KKo9e2ExyR4nGaXvidYwfZBPnqaLtVlv0xzLKJeRwkI
bt92CXqpw/7+AIBU8cYGvARDWe4vPcK4b42QalKdgmCrWHciIeZlEIGXiaPGyWox
IaTmo0viYzAknLzhk+5PWeCrtNvuQsflGAtGRrHzU9/lO74V3d18EE91E/g6KR36
V6O2NsRPZrI0oEOG5lDchHubLVf0UH9r9H56ue63TsabjRbib0dkAB+cMLeq7kO0
uSnQAy7x97URCp9C0bFR/mdcCsuBX7FxfACytJWyENz+fEXe44jYCpGbeAPyH2UO
uNC3RVj7AgMBAAECggEAEAVndLNXFpa+WjlKm9h7iKR/wNsKY6W03qi5dcJbH+Im
b2i+v/INn3xgwncEBKArHQ8AX3qAvOGX1Dtl9ryT8ot1NAQsLucE4iMBbL2hzM/c
MNg55t6Ul/CK6/7u5EnAsx7MkvE8pmsDM0R1fo9LaWvwaaqUsgT0BIsQtoHs3ktH
SArnVZP+rRlY6hONSYoGx3Lt3xelTThFL7fSWyqJG+LTfEy3RKRQw0Gt+l0QLu1A
doHhaPTHa890rc/NG5uybkgTaklrwRzfY6ubpFz7WlcfgUWjmkbVkwj5+iY5+LYn
S0Mh1YUPYgonyMzkOdxwJMDKErPWqiX4KfDatmjj4QKBgQDfmuyIbADWVT277WTu
G4AYmW8JqYlvpfXYWCDLTiKM0z0neYH0aOjUc9XOfnxWke58WitBAwtfAvq1TTCH
fpNcNe6/mTiLrUh4iIIFX5/8sVnr2m+bYxAXiv5aEKAmx4Mq9RyX5UdXHO0IQcZK
0OBkuJCo8WUQ+JQ9kTI0mlQVQwKBgQDA87SzPRWbJCA/mvQDdj6GxsgsUUXP9dns
IwkmB2Un2li9o1v2y/0Zempp4naNA3wWzaRs71UheQnWFQ9vR+I+wsxakpdGwrJY
1XiroZbmrAKMdr5RYEXBzkq29MmPUeUSd6u2WzziPvLweclAYuFIEfW5gx93iVZ2
TrjL+UqV6QKBgE7GFW46HlFj1kvOZjA8H/SKmUOeJnzeyq1c3rDA5gsWoAS4GcAw
9VVjOX91r/gPkSTd3z8YA3mFYy1b9CzHusJRfbqiD/mlIlLURHoAJiyvji441fi3
/YNNxC2WjdUblGodz+TzMR7PYfH2uhTBYUwaeVwLLr+70v2dmUJO3DBhAoGAUtHI
RA76ESdGeEaoajv8xpjYHr2bu5GJQmQfbyVJc/uyj2No+9u+/Yqf1mcP/6L5Rkhq
RR/NaJqtcCiGAXvXTp0KXe4B5Kt5JcwrCXBIdyZpyaTGN+OczX0gcLtNMKk0K+MV
3yX2Uh425KVBjtNiYy7iTAhOH17hr9JGW7bbHtECgYEAtju8311gYiwMMEKPDHL1
X1LeUbcLsFCmy3TBB1s+lIcVD3etNCjPS7Z22Ws1j7jLyA1xmpuS2dehSiFoRcpT
/+jlr58WUNUX4E6twgPRtmd9QhDpkvgsHONLDSl+0rQtflIwWLSvHMEXeTmR2KRd
YUs7VIu/Di29NtJk8ozx1Xw=
-----END PRIVATE KEY-----`
const CERT = `-----BEGIN CERTIFICATE-----
MIIDHDCCAgSgAwIBAgIUXuvbNfUmgSKYbkY/wi6rWHkD7wcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMCAXDTI2MDgxNDA2MDA1M1oYDzIxMjYw
NzIxMDYwMDUzWjAUMRIwEAYDVQQDDAkxMjcuMC4wLjEwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCoiQ9KU30+c8CYMDGFWHxOkXrrUpAYVIFe/KKo9e2E
xyR4nGaXvidYwfZBPnqaLtVlv0xzLKJeRwkIbt92CXqpw/7+AIBU8cYGvARDWe4v
PcK4b42QalKdgmCrWHciIeZlEIGXiaPGyWoxIaTmo0viYzAknLzhk+5PWeCrtNvu
QsflGAtGRrHzU9/lO74V3d18EE91E/g6KR36V6O2NsRPZrI0oEOG5lDchHubLVf0
UH9r9H56ue63TsabjRbib0dkAB+cMLeq7kO0uSnQAy7x97URCp9C0bFR/mdcCsuB
X7FxfACytJWyENz+fEXe44jYCpGbeAPyH2UOuNC3RVj7AgMBAAGjZDBiMB0GA1Ud
DgQWBBSPbH7fd6N4aVkClLUsItRQWjCGtjAfBgNVHSMEGDAWgBSPbH7fd6N4aVkC
lLUsItRQWjCGtjAPBgNVHRMBAf8EBTADAQH/MA8GA1UdEQQIMAaHBH8AAAEwDQYJ
KoZIhvcNAQELBQADggEBAKE43HpRttVJtLtdbbYuSPz6qW30KtCACmmuMHwbzcU6
5EK5uj2/HO1KIZflCCZT33YS5OZzFznVZ0MF0cjXS45fj59gP5B1gtsobxZvPU5E
OBAUJzTuctE54URhr/ZMWXoIwQ1SNKMJnOsJldk8Vee6P84foL2IK0o412dUkeuE
OGETdW69oahuH7dQhujOGkt0iBWIw81ZmAeshzz6Km8+Tv15GHnPKgnppPslohWd
pIIOnRNpO5yOHxBtxr0aSEM4/sPzn6kv8qr2R6x3mo6jrMOxX7Iycok/MkPlFUNj
u3Wn5XFhSi2R1A4QZeAGDAMUQqVSgixKbdj5l3e6eIM=
-----END CERTIFICATE-----`

const LOGIN_REPLY = 'ret=1,redir=/remote/hostcheck_install?auth_type=1&user=6C6168696A692E616C69&&grpname=&portal=66756C6C2D616363657373&rip=5.122.241.27&realm='

function startGateway() {
  const state = { hostcheckHits: 0, hostcheckCookie: '', loginBody: '' }
  const server = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    if (req.url === '/remote/logincheck') {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        state.loginBody = Buffer.concat(chunks).toString()
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(LOGIN_REPLY),
          'Set-Cookie': [
            'SVPNCOOKIE=; path=/; expires=Sun, 11 Mar 1984 12:00:00 GMT; secure; httponly',
            'SVPNNETWORKCOOKIE=; path=/remote/network; expires=Sun, 11 Mar 1984 12:00:00 GMT; secure; httponly',
            'SVPNTMPCOOKIE=TMPVALUE123; path=/remote/hostcheck_install; secure; httponly'
          ]
        })
        res.end(LOGIN_REPLY)
      })
      return
    }
    if (req.url.startsWith('/remote/hostcheck_install')) {
      state.hostcheckHits += 1
      state.hostcheckCookie = req.headers.cookie || ''
      res.writeHead(200, { 'Content-Length': 2, 'Set-Cookie': ['SVPNCOOKIE=REALSESSION; path=/; secure; httponly'] })
      res.end('ok')
      return
    }
    res.writeHead(200, { 'Content-Length': 2 })
    res.end('ok')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port }))
  })
}

function makeService(port, events) {
  const settings = { vpn_gateway: '127.0.0.1', vpn_port: port, vpn_user: 'lahiji.ali', vpn_pass: 'secret' }
  const database = { getSettings: () => settings, audit: () => {} }
  return new VPNService(database, require('node:os').tmpdir(), (_channel, payload) => events.push(payload.state))
}

test('in-app connect works end to end against a hostcheck gateway', async (t) => {
  const { server, state, port } = await startGateway()
  const events = []
  const vpn = makeService(port, events)
  t.after(() => { vpn.stop(); server.close() })

  // The regression itself: this threw "connectInApp is not a function".
  const status = await vpn.connect('in_app', 'Admin')

  assert.equal(status.state, 'connected_in_app')
  assert.ok(Number(status.proxyPort) > 0, 'a loopback proxy port must be allocated')
  assert.match(state.loginBody, /username=lahiji\.ali/)
  assert.match(state.loginBody, /credential=secret/)
  // Realm was removed from the profile, so it must always go out empty.
  assert.doesNotMatch(state.loginBody, /realm=[^&]/, 'realm must no longer be sent')

  // The real session cookie only exists after the hostcheck redirect is followed.
  assert.equal(state.hostcheckHits, 1, 'the hostcheck redirect must be followed exactly once')
  assert.match(state.hostcheckCookie, /SVPNTMPCOOKIE=TMPVALUE123/)
  assert.match(vpn.portalCookie, /SVPNCOOKIE=REALSESSION/)
  assert.doesNotMatch(vpn.portalCookie, /SVPNCOOKIE=(;|$|\s)/, 'the expired placeholder must not survive')
})

test('liveness tracking flips the indicator when the tunnel dies', async (t) => {
  const { server, port } = await startGateway()
  const events = []
  const vpn = makeService(port, events)
  t.after(() => { vpn.stop(); server.close() })

  await vpn.connect('in_app', 'Admin')
  assert.equal(vpn.isLive(), true)
  assert.equal(vpn.getStatus().live, true)

  // Kill the proxy behind the service's back, the way a real drop would.
  await new Promise((resolve) => vpn.proxy.close(resolve))
  await vpn.refreshHealth()

  assert.equal(vpn.state, 'disconnected', 'a dead tunnel must not keep reporting connected')
  assert.equal(vpn.isLive(), false)
  assert.ok(events.includes('disconnected'), 'the drop must be pushed to the renderer')

  // A drop must not wedge the service; reconnecting has to work.
  const again = await vpn.connect('in_app', 'Admin')
  assert.equal(again.state, 'connected_in_app')

  await vpn.disconnect('Admin')
  assert.equal(vpn.state, 'disconnected')
  assert.equal(vpn.proxy, null)
  assert.equal(vpn.healthTimer, null, 'the health monitor must stop with the tunnel')
})

/**
 * Every rung of the TLS retry ladder must be accepted by the runtime that
 * actually ships.
 *
 * Electron links against BoringSSL, not OpenSSL, and BoringSSL rejects
 * OpenSSL's `@SECLEVEL=n` cipher syntax with ERR_SSL_INVALID_COMMAND. A rung
 * carrying invalid options throws before a single packet leaves the machine,
 * so the ladder would appear to "try everything" while never actually
 * downgrading anything — the gateway would stay unreachable and the logs would
 * blame the network. This test fails loudly if such a rung is ever added.
 */
test('every TLS profile is valid for this runtime', () => {
  const tls = require('node:tls')
  const { TLS_PROFILES } = require('../electron/services/vpn.service.js')

  assert.ok(Array.isArray(TLS_PROFILES) && TLS_PROFILES.length >= 2,
    'the ladder must expose at least a default and one downgraded profile')

  TLS_PROFILES.forEach((profile, index) => {
    let socket
    try {
      // Port 1 never answers; the point is whether the OPTIONS are accepted,
      // which is decided synchronously before any connection is attempted.
      socket = tls.connect({ host: '127.0.0.1', port: 1, ...profile })
      socket.on('error', () => {})
    } catch (error) {
      assert.fail(`TLS profile ${index} (${JSON.stringify(profile)}) is rejected by this runtime: ${error.code} ${error.message}`)
    } finally {
      if (socket) socket.destroy()
    }
  })

  const text = JSON.stringify(TLS_PROFILES)
  assert.ok(!text.includes('SECLEVEL'),
    'BoringSSL rejects @SECLEVEL cipher strings — such a rung can never negotiate')
})
