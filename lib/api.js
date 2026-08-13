'use client'

import bcrypt from 'bcryptjs'
import { DEFAULT_SETTINGS } from '@/lib/constants'
import { statusFromPing } from '@/lib/utils'

const STORE_KEY = 'hyperfamily.browser.demo.v2'
const AUTH_STORE_KEY = 'hyperfamily.browser.auth.v2'
const MAX_SWITCH_PORTS = 48

function normalizeSwitchPorts(ports, deviceId) {
  if (!Array.isArray(ports)) throw new Error('Switch ports must be provided as a list')
  if (ports.length > MAX_SWITCH_PORTS) throw new Error(`A Switch can contain at most ${MAX_SWITCH_PORTS} ports`)
  const seen = new Set()
  return ports.map((port, index) => {
    const portNumber = Number(port?.port_number)
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > MAX_SWITCH_PORTS) throw new Error(`Switch port ${index + 1} must use a Port Number from 1 through ${MAX_SWITCH_PORTS}`)
    if (seen.has(portNumber)) throw new Error(`Switch Port Number ${portNumber} is duplicated`)
    seen.add(portNumber)
    return { ...port, id: port.id || Date.now() + index, device_id: deviceId, port_number: portNumber }
  })
}

const seedBranches = [
  { id: 1, name: 'Central Berlin', code: 'BER-01', warehouse_code: 'WH-BER-01', manager_name: 'Sarah Klein', manager_tell: '+49 30 555 0101', deputy_name: 'Martin Vogel', deputy_tell: '+49 30 555 0102', link1: 'MPLS Primary', ip_link1: '10.10.1.1', link2: 'LTE Backup', ip_link2: '10.10.1.2' },
  { id: 2, name: 'Alexanderplatz', code: 'BER-02', warehouse_code: 'WH-BER-02', manager_name: 'Daniel Weber', manager_tell: '+49 30 555 0201', deputy_name: 'Emma Roth', deputy_tell: '+49 30 555 0202', link1: 'Fiber Primary', ip_link1: '10.20.1.1' },
  { id: 3, name: 'Potsdam', code: 'POT-01', warehouse_code: 'WH-POT-01', manager_name: 'Lena Fischer', manager_tell: '+49 331 555 0301', deputy_name: 'Noah Wolf', deputy_tell: '+49 331 555 0302', link1: 'MPLS Primary', ip_link1: '10.30.1.1' },
  { id: 4, name: 'Spandau', code: 'BER-03', warehouse_code: 'WH-BER-03', manager_name: 'Mia Wagner', manager_tell: '+49 30 555 0401', deputy_name: 'Leon Braun', deputy_tell: '+49 30 555 0402', link1: 'Fiber Primary', ip_link1: '10.40.1.1' }
]

const seedDevices = seedBranches.flatMap((branch, branchIndex) => {
  const templates = [
    { device_type: 'Router', name: `${branch.code} Gateway`, model: 'MikroTik CCR2004', location: 'Network room', connection_type: 'Winbox' },
    { device_type: 'iLO', name: 'iLO', model: 'HPE iLO 5', location: 'Server room', protocol: 'https' },
    { device_type: 'Server', name: 'Server - SQL', model: 'HPE ProLiant DL360', location: 'Server room', hostname: `${branch.code}-SQL`, port: 3389 },
    { device_type: 'Server', name: 'Server - IIS', model: 'HPE ProLiant DL360', location: 'Server room', hostname: `${branch.code}-IIS`, port: 3389 },
    ...Array.from({ length: 4 }, (_, index) => ({
      device_type: 'Checkout',
      name: `Checkout ${index + 1}`,
      model: 'HP Engage',
      location: `Checkout lane ${index + 1}`,
      hostname: `${branch.code}-CO-${index + 1}`,
      checkout_number: index + 1,
      port: 3389
    })),
    { device_type: 'Switch', name: 'Core Switch', model: 'Cisco CBS350', location: 'Network room', connection_type: 'Fiber', transport: 'ssh' },
    { device_type: 'Switch', name: 'Access Switch', model: 'Cisco CBS250', location: 'Sales floor', connection_type: 'Copper', transport: 'telnet' },
    { device_type: 'NVR', name: 'Security NVR', model: 'Hikvision DS-7616', location: 'Security rack' },
    { device_type: 'AccessPoint', name: 'Sales Floor AP', model: 'Aruba AP-515', location: 'Sales floor' },
    { device_type: 'POS', name: 'Payment terminal', model: 'Verifone', location: 'Checkout area', protocol: 'https', port: 443 }
  ]

  return templates.map((template, index) => ({
    id: branchIndex * 100 + index + 1,
    branch_id: branch.id,
    ip: `10.${(branchIndex + 1) * 10}.${index + 1}.${index + 10}`,
    asset_code: `HF-${branch.code}-${String(index + 1).padStart(3, '0')}`,
    is_dashboard_visible: index < 8 ? 1 : 0,
    created_at: new Date().toISOString(),
    ...template
  }))
})

/** Accepts the legacy `{ [deviceType]: [ids] }` shape and the unified one. */
function normalizeMappings(value) {
  if (!value || typeof value !== 'object') return { types: {}, devices: {} }
  if ('types' in value || 'devices' in value) {
    return { types: { ...(value.types || {}) }, devices: { ...(value.devices || {}) } }
  }
  return { types: { ...value }, devices: {} }
}

function initialState() {
  return {
    branches: seedBranches,
    devices: seedDevices,
    credentials: [],
    mappings: { types: {}, devices: {} },
    settings: { ...DEFAULT_SETTINGS },
    notes: [
      { id: 1, name: 'Branch rollout checklist', body: '1. Rack and label the switch\n2. Uplink to the router on Gi1/0/24\n3. Register the asset code in Inventory\n4. Verify ping from the dashboard', pinned: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 2, name: 'VLAN plan', body: 'VLAN 10 - Staff\nVLAN 20 - POS\nVLAN 30 - Cameras\nVLAN 99 - Management', pinned: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ],
    snippets: [
      { id: 1, name: 'Show interfaces', command: 'show interfaces status', description: 'Port status overview' },
      { id: 2, name: 'Show VLANs', command: 'show vlan brief', description: 'Configured VLANs and member ports' },
      { id: 3, name: 'Show MAC table', command: 'show mac address-table', description: 'Learned MAC addresses' },
      { id: 4, name: 'Show running config', command: 'show running-config', description: 'Active configuration' },
      { id: 5, name: 'Save config', command: 'write memory', description: 'Persist the running configuration' }
    ],
    audit: [{ id: 1, user: 'Admin', action: 'DEMO_STARTED', target: 'Browser preview', timestamp: new Date().toISOString() }]
  }
}

function normalizeBrowserState(value) {
  const baseline = initialState()
  const merged = { ...baseline, ...value, settings: { ...DEFAULT_SETTINGS, ...value?.settings } }
  const warehouseCodes = new Set()
  merged.branches = (Array.isArray(merged.branches) ? merged.branches : baseline.branches).map((branch, index) => {
    let warehouseCode = String(branch.warehouse_code || '').trim()
    if (!warehouseCode) warehouseCode = `LEGACY-${String(branch.code || branch.id || index + 1).trim()}`
    const base = warehouseCode
    let suffix = 2
    while (warehouseCodes.has(warehouseCode.toLowerCase())) warehouseCode = `${base}-${suffix++}`
    warehouseCodes.add(warehouseCode.toLowerCase())
    return { ...branch, warehouse_code: warehouseCode }
  })
  merged.devices = (Array.isArray(merged.devices) ? merged.devices : baseline.devices).map((device) => ({
    ...device,
    name: String(device.name || '').trim() || `${device.device_type || 'Device'} ${device.id}`
  }))
  return merged
}

function readState() {
  if (typeof window === 'undefined') return initialState()
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY))
    return value ? normalizeBrowserState(value) : initialState()
  } catch {
    return initialState()
  }
}

function writeState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent('hyperfamily:data-changed'))
}

function withState(mutator) {
  const state = readState()
  const result = mutator(state)
  writeState(state)
  return result
}

async function hashBrowserPassword(password) {
  return bcrypt.hash(String(password || ''), 10)
}

async function readBrowserAccount() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORE_KEY))
    if (stored?.username && stored?.passwordHash) return stored
  } catch {}
  const account = { username: 'Admin', passwordHash: await hashBrowserPassword('Admin') }
  writeBrowserAccount(account)
  return account
}

function writeBrowserAccount(account) {
  localStorage.setItem(AUTH_STORE_KEY, JSON.stringify(account))
}

async function updateBrowserCredentials(payload = {}) {
  const account = await readBrowserAccount()
  const currentPasswordMatches = await bcrypt.compare(String(payload.currentPassword || ''), account.passwordHash)
  if (!currentPasswordMatches) throw new Error('Current password is incorrect')

  const newUsername = String(payload.newUsername || '').trim()
  const newPassword = String(payload.newPassword || '')
  if (newUsername.length < 3 || newUsername.length > 64) throw new Error('Username must contain between 3 and 64 characters')
  if (newPassword && newPassword.length < 4) throw new Error('New password must contain at least 4 characters')

  const updated = {
    username: newUsername,
    passwordHash: newPassword ? await hashBrowserPassword(newPassword) : account.passwordHash
  }
  writeBrowserAccount(updated)
  withState((state) => state.audit.unshift({ id: Date.now(), user: updated.username, action: 'ACCOUNT_UPDATE', target: 'Browser preview', timestamp: new Date().toISOString() }))
  return { id: 1, username: updated.username }
}

function buildSnapshot() {
  const state = readState()
  const now = Date.now()
  const devices = state.devices.map((device) => {
    const cycle = Math.abs(Math.sin((now / 6000 + device.id) * 0.83))
    const isOffline = device.id % 11 === Math.floor(now / 12000) % 11
    const isSlow = !isOffline && device.id % 9 === Math.floor(now / 9000) % 9
    const ping_time = isOffline ? null : isSlow ? Math.round(320 + cycle * 120) : Math.max(2, Math.round(12 + cycle * 115))
    const status = statusFromPing(ping_time, !isOffline)
    const historyCount = Number(state.settings.ping_history_count) || 30
    const history = Array.from({ length: historyCount }, (_, i) => {
      const offline = i % 17 === device.id % 17
      const warning = !offline && i % 13 === device.id % 13
      const value = warning ? Math.round(315 + Math.abs(Math.sin(i * 0.31 + device.id)) * 95) : Math.round(15 + Math.abs(Math.sin(i * 0.37 + device.id)) * 85)
      return {
        sequence: i + 1,
        ping_time: offline ? null : value,
        status: offline ? 'offline' : statusFromPing(value),
        timestamp: new Date(now - (historyCount - i - 1) * Number(state.settings.ping_interval || 3) * 1000).toISOString()
      }
    })
    return { ...device, ping_time, status, history }
  })
  return { branches: state.branches, devices, generated_at: new Date().toISOString() }
}

/**
 * Browser-preview terminal. The desktop build talks to a real SSH/Telnet
 * session; here a small emulated switch CLI keeps the screen usable for demos.
 */
function demoTerminal() {
  const listeners = { data: new Set(), status: new Set() }
  const sessions = new Map()
  let counter = 0

  const emit = (kind, payload) => listeners[kind].forEach((callback) => callback(payload))
  const push = (sessionId, text) => emit('data', { sessionId, data: text })

  const respond = (session, command) => {
    const trimmed = command.trim()
    if (!trimmed) return ''
    if (/^(exit|quit|logout)$/i.test(trimmed)) {
      setTimeout(() => { sessions.delete(session.sessionId); emit('status', { sessionId: session.sessionId, state: 'closed', message: 'Session closed' }) }, 120)
      return 'Connection closed by foreign host.\r\n'
    }
    if (/^show\s+interfaces?\s+status/i.test(trimmed)) {
      return ['Port      Name        Status       Vlan   Duplex  Speed Type',
        'Gi1/0/1   Staff       connected    10     a-full a-1000 10/100/1000BaseTX',
        'Gi1/0/2   POS         connected    20     a-full  a-100 10/100/1000BaseTX',
        'Gi1/0/3   Cameras     connected    30     a-full a-1000 10/100/1000BaseTX',
        'Gi1/0/24  Uplink      connected    trunk  a-full a-1000 10/100/1000BaseTX', ''].join('\r\n')
    }
    if (/^show\s+vlan/i.test(trimmed)) {
      return ['VLAN Name          Status    Ports',
        '---- ------------- --------- -------------------------------',
        '10   Staff         active    Gi1/0/1, Gi1/0/4',
        '20   POS           active    Gi1/0/2, Gi1/0/5',
        '30   Cameras       active    Gi1/0/3',
        '99   Management    active    Vl99', ''].join('\r\n')
    }
    if (/^show\s+mac/i.test(trimmed)) {
      return ['          Mac Address Table',
        'Vlan    Mac Address       Type        Ports',
        '  10    0011.2233.4455    DYNAMIC     Gi1/0/1',
        '  20    00aa.bbcc.ddee    DYNAMIC     Gi1/0/2',
        '  30    5c02.1234.9900    DYNAMIC     Gi1/0/3', ''].join('\r\n')
    }
    if (/^show\s+running-config/i.test(trimmed)) {
      return ['Building configuration...', '', `hostname ${session.name.replace(/\s+/g, '-')}`,
        '!', 'vlan 10', ' name Staff', '!', 'vlan 20', ' name POS', '!',
        'interface GigabitEthernet1/0/24', ' switchport mode trunk', '!', 'end', ''].join('\r\n')
    }
    if (/^show\s+version/i.test(trimmed)) {
      return `Cisco IOS Software, C2960X Software, Version 15.2(7)E3\r\n${session.name} uptime is 41 days, 6 hours, 12 minutes\r\n`
    }
    if (/^(write|copy\s+run)/i.test(trimmed)) return 'Building configuration...\r\n[OK]\r\n'
    if (/^(en|enable)$/i.test(trimmed)) return ''
    if (/^\?$|^help$/i.test(trimmed)) return 'Demo commands: show interfaces status, show vlan brief, show mac address-table, show running-config, show version, write memory, exit\r\n'
    return `% Invalid input detected. This is the browser preview \u2014 install the desktop app for a real session.\r\n`
  }

  return {
    targets: async () => {
      const state = readState()
      return state.branches.map((branch) => ({
        id: branch.id, name: branch.name, code: branch.code,
        switches: state.devices.filter((device) => device.branch_id === branch.id && device.device_type === 'Switch')
          .map((device) => ({ id: device.id, name: device.name, ip: device.ip, model: device.model, location: device.location, transport: device.transport === 'telnet' ? 'telnet' : 'ssh' }))
      })).filter((branch) => branch.switches.length)
    },
    open: async ({ deviceId }) => {
      const state = readState()
      const device = state.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('Device not found')
      counter += 1
      const transport = device.transport === 'telnet' ? 'telnet' : 'ssh'
      const session = {
        sessionId: `demo-${counter}`, name: device.name, host: device.ip,
        port: transport === 'telnet' ? 23 : 22, transport, username: 'demo', line: ''
      }
      sessions.set(session.sessionId, session)
      const prompt = `${device.name.replace(/\s+/g, '-')}# `
      session.prompt = prompt
      setTimeout(() => emit('status', { sessionId: session.sessionId, state: 'connecting' }), 30)
      setTimeout(() => {
        emit('status', { sessionId: session.sessionId, state: 'connected' })
        push(session.sessionId, `Connecting to ${device.ip} over ${transport.toUpperCase()}...\r\n`)
        push(session.sessionId, 'Browser preview \u2014 emulated switch CLI. Type ? for the command list.\r\n\r\n')
        push(session.sessionId, prompt)
      }, 420)
      return { sessionId: session.sessionId, transport, host: device.ip, port: session.port, name: device.name, username: 'demo' }
    },
    write: async ({ sessionId, data }) => {
      const session = sessions.get(sessionId)
      if (!session) throw new Error('That terminal session is no longer open')
      for (const character of data) {
        if (character === '\r' || character === '\n') {
          push(sessionId, '\r\n')
          const output = respond(session, session.line)
          session.line = ''
          if (output) push(sessionId, output)
          if (sessions.has(sessionId)) push(sessionId, session.prompt)
        } else if (character === '\u007f' || character === '\b') {
          if (session.line.length) { session.line = session.line.slice(0, -1); push(sessionId, '\b \b') }
        } else if (character >= ' ') {
          session.line += character
          push(sessionId, character)
        }
      }
      return true
    },
    resize: async () => true,
    close: async (sessionId) => {
      sessions.delete(sessionId)
      emit('status', { sessionId, state: 'closed', message: 'Closed by the operator' })
      return true
    },
    onData: (callback) => { listeners.data.add(callback); return () => listeners.data.delete(callback) },
    onStatus: (callback) => { listeners.status.add(callback); return () => listeners.status.delete(callback) }
  }
}

function browserApi() {
  return {
    platform: 'browser-demo',
    auth: {
      status: async () => ({ authenticated: true }),
      login: async ({ username, password }) => {
        const account = await readBrowserAccount()
        const passwordMatches = await bcrypt.compare(String(password || ''), account.passwordHash)
        if (String(username || '').trim().toLowerCase() !== account.username.toLowerCase() || !passwordMatches) throw new Error('Invalid username or password')
        withState((state) => state.audit.unshift({ id: Date.now(), user: account.username, action: 'LOGIN', target: 'Browser preview', timestamp: new Date().toISOString() }))
        return { id: 1, username: account.username }
      },
      updateCredentials: updateBrowserCredentials,
      changePassword: async (payload) => {
        const account = await readBrowserAccount()
        await updateBrowserCredentials({ ...payload, newUsername: account.username })
        return { success: true }
      },
      logout: async () => ({ success: true })
    },
    branches: {
      list: async () => readState().branches,
      save: async (data) => withState((s) => {
        const code = String(data.code || '').trim()
        const warehouseCode = String(data.warehouse_code || '').trim()
        if (!String(data.name || '').trim() || !code || !warehouseCode) throw new Error('Branch Name, Code, and Warehouse Code are required')
        if (!/^[A-Za-z0-9_-]+$/.test(code) || code.length > 20) throw new Error('Branch Code must use no more than 20 letters, numbers, dashes, or underscores')
        if (!/^[A-Za-z0-9_-]+$/.test(warehouseCode) || warehouseCode.length > 40) throw new Error('Warehouse Code must use no more than 40 letters, numbers, dashes, or underscores')
        const duplicate = s.branches.find((item) => item.id !== Number(data.id) && (item.code?.toLowerCase() === code.toLowerCase() || item.warehouse_code?.toLowerCase() === warehouseCode.toLowerCase()))
        if (duplicate) throw new Error('That Branch Code or Warehouse Code already exists')
        const cleanData = { ...data, name: String(data.name).trim(), code, warehouse_code: warehouseCode }
        const normalized = data.id
          ? { ...s.branches.find((item) => item.id === Number(data.id)), ...cleanData, id: Number(data.id) }
          : { ...cleanData, id: Math.max(0, ...s.branches.map((item) => item.id)) + 1, created_at: new Date().toISOString() }
        if (data.id) s.branches = s.branches.map((item) => item.id === normalized.id ? normalized : item)
        else s.branches.push(normalized)
        return normalized
      }),
      remove: async (id) => withState((s) => { s.branches = s.branches.filter((x) => x.id !== id); s.devices = s.devices.filter((x) => x.branch_id !== id); return { success: true } })
    },
    devices: {
      list: async () => readState().devices.map((device) => ({ ...device, switch_ports: device.switch_ports || [] })),
      save: async (data) => withState((s) => {
        if (!String(data.name || '').trim()) throw new Error('Device Name is required')
        if (data.device_type === 'Router' && s.devices.some((item) => item.branch_id === Number(data.branch_id) && item.device_type === 'Router' && item.id !== Number(data.id))) throw new Error('Only one Router can be defined for each branch')
        const deviceId = data.id ? Number(data.id) : Math.max(0, ...s.devices.map((item) => item.id)) + 1
        const switchPorts = data.device_type === 'Switch' ? normalizeSwitchPorts(data.switch_ports || [], deviceId) : []
        const normalized = {
          ...data,
          id: deviceId,
          branch_id: Number(data.branch_id),
          port: data.port ? Number(data.port) : null,
          checkout_number: data.checkout_number ? Number(data.checkout_number) : null,
          connection_port: String(data.connection_port || '').trim() || null,
          switch_ports: switchPorts,
          is_dashboard_visible: data.is_dashboard_visible ? 1 : 0
        }
        if (data.id) s.devices = s.devices.map((item) => item.id === deviceId ? { ...item, ...normalized, updated_at: new Date().toISOString() } : item)
        else s.devices.push({ ...normalized, created_at: new Date().toISOString() })
        return normalized
      }),
      remove: async (id) => withState((s) => { s.devices = s.devices.filter((x) => x.id !== id); return { success: true } })
    },
    monitor: {
      snapshot: async () => buildSnapshot(),
      subscribe: (callback) => {
        const timer = setInterval(() => callback(buildSnapshot()), 3000)
        return () => clearInterval(timer)
      }
    },
    settings: {
      get: async () => readState().settings,
      save: async (patch) => withState((s) => { s.settings = { ...s.settings, ...patch }; return s.settings })
    },
    credentials: {
      list: async () => readState().credentials.map((x) => ({ ...x, password: undefined, has_password: true })),
      reveal: async (id) => readState().credentials.find((x) => x.id === id)?.password || '',
      save: async (data) => withState((s) => { s.credentials.push({ ...data, id: Date.now() }); return data }),
      remove: async (id) => withState((s) => { s.credentials = s.credentials.filter((x) => x.id !== id); return { success: true } }),
      mappings: async () => normalizeMappings(readState().mappings),
      map: async () => normalizeMappings(readState().mappings),
      forDevice: async (deviceId) => {
        const s = readState()
        const map = normalizeMappings(s.mappings)
        const device = s.devices.find((item) => item.id === deviceId)
        const ids = [...(map.devices[deviceId] || []), ...(device ? map.types[device.device_type] || [] : [])]
        const seen = new Set()
        return ids
          .filter((id) => !seen.has(id) && seen.add(id))
          .map((id) => s.credentials.find((item) => item.id === id))
          .filter(Boolean)
          .map((item) => ({ ...item, password: undefined, has_password: true }))
      },
      saveMappings: async (mappings) => withState((s) => { s.mappings = normalizeMappings(mappings); return s.mappings })
    },
    inventory: {
      list: async () => {
        const s = readState()
        return buildSnapshot().devices.map((device) => {
          const branch = s.branches.find((item) => item.id === device.branch_id)
          return { ...device, branch_name: branch?.name || '—', branch_code: branch?.code || '—', branch_warehouse_code: branch?.warehouse_code || '—' }
        })
      },
      export: async () => { throw new Error('Excel export is available in the Windows desktop app') }
    },
    remote: {
      connect: async () => { throw new Error('Remote tools can only launch from the Windows desktop app') },
      probe: async () => ({ teamviewer: null, winbox: null }),
      palette: async () => true
    },
    terminal: demoTerminal(),
    snippets: {
      list: async () => [...readState().snippets].sort((a, b) => a.name.localeCompare(b.name)),
      save: async (payload) => {
        const state = readState()
        if (!payload?.name?.trim()) throw new Error('A snippet needs a name')
        if (!payload?.command?.trim()) throw new Error('A snippet needs a command')
        const record = { ...payload, name: payload.name.trim(), command: payload.command.trim() }
        if (payload.id) state.snippets = state.snippets.map((item) => (item.id === payload.id ? { ...item, ...record } : item))
        else state.snippets.push({ ...record, id: Date.now() })
        writeState(state)
        return record
      },
      remove: async (id) => {
        const state = readState()
        state.snippets = state.snippets.filter((item) => item.id !== id)
        writeState(state)
        return true
      }
    },
    notes: {
      list: async () => [...readState().notes].sort((a, b) => (b.pinned - a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at))),
      save: async (payload) => {
        const state = readState()
        if (!payload?.name?.trim()) throw new Error('A note needs a name')
        const now = new Date().toISOString()
        const record = { name: payload.name.trim(), body: payload.body || '', pinned: payload.pinned ? 1 : 0, updated_at: now }
        if (payload.id) {
          state.notes = state.notes.map((item) => (item.id === payload.id ? { ...item, ...record } : item))
          writeState(state)
          return state.notes.find((item) => item.id === payload.id)
        }
        const created = { ...record, id: Date.now(), created_at: now }
        state.notes.push(created)
        writeState(state)
        return created
      },
      remove: async (id) => {
        const state = readState()
        state.notes = state.notes.filter((item) => item.id !== id)
        writeState(state)
        return true
      }
    },
    vpn: {
      status: async () => ({ state: 'disconnected', mode: null, proxyPort: null, forticlientInstalled: false }),
      probe: async () => ({ installed: false, path: null, downloadUrl: 'https://www.fortinet.com/support/product-downloads#vpn', configured: false }),
      connect: async () => { throw new Error('VPN control is available in the Windows desktop app') },
      disconnect: async () => ({ state: 'disconnected' }),
      subscribe: () => () => {}
    },
    update: {
      check: async () => ({ currentVersion: '2.0.1', latestVersion: '2.0.1', hasUpdate: false }),
      download: async () => ({ success: true }),
      install: async () => ({ success: true }),
      subscribe: () => () => {}
    },
    audit: { list: async () => readState().audit.slice(0, 100) },
    dialog: { selectFile: async () => null },
    app: { info: async () => ({ version: '2.0.1', platform: 'Browser preview', dataPath: 'Local browser storage' }), openExternal: async (url) => window.open(url, '_blank', 'noopener,noreferrer') }
  }
}

let fallback
export function getApi() {
  if (typeof window !== 'undefined' && window.hyperfamily) return window.hyperfamily
  if (!fallback && typeof window !== 'undefined') fallback = browserApi()
  return fallback
}
