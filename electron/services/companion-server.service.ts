'use strict'

/**
 * Companion HTTP server — lets the HyperFamily Companion app on Android use
 * this workstation as its backend. The phone never touches the store network
 * itself: it loads the same interface this app serves from out/ and talks to
 * the small /api surface below, which reads the very same database, monitor
 * snapshot and login the desktop app uses.
 *
 * Security model (LAN MVP): every /api route except health requires the
 * companion token (Authorization: Bearer …) shown in Settings, and signing in
 * still requires a real application account. The token can be rotated at any
 * time. Serving plain HTTP on the store LAN is a deliberate trade-off; a TLS
 * option can be layered on later without touching the API shape.
 *
 * The service is dependency-injected (database, exportRoot, appVersion) so it
 * is unit-testable in plain Node, without Electron.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json'
}

const BRIDGE_FILE = path.join(__dirname, 'companion-bridge.txt')
const DEFAULT_PORT = 8420

function newToken() {
  return crypto.randomBytes(24).toString('base64url')
}

/** Every non-internal IPv4 address — the candidates the phone can reach. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry: any) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry: any) => entry.address)
}

function createCompanionServer({ database, exportRoot, appVersion }) {
  let server = null
  let current = { running: false, port: 0, error: null }

  function readConfig() {
    let config: any = {}
    try {
      config = JSON.parse(database.getSettings().companion_server || '{}')
    } catch {
      config = {}
    }
    return config
  }

  /** Loads the stored config, minting the token and default port on first use. */
  function ensureConfig() {
    const config = readConfig()
    let dirty = false
    if (!config.token) {
      config.token = newToken()
      dirty = true
    }
    if (config.port === undefined || config.port === null || config.port === '') {
      config.port = DEFAULT_PORT
      dirty = true
    }
    if (dirty) database.saveSettings({ companion_server: JSON.stringify(config) }, 'Companion server')
    return config
  }

  function sendJson(response, status, body) {
    const payload = JSON.stringify(body ?? null)
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store'
    })
    response.end(payload)
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > 1024 * 1024) {
          reject(Object.assign(new Error('Payload too large'), { status: 413 }))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        if (!chunks.length) return resolve(null)
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(Object.assign(new Error('Body must be JSON'), { status: 400 }))
        }
      })
      request.on('error', reject)
    })
  }

  // One entry per remote capability. `open` skips the token gate (health only,
  // so the phone can verify reachability before the user pastes the token).
  const routes = {
    'GET /api/health': {
      open: true,
      handler: () => ({ ok: true, app: 'HyperFamily Branch Monitor', version: appVersion })
    },
    'POST /api/auth/login': {
      handler: (body) => {
        const user = database.authenticate(body?.username, body?.password)
        if (!user) throw Object.assign(new Error('Invalid username or password'), { status: 401 })
        return user
      }
    },
    'GET /api/app/info': {
      handler: () => ({ version: appVersion, platform: `${os.type()} ${os.release()}`, companion: true })
    },
    'GET /api/monitor': {
      handler: () => database.getMonitorSnapshot(database.getSettings().ping_history_count || 30)
    },
    'GET /api/branches': { handler: () => database.listBranches() },
    'GET /api/devices': { handler: () => database.listDevices() },
    'POST /api/branches': { handler: (body) => database.saveBranch(body || {}, 'Companion') },
    'POST /api/devices': { handler: (body) => database.saveDevice(body || {}, 'Companion') },
    'POST /api/branches/remove': { handler: (body) => database.deleteBranch(Number(body?.id), 'Companion') },
    'POST /api/devices/remove': { handler: (body) => database.deleteDevice(Number(body?.id), 'Companion') },
    'GET /api/settings': { handler: () => database.getSettings() },
    'POST /api/settings': { handler: (body) => database.saveSettings(body || {}, 'Companion') }
  }

  function serveStatic(request, response, pathname) {
    let requested = decodeURIComponent(pathname)
    if (requested.endsWith('/')) requested += 'index.html'
    if (!path.extname(requested)) requested += '/index.html'
    const filePath = path.resolve(exportRoot, `.${requested}`)
    if (
      !filePath.startsWith(`${exportRoot}${path.sep}`) ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      response.writeHead(404, { 'content-type': 'text/plain' })
      return response.end('Not found')
    }
    let data = fs.readFileSync(filePath)
    if (filePath.endsWith('index.html')) {
      // The bridge teaches the served renderer how to reach this server
      // instead of the (absent) Electron preload. It must run before any
      // application script, hence the injection at the top of <head>.
      const html = data
        .toString('utf8')
        .replace('<head>', '<head><script src="/companion-bridge.js"></script>')
      data = Buffer.from(html, 'utf8')
    }
    response.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    })
    response.end(data)
  }

  async function handle(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    try {
      if (url.pathname === '/companion-bridge.js') {
        const bridge = fs.readFileSync(BRIDGE_FILE, 'utf8')
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-cache'
        })
        return response.end(bridge)
      }
      if (url.pathname.startsWith('/api/')) {
        const route = routes[`${request.method} ${url.pathname}`]
        if (!route) return sendJson(response, 404, { error: 'Unknown endpoint' })
        const config = ensureConfig()
        if (!route.open && request.headers.authorization !== `Bearer ${config.token}`) {
          return sendJson(response, 401, {
            error: 'Unauthorized — enter the companion token shown in Settings'
          })
        }
        const body = request.method === 'POST' ? await readBody(request) : null
        return sendJson(response, 200, route.handler(body))
      }
      return serveStatic(request, response, url.pathname)
    } catch (error) {
      return sendJson(response, error.status || 500, { error: error.message || 'Server error' })
    }
  }

  async function start() {
    if (server) return state()
    const config = ensureConfig()
    // 0 is honoured as "any free port" (handy for tests); anything unusable
    // falls back to the default.
    const requested = Number(config.port)
    const port =
      Number.isInteger(requested) && requested >= 0 && requested <= 65535 ? requested : DEFAULT_PORT
    return new Promise((resolve) => {
      const candidate = http.createServer((request, response) => {
        handle(request, response).catch(() => {
          if (!response.headersSent) sendJson(response, 500, { error: 'Server error' })
        })
      })
      candidate.once('error', (error) => {
        current = { running: false, port, error: error.message }
        resolve(state())
      })
      candidate.listen(port, '0.0.0.0', () => {
        server = candidate
        current = { running: true, port: candidate.address().port, error: null }
        resolve(state())
      })
    })
  }

  async function stop() {
    if (server) {
      // Drop keep-alive sockets immediately so the port is really free (and no
      // client can reuse a dead connection after a stop).
      if (server.closeAllConnections) server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    server = null
    current = { running: false, port: current.port, error: null }
    return state()
  }

  /** Applies { enabled, port } from Settings and starts/stops accordingly. */
  async function configure(patch) {
    const config = ensureConfig()
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'port')) {
      const port = Number(patch.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('The port must be a number between 1 and 65535')
      config.port = port
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'enabled'))
      config.enabled = Boolean(patch.enabled)
    database.saveSettings({ companion_server: JSON.stringify(config) }, 'Companion server')
    if (config.enabled && !server) return start()
    if (!config.enabled && server) return stop()
    return state()
  }

  function rotateToken() {
    const config = ensureConfig()
    config.token = newToken()
    database.saveSettings({ companion_server: JSON.stringify(config) }, 'Companion server')
    return state()
  }

  function state() {
    const config = readConfig()
    const configured = Number(config.port)
    return {
      running: Boolean(server),
      enabled: Boolean(config.enabled),
      port: current.running
        ? current.port
        : Number.isInteger(configured) && configured >= 0
          ? configured
          : DEFAULT_PORT,
      token: config.token || '',
      addresses: lanAddresses(),
      error: current.error
    }
  }

  /** App startup hook: honour a previously enabled server without UI action. */
  function autostart() {
    try {
      if (readConfig().enabled) return start()
    } catch {
      /* the database may not be ready yet; the Settings card can start it manually */
    }
    return Promise.resolve(state())
  }

  return { start, stop, configure, rotateToken, state, autostart }
}

module.exports = { createCompanionServer, DEFAULT_PORT }
