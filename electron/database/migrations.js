const DEVICE_COLUMNS = [
  'branch_id', 'device_type', 'model', 'name', 'location', 'ip', 'port', 'asset_code',
  'connection_type', 'connection_port', 'hostname', 'user', 'domain', 'esxi_version',
  'version', 'terminal_id', 'acceptance_id', 'brand', 'checkout_number',
  'remote_id', 'protocol', 'is_dashboard_visible'
]

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)
}

function runMigrations(db, adminHash) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      link1 TEXT,
      ip_link1 TEXT,
      link2 TEXT,
      ip_link2 TEXT,
      manager_name TEXT,
      manager_tell TEXT,
      deputy_name TEXT,
      deputy_tell TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      device_type TEXT NOT NULL CHECK (device_type IN ('Router','Switch','iLO','Server','NVR','AccessPoint','Scale','Client','Checkout','POS')),
      model TEXT,
      name TEXT,
      location TEXT,
      ip TEXT NOT NULL,
      port INTEGER CHECK (port IS NULL OR (port BETWEEN 1 AND 65535)),
      asset_code TEXT,
      connection_type TEXT,
      connection_port INTEGER,
      hostname TEXT,
      user TEXT,
      domain TEXT,
      esxi_version TEXT,
      version TEXT,
      terminal_id TEXT,
      acceptance_id TEXT,
      brand TEXT,
      checkout_number INTEGER,
      remote_id TEXT,
      protocol TEXT DEFAULT 'https' CHECK (protocol IN ('http','https')),
      is_dashboard_visible INTEGER NOT NULL DEFAULT 0 CHECK (is_dashboard_visible IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_credentials (
      device_type TEXT NOT NULL,
      credential_id INTEGER NOT NULL,
      PRIMARY KEY (device_type, credential_id),
      FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ping_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      ping_time INTEGER,
      status TEXT NOT NULL CHECK (status IN ('online','warning','offline')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uptime_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      uptime_percent REAL NOT NULL DEFAULT 0,
      total_checks INTEGER NOT NULL DEFAULT 0,
      successful_checks INTEGER NOT NULL DEFAULT 0,
      date DATE NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      UNIQUE (device_id, date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_devices_branch ON devices(branch_id);
    CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type);
    CREATE INDEX IF NOT EXISTS idx_ping_device ON ping_history(device_id);
    CREATE INDEX IF NOT EXISTS idx_ping_timestamp ON ping_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_uptime_device ON uptime_logs(device_id);
    CREATE INDEX IF NOT EXISTS idx_uptime_date ON uptime_logs(date);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `)

  // Upgrade databases made by early development builds without these optional fields.
  if (!hasColumn(db, 'devices', 'remote_id')) db.exec('ALTER TABLE devices ADD COLUMN remote_id TEXT')
  if (!hasColumn(db, 'devices', 'protocol')) db.exec("ALTER TABLE devices ADD COLUMN protocol TEXT DEFAULT 'https'")

  db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)').run('Admin', adminHash)

  const defaults = {
    theme: 'aurora', ping_interval: 3, ping_history_count: 30,
    teamviewer_path: 'C:\\Program Files\\TeamViewer\\TeamViewer.exe', teamviewer_password: '',
    winbox_path: 'C:\\Program Files\\Winbox\\winbox64.exe', winbox_port: 8291,
    vpn_gateway: '', vpn_port: 443, vpn_user: '', vpn_pass: '',
    openvpn_path: 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe', openvpn_config: ''
  }
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  const transaction = db.transaction(() => Object.entries(defaults).forEach(([key, value]) => insertSetting.run(key, JSON.stringify(value))))
  transaction()
  db.pragma('user_version = 1')
}

module.exports = { runMigrations, DEVICE_COLUMNS }
