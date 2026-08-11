export const APP_NAME = 'HyperFamily Branch Monitor'
export const APP_VERSION = '1.0.0'

export const DEVICE_TYPES = [
  'Router',
  'Switch',
  'iLO',
  'Server',
  'NVR',
  'AccessPoint',
  'Scale',
  'Client',
  'Checkout',
  'POS'
]

export const DEVICE_FIELDS = {
  Switch: ['connection_type', 'connection_port'],
  iLO: ['esxi_version'],
  Server: ['hostname', 'user', 'domain'],
  Client: ['hostname', 'user', 'domain'],
  Checkout: ['checkout_number', 'hostname', 'user', 'domain'],
  POS: ['checkout_number', 'brand', 'version', 'terminal_id', 'acceptance_id']
}

export const THEMES = [
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Warm red and orange tones',
    colors: ['#BF616A', '#D08770', '#EBCB8B', '#ECEFF4']
  },
  {
    id: 'frost',
    name: 'Frost',
    description: 'Cool cyan and blue tones',
    colors: ['#8FBCBB', '#88C0D0', '#81A1C1', '#ECEFF4']
  },
  {
    id: 'snow',
    name: 'Snow',
    description: 'Light and clean neutral theme',
    colors: ['#ECEFF4', '#E5E9F0', '#D8DEE9', '#FFFFFF']
  },
  {
    id: 'polar',
    name: 'Polar Night',
    description: 'Dark and professional theme',
    colors: ['#2E3440', '#3B4252', '#434C5E', '#4C566A']
  }
]

export const STATUS = {
  online: { label: 'Online', color: '#A3BE8C' },
  warning: { label: 'Warning', color: '#EBCB8B' },
  offline: { label: 'Offline', color: '#BF616A' },
  unknown: { label: 'Unknown', color: '#4C566A' }
}

export const DEFAULT_SETTINGS = {
  theme: 'aurora',
  ping_interval: 3,
  ping_history_count: 30,
  teamviewer_path: 'C:\\Program Files\\TeamViewer\\TeamViewer.exe',
  teamviewer_password: '',
  winbox_path: 'C:\\Program Files\\Winbox\\winbox64.exe',
  winbox_port: 8291,
  vpn_gateway: '',
  vpn_port: 443,
  vpn_user: '',
  vpn_pass: '',
  openvpn_path: 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
  openvpn_config: ''
}
