'use client'

import { DEFAULT_SETTINGS } from '@/lib/constants'
import { statusFromPing } from '@/lib/utils'

const STORE_KEY = 'hyperfamily.browser.demo.v1'

const seedBranches = [
  { id: 1, name: 'Central Berlin', code: 'BER-01', manager_name: 'Sarah Klein', manager_tell: '+49 30 555 0101', deputy_name: 'Martin Vogel', deputy_tell: '+49 30 555 0102', link1: 'MPLS Primary', ip_link1: '10.10.1.1', link2: 'LTE Backup', ip_link2: '10.10.1.2' },
  { id: 2, name: 'Alexanderplatz', code: 'BER-02', manager_name: 'Daniel Weber', manager_tell: '+49 30 555 0201', deputy_name: 'Emma Roth', deputy_tell: '+49 30 555 0202', link1: 'Fiber Primary', ip_link1: '10.20.1.1' },
  { id: 3, name: 'Potsdam', code: 'POT-01', manager_name: 'Lena Fischer', manager_tell: '+49 331 555 0301', deputy_name: 'Noah Wolf', deputy_tell: '+49 331 555 0302', link1: 'MPLS Primary', ip_link1: '10.30.1.1' },
  { id: 4, name: 'Spandau', code: 'BER-03', manager_name: 'Mia Wagner', manager_tell: '+49 30 555 0401', deputy_name: 'Leon Braun', deputy_tell: '+49 30 555 0402', link1: 'Fiber Primary', ip_link1: '10.40.1.1' }
]

const types = ['Router', 'Switch', 'Server', 'NVR', 'AccessPoint', 'Checkout', 'POS']
const seedDevices = seedBranches.flatMap((branch, branchIndex) =>
  types.map((deviceType, index) => ({
    id: branchIndex * 10 + index + 1,
    branch_id: branch.id,
    device_type: deviceType,
    name: deviceType === 'Router' ? `${branch.code} Gateway` : `${deviceType} ${index + 1}`,
    ip: `10.${(branchIndex + 1) * 10}.${index + 1}.${index + 10}`,
    port: ['Server', 'Checkout'].includes(deviceType) ? 3389 : deviceType === 'POS' ? 443 : null,
    model: ['CCR2004', 'CBS350', 'ProLiant DL360', 'DS-7616', 'AP-515', 'HP Engage', 'Verifone'][index],
    location: index < 2 ? 'Network room' : `Zone ${index}`,
    asset_code: `HF-${branch.code}-${String(index + 1).padStart(3, '0')}`,
    hostname: ['Server', 'Checkout'].includes(deviceType) ? `${branch.code}-${deviceType.toUpperCase()}-${index + 1}` : '',
    is_dashboard_visible: index < 5 ? 1 : 0,
    created_at: new Date().toISOString()
  }))
)

function initialState() {
  return {
    branches: seedBranches,
    devices: seedDevices,
    credentials: [],
    mappings: {},
    settings: { ...DEFAULT_SETTINGS },
    audit: [{ id: 1, user: 'Admin', action: 'DEMO_STARTED', target: 'Browser preview', timestamp: new Date().toISOString() }]
  }
}

function readState() {
  if (typeof window === 'undefined') return initialState()
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY))
    return value ? { ...initialState(), ...value, settings: { ...DEFAULT_SETTINGS, ...value.settings } } : initialState()
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

function buildSnapshot() {
  const state = readState()
  const now = Date.now()
  const devices = state.devices.map((device) => {
    const cycle = Math.abs(Math.sin((now / 6000 + device.id) * 0.83))
    const isOffline = device.id % 11 === Math.floor(now / 12000) % 11
    const ping_time = isOffline ? null : Math.max(2, Math.round(12 + cycle * 115))
    const status = statusFromPing(ping_time, !isOffline)
    const history = Array.from({ length: Number(state.settings.ping_history_count) || 30 }, (_, i) => {
      const value = Math.round(15 + Math.abs(Math.sin(i * 0.37 + device.id)) * 85)
      return { sequence: i + 1, ping_time: i % 17 === device.id % 17 ? null : value, status: i % 17 === device.id % 17 ? 'offline' : statusFromPing(value) }
    })
    return { ...device, ping_time, status, history }
  })
  return { branches: state.branches, devices, generated_at: new Date().toISOString() }
}

function browserApi() {
  return {
    platform: 'browser-demo',
    auth: {
      status: async () => ({ authenticated: true }),
      login: async ({ username, password }) => {
        if (username.toLowerCase() !== 'admin' || password !== 'Admin') throw new Error('Invalid username or password')
        withState((s) => s.audit.unshift({ id: Date.now(), user: 'Admin', action: 'LOGIN', target: 'Browser preview', timestamp: new Date().toISOString() }))
        return { id: 1, username: 'Admin' }
      },
      changePassword: async () => ({ success: true }),
      logout: async () => ({ success: true })
    },
    branches: {
      list: async () => readState().branches,
      save: async (data) => withState((s) => {
        if (data.id) s.branches = s.branches.map((item) => item.id === data.id ? { ...item, ...data } : item)
        else s.branches.push({ ...data, id: Math.max(0, ...s.branches.map((x) => x.id)) + 1, created_at: new Date().toISOString() })
        return data
      }),
      remove: async (id) => withState((s) => { s.branches = s.branches.filter((x) => x.id !== id); s.devices = s.devices.filter((x) => x.branch_id !== id); return { success: true } })
    },
    devices: {
      list: async () => readState().devices,
      save: async (data) => withState((s) => {
        const normalized = { ...data, branch_id: Number(data.branch_id), port: data.port ? Number(data.port) : null, is_dashboard_visible: data.is_dashboard_visible ? 1 : 0 }
        if (data.id) s.devices = s.devices.map((item) => item.id === data.id ? { ...item, ...normalized } : item)
        else s.devices.push({ ...normalized, id: Math.max(0, ...s.devices.map((x) => x.id)) + 1, created_at: new Date().toISOString() })
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
      mappings: async () => readState().mappings,
      saveMappings: async (mappings) => withState((s) => { s.mappings = mappings; return mappings })
    },
    inventory: {
      list: async () => {
        const s = readState()
        return buildSnapshot().devices.map((d) => ({ ...d, branch_name: s.branches.find((b) => b.id === d.branch_id)?.name || '—' }))
      },
      export: async () => { throw new Error('Excel export is available in the Windows desktop app') }
    },
    remote: { connect: async () => { throw new Error('Remote tools can only launch from the Windows desktop app') } },
    vpn: {
      status: async () => ({ state: 'disconnected', mode: null }),
      connect: async () => { throw new Error('VPN control is available in the Windows desktop app') },
      disconnect: async () => ({ state: 'disconnected' }),
      subscribe: () => () => {}
    },
    update: {
      check: async () => ({ currentVersion: '1.0.0', latestVersion: '1.0.0', hasUpdate: false }),
      download: async () => ({ success: true }),
      install: async () => ({ success: true }),
      subscribe: () => () => {}
    },
    audit: { list: async () => readState().audit.slice(0, 100) },
    dialog: { selectFile: async () => null },
    app: { info: async () => ({ version: '1.0.0', platform: 'Browser preview', dataPath: 'Local browser storage' }), openExternal: async (url) => window.open(url, '_blank', 'noopener,noreferrer') }
  }
}

let fallback
export function getApi() {
  if (typeof window !== 'undefined' && window.hyperfamily) return window.hyperfamily
  if (!fallback && typeof window !== 'undefined') fallback = browserApi()
  return fallback
}
