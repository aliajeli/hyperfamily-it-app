const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createCompanionServer } = require('../../electron/services/companion-server.service')

/**
 * The companion server must be verifiable without Electron: it is the phone's
 * only door into the workstation, so its token gate, login path and payload
 * shapes are contract-tested here against an injected fake database.
 */
function fakeDatabase(initial = {}) {
  const settings = { ping_history_count: 30, ...initial }
  const database = {
    settings,
    getSettings: () => ({ ...settings }),
    saveSettings: (patch) => Object.assign(settings, patch),
    authenticate: (username, password) =>
      username === 'Admin' && password === 'secret' ? { id: 1, username: 'Admin' } : null,
    getMonitorSnapshot: () => ({
      branches: [{ id: 1, name: 'Main' }],
      devices: [],
      generated_at: '2026-09-16T00:00:00Z'
    }),
    listBranches: () => [{ id: 1, name: 'Main' }],
    listDevices: () => [{ id: 9, name: 'CO-01' }],
    saveBranch: (data) => ({ saved: data }),
    saveDevice: (data) => ({ saved: data }),
    deleteBranch: (id) => ({ deleted: id }),
    deleteDevice: (id) => ({ deleted: id }),
    notes: [],
    listNotes: () => [...database.notes],
    saveNote: (payload) => {
      const saved = { id: payload.id || database.notes.length + 1, name: payload.name, ...payload }
      if (payload.id) database.notes = database.notes.map((n) => (n.id === payload.id ? saved : n))
      else database.notes.push(saved)
      return saved
    },
    deleteNote: (id) => {
      database.notes = database.notes.filter((n) => n.id !== id)
      return { deleted: id }
    },
    snippets: [],
    listSnippets: () => [...database.snippets],
    saveSnippet: (payload) => {
      const saved = { id: payload.id || database.snippets.length + 1, ...payload }
      database.snippets.push(saved)
      return saved
    },
    deleteSnippet: (id) => {
      database.snippets = database.snippets.filter((n) => n.id !== id)
      return { deleted: id }
    },
    listInventory: () => [{ id: 1, name: 'CO-01', kind: 'Checkout' }],
    listCredentials: () => [{ id: 1, label: 'Admin' }],
    getCredentialMap: () => ({ 9: [1] }),
    listDeviceCredentialOverview: () => [{ device_id: 9, assigned: 1 }]
  }
  return database
}

function tempExport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-'))
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    '<!doctype html><html><head><title>App</title></head><body>shell</body></html>'
  )
  fs.mkdirSync(path.join(dir, '_next'), { recursive: true })
  fs.writeFileSync(path.join(dir, '_next', 'app.js'), 'console.log(1)')
  return dir
}

async function withServer(initialSettings, run, terminal = null) {
  const database = fakeDatabase(initialSettings)
  const service = createCompanionServer({
    database,
    exportRoot: tempExport(),
    appVersion: '0.0.0-test',
    terminal
  })
  const state = await service.start()
  try {
    await run(service, state, database)
  } finally {
    await service.stop()
  }
}

const get = (url, token) =>
  // connection: close — the ephemeral test ports get recycled by the OS, and a
  // pooled keep-alive socket to a previous server would surface as "fetch failed".
  fetch(url, {
    headers: { connection: 'close', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  }).then(async (response) => ({
    status: response.status,
    type: response.headers.get('content-type'),
    body: await response.text()
  }))

test('health is reachable without the token so the phone can probe first', async () => {
  await withServer({}, async (_service, state) => {
    const response = await get(`http://127.0.0.1:${state.port}/api/health`)
    assert.equal(response.status, 200)
    assert.equal(JSON.parse(response.body).ok, true)
  })
})

test('every data endpoint demands the companion token', async () => {
  await withServer(
    { companion_server: JSON.stringify({ token: 'known-token', port: 0 }) },
    async (_service, state) => {
      const denied = await get(`http://127.0.0.1:${state.port}/api/monitor`)
      assert.equal(denied.status, 401)
      assert.match(denied.body, /companion token/i)
      const allowed = await get(`http://127.0.0.1:${state.port}/api/monitor`, 'known-token')
      assert.equal(allowed.status, 200)
      assert.equal(JSON.parse(allowed.body).branches[0].name, 'Main')
    }
  )
})

test('login checks the real account database and mirrors the desktop error', async () => {
  await withServer({ companion_server: JSON.stringify({ token: 't', port: 0 }) }, async (_service, state) => {
    const bad = await fetch(`http://127.0.0.1:${state.port}/api/auth/login`, {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify({ username: 'Admin', password: 'wrong' })
    })
    assert.equal(bad.status, 401)
    const good = await fetch(`http://127.0.0.1:${state.port}/api/auth/login`, {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify({ username: 'Admin', password: 'secret' })
    })
    assert.equal(good.status, 200)
    assert.equal((await good.json()).username, 'Admin')
  })
})

test('the served shell carries the companion bridge before any app script', async () => {
  await withServer({ companion_server: JSON.stringify({ token: 't', port: 0 }) }, async (_service, state) => {
    const response = await get(`http://127.0.0.1:${state.port}/`)
    assert.equal(response.status, 200)
    assert.match(response.type, /text\/html/)
    assert.ok(response.body.includes('<head><script src="/companion-bridge.js"></script>'))
    const bridge = await get(`http://127.0.0.1:${state.port}/companion-bridge.js`)
    assert.match(bridge.type, /javascript/)
    assert.ok(bridge.body.includes('window.hyperfamily'))
  })
})

test('static serving stays inside the export and serves nested assets', async () => {
  await withServer({ companion_server: JSON.stringify({ token: 't', port: 0 }) }, async (_service, state) => {
    const missing = await get(`http://127.0.0.1:${state.port}/../package.json`)
    assert.equal(missing.status, 404)
    const asset = await get(`http://127.0.0.1:${state.port}/_next/app.js`)
    assert.equal(asset.status, 200)
    assert.match(asset.type, /javascript/)
  })
})

test('configure persists enabled/port, rotateToken changes the token, autostart honours the flag', async () => {
  const database = fakeDatabase({ companion_server: JSON.stringify({ port: 0 }) })
  const service = createCompanionServer({ database, exportRoot: tempExport(), appVersion: '0.0.0-test' })
  // configure() validates and persists; enabling starts the (ephemeral) server.
  const configured = await service.configure({ enabled: true })
  assert.equal(configured.running, true)
  assert.equal(configured.enabled, true)
  const firstToken = configured.token
  assert.ok(firstToken.length >= 20)
  const rotated = service.rotateToken()
  assert.notEqual(rotated.token, firstToken)
  await service.stop()
  const restarted = await service.autostart()
  assert.equal(restarted.running, true, 'a previously enabled server must come back with the app')
  await service.stop()
  const off = await service.configure({ enabled: false })
  assert.equal(off.running, false)
  assert.equal(off.enabled, false)
  const idle = await service.autostart()
  assert.equal(idle.running, false)
  // The UI must never offer nonsense ports; 0 (random) stays a config-only escape hatch.
  await assert.rejects(() => service.configure({ port: 99999 }), /between 1 and 65535/)
  await assert.rejects(() => service.configure({ port: 'abc' }), /between 1 and 65535/)
})

/**
 * REGRESSION (v3.8.2): the phone's connect screen probes /api/health from the
 * Capacitor origin (https://localhost). Without CORS headers the WebView
 * discards the response and reports "Could not reach that server" even though
 * the server answered — the exact field failure this pins down.
 */
test('API answers carry CORS headers so the phone WebView can read them', async () => {
  await withServer(
    { companion_server: JSON.stringify({ token: 'cors-token', port: 0 }) },
    async (_service, state) => {
      const base = `http://127.0.0.1:${state.port}`
      const health = await fetch(`${base}/api/health`, {
        headers: { origin: 'https://localhost', connection: 'close' }
      })
      assert.equal(health.status, 200)
      assert.equal(health.headers.get('access-control-allow-origin'), '*')

      const guarded = await fetch(`${base}/api/branches`, {
        headers: {
          authorization: 'Bearer cors-token',
          origin: 'https://localhost',
          connection: 'close'
        }
      })
      assert.equal(guarded.status, 200)
      assert.equal(guarded.headers.get('access-control-allow-origin'), '*')

      // Preflight for a token-bearing POST from the foreign origin.
      const preflight = await fetch(`${base}/api/devices`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://localhost',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
          connection: 'close'
        }
      })
      assert.equal(preflight.status, 204)
      assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
      assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/)
      assert.match(preflight.headers.get('access-control-allow-headers') || '', /authorization/)
    }
  )
})

/**
 * v3.9.0: the phone is a full companion — notes/snippets/inventory/credentials
 * ride the same token gate as everything else.
 */
test('notes, snippets, inventory and credentials are exposed to the phone', async () => {
  await withServer(
    { companion_server: JSON.stringify({ token: 'full-token', port: 0 }) },
    async (_service, state) => {
      const base = `http://127.0.0.1:${state.port}`
      const headers = { authorization: 'Bearer full-token', connection: 'close' }
      const jsonHeaders = { ...headers, 'content-type': 'application/json' }

      // Notes round-trip through the real HTTP surface.
      const created = await (
        await fetch(`${base}/api/notes`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ name: 'VLAN plan', body: '172.18/24' })
        })
      ).json()
      const listed = await (await fetch(`${base}/api/notes`, { headers })).json()
      assert.equal(listed.length, 1)
      assert.equal(listed[0].name, 'VLAN plan')
      const removed = await (
        await fetch(`${base}/api/notes/remove`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ id: created.id })
        })
      ).json()
      assert.equal(removed.deleted, created.id)

      const snippets = await (await fetch(`${base}/api/snippets`, { headers })).json()
      assert.equal(Array.isArray(snippets), true)
      const inventory = await (await fetch(`${base}/api/inventory`, { headers })).json()
      assert.equal(inventory[0].name, 'CO-01')
      const credentials = await (await fetch(`${base}/api/credentials`, { headers })).json()
      assert.equal(credentials[0].label, 'Admin')
      const overview = await (await fetch(`${base}/api/credentials/overview`, { headers })).json()
      assert.equal(overview[0].device_id, 9)

      // Without the token the new surface stays closed, exactly like the old one.
      const denied = await fetch(`${base}/api/notes`, { headers: { connection: 'close' } })
      assert.equal(denied.status, 401)
    }
  )
})

/**
 * v3.10.0: the phone opens real switch consoles through the terminal service.
 * The service believes it talks to a renderer WebContents; here the synthetic
 * sender's send() is the tap that proves the event pipeline reaches HTTP.
 */
test('the phone can open a terminal session and stream its output', async () => {
  const fakeTerminal = {
    sender: null,
    targets: () => [{ id: 1, name: 'Main', devices: [{ id: 9, name: 'SW-01' }] }],
    open: (_options, sender) => {
      fakeTerminal.sender = sender
      return { sessionId: 'sess-1' }
    },
    write: () => {},
    resize: () => {},
    close: () => {}
  }
  await withServer(
    { companion_server: JSON.stringify({ token: 'term-token', port: 0 }) },
    async (_service, state) => {
      const base = `http://127.0.0.1:${state.port}`
      const headers = { authorization: 'Bearer term-token', connection: 'close' }
      const json = { ...headers, 'content-type': 'application/json' }

      const targets = await (await fetch(`${base}/api/terminal/targets`, { headers })).json()
      assert.equal(targets[0].name, 'Main')

      const opened = await (
        await fetch(`${base}/api/terminal/open`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ deviceId: 9, cols: 80, rows: 24 })
        })
      ).json()
      assert.equal(opened.sessionId, 'sess-1')
      assert.ok(fakeTerminal.sender, 'the service must receive the companion sender')

      // The service streams through the sender; the phone drains /events.
      fakeTerminal.sender.send('terminal:data', { sessionId: 'sess-1', data: 'SW-01#' })
      fakeTerminal.sender.send('terminal:status', { sessionId: 'sess-1', state: 'connected' })
      const events = await (await fetch(`${base}/api/terminal/events?after=0`, { headers })).json()
      assert.equal(events.length, 2)
      assert.equal(events[0].channel, 'terminal:data')
      assert.equal(events[0].payload.data, 'SW-01#')
      const drained = await (
        await fetch(`${base}/api/terminal/events?after=${events[1].seq}`, { headers })
      ).json()
      assert.equal(drained.length, 0)

      await (
        await fetch(`${base}/api/terminal/write`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ sessionId: 'sess-1', data: 'show version\r' })
        })
      ).json()
    },
    fakeTerminal
  )
})

test('without a terminal service the endpoints answer 501, not a crash', async () => {
  await withServer(
    { companion_server: JSON.stringify({ token: 'no-term', port: 0 }) },
    async (_service, state) => {
      const response = await fetch(`http://127.0.0.1:${state.port}/api/terminal/targets`, {
        headers: { authorization: 'Bearer no-term', connection: 'close' }
      })
      assert.equal(response.status, 501)
    }
  )
})
