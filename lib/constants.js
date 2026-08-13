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

export const DEVICE_TYPE_DETAILS = {
  Router: { label: 'Router', description: 'Gateway model, management IP, port, and asset code' },
  Switch: { label: 'Switch', description: 'Switch identity, connection details, and managed ports' },
  iLO: { label: 'iLO', description: 'Server management interface and ESXi information' },
  Server: { label: 'Server', description: 'Server hostname, IP address, and display name' },
  NVR: { label: 'NVR', description: 'Network video recorder identity and asset details' },
  AccessPoint: { label: 'Access Point', description: 'Wireless access point model, placement, and port' },
  Scale: { label: 'Scale', description: 'Scale model, location, serial number, and asset code' },
  Client: { label: 'Client', description: 'Workstation hostname, user, IP, and domain' },
  Checkout: { label: 'Checkout', description: 'Checkout number, hostname, and IP address' },
  POS: { label: 'POS', description: 'Payment terminal, software, acceptance, and asset details' }
}

export const THEMES = [
  {
    id: 'aurora',
    name: 'Aurora Light',
    mode: 'light',
    description: 'Warm Nord Aurora accents over Snow Storm surfaces',
    colors: ['#BF616A', '#D08770', '#EBCB8B', '#ECEFF4']
  },
  {
    id: 'frost',
    name: 'Frost Light',
    mode: 'light',
    description: 'Cool Nord cyan and blue accents',
    colors: ['#8FBCBB', '#88C0D0', '#81A1C1', '#ECEFF4']
  },
  {
    id: 'snow',
    name: 'Snow Light',
    mode: 'light',
    description: 'Clean Snow Storm neutrals with a Polar Night accent',
    colors: ['#ECEFF4', '#E5E9F0', '#D8DEE9', '#4C566A']
  },
  {
    id: 'tundra',
    name: 'Tundra Light',
    mode: 'light',
    description: 'Nord green and purple accents on calm light surfaces',
    colors: ['#A3BE8C', '#B48EAD', '#D8DEE9', '#ECEFF4']
  },
  {
    id: 'polar',
    name: 'Polar Night',
    mode: 'dark',
    description: 'Classic Nord dark workspace with Frost highlights',
    colors: ['#2E3440', '#3B4252', '#434C5E', '#88C0D0']
  },
  {
    id: 'arctic-night',
    name: 'Arctic Night',
    mode: 'dark',
    description: 'Deep Polar Night surfaces with strong blue Frost accents',
    colors: ['#2E3440', '#434C5E', '#5E81AC', '#81A1C1']
  },
  {
    id: 'fjord-night',
    name: 'Fjord Night',
    mode: 'dark',
    description: 'Teal Nord Frost accents for network operations',
    colors: ['#3B4252', '#4C566A', '#8FBCBB', '#88C0D0']
  },
  {
    id: 'aurora-night',
    name: 'Aurora Night',
    mode: 'dark',
    description: 'Dark Nord surfaces with purple and red Aurora accents',
    colors: ['#2E3440', '#3B4252', '#B48EAD', '#BF616A']
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
  dashboard_branch_mode: 'compact_over_four',
  dashboard_branch_details_view: 'modal',
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
