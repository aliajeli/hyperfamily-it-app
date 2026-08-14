export { THEMES, THEME_FAMILIES, findTheme, applyTheme } from './themes'

export const APP_NAME = 'HyperFamily Branch Monitor'
export const APP_VERSION = '2.0.5'

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
  teamviewer_lan_mode: true,
  vpn_realm: '',
  vpn_autoconnect: false,
  forticlient_path: 'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe',
  terminal_font_size: 14,
  terminal_ssh_port: 22,
  terminal_telnet_port: 23,
  webview_autologin: true
}
