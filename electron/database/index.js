const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3-multiple-ciphers')
const bcrypt = require('bcrypt')
const { runMigrations, DEVICE_COLUMNS } = require('./migrations')

const BRANCH_COLUMNS = ['name', 'code', 'link1', 'ip_link1', 'link2', 'ip_link2', 'manager_name', 'manager_tell', 'deputy_name', 'deputy_tell']
const SENSITIVE_SETTINGS = new Set(['teamviewer_password', 'vpn_pass'])

class AppDatabase {
  constructor(userDataPath, vault) {
    this.vault = vault
    this.filePath = path.join(userDataPath, 'hyperfamily-monitor.db')
    const legacyPlaintext = this.isPlaintextDatabase()
    const databaseKey = vault.getDatabaseKey()
    // Detect the SQLite header instead of relying on key-file presence. If a previous
    // migration failed after the key was created, the untouched plaintext file is retried.
    if (legacyPlaintext) this.encryptLegacyDatabase(databaseKey)
    this.db = new Database(this.filePath)
    this.db.pragma("cipher='sqlcipher'")
    this.db.pragma(`key="x'${databaseKey}'"`)
    // Force an early read so a moved/corrupt key fails at startup, not during a later operation.
    this.db.prepare('SELECT count(*) AS count FROM sqlite_master').get()
    runMigrations(this.db, bcrypt.hashSync('Admin', 10))
  }

  isPlaintextDatabase() {
    if (!fs.existsSync(this.filePath)) return false
    const handle = fs.openSync(this.filePath, 'r')
    try {
      const header = Buffer.alloc(16)
      const bytesRead = fs.readSync(handle, header, 0, header.length, 0)
      return bytesRead === header.length && header.equals(Buffer.from('SQLite format 3\0'))
    } finally { fs.closeSync(handle) }
  }

  nextPlaintextBackupPath() {
    const base = `${this.filePath}.plaintext-backup`
    if (!fs.existsSync(base)) return base
    let suffix = 1
    while (fs.existsSync(`${base}-${suffix}`)) suffix += 1
    return `${base}-${suffix}`
  }

  removeDatabaseFiles(basePath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${basePath}${suffix}`) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }

  encryptLegacyDatabase(databaseKey) {
    const temporary = `${this.filePath}.encrypted-migration`
    const backup = this.nextPlaintextBackupPath()
    let sourceMoved = false

    this.removeDatabaseFiles(temporary)
    try {
      const plain = new Database(this.filePath, { fileMustExist: true })
      try { plain.pragma('wal_checkpoint(TRUNCATE)') } finally { plain.close() }

      // Encrypt a copy in place. The source is left untouched until the copy has been
      // reopened with the new key and passed a complete SQLite integrity check.
      fs.copyFileSync(this.filePath, temporary, fs.constants.COPYFILE_EXCL)
      const migrating = new Database(temporary, { fileMustExist: true })
      try {
        migrating.pragma("cipher='sqlcipher'")
        migrating.pragma(`rekey="x'${databaseKey}'"`)
      } finally { migrating.close() }

      const encrypted = new Database(temporary, { readonly: true, fileMustExist: true })
      try {
        encrypted.pragma("cipher='sqlcipher'")
        encrypted.pragma(`key="x'${databaseKey}'"`)
        encrypted.prepare('SELECT count(*) AS count FROM sqlite_master').get()
        const integrity = encrypted.pragma('integrity_check', { simple: true })
        if (integrity !== 'ok') throw new Error(`Encrypted database integrity check failed: ${integrity}`)
      } finally { encrypted.close() }
      if (this.hasPlaintextHeader(temporary)) throw new Error('Encrypted migration output still has a plaintext SQLite header')

      for (const suffix of ['-wal', '-shm']) {
        try { fs.unlinkSync(`${this.filePath}${suffix}`) } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
      fs.renameSync(this.filePath, backup)
      sourceMoved = true
      try {
        fs.renameSync(temporary, this.filePath)
      } catch (error) {
        fs.renameSync(backup, this.filePath)
        sourceMoved = false
        throw error
      }
    } catch (error) {
      // A failed export or validation leaves the original plaintext database available.
      // Because startup checks its header, a later launch can retry even if the key exists.
      if (sourceMoved && !fs.existsSync(this.filePath) && fs.existsSync(backup)) fs.renameSync(backup, this.filePath)
      this.removeDatabaseFiles(temporary)
      throw new Error(`Could not safely encrypt the legacy database: ${error.message}`)
    }
  }

  hasPlaintextHeader(filePath) {
    const handle = fs.openSync(filePath, 'r')
    try {
      const header = Buffer.alloc(16)
      return fs.readSync(handle, header, 0, header.length, 0) === header.length && header.equals(Buffer.from('SQLite format 3\0'))
    } finally { fs.closeSync(handle) }
  }

  close() { if (this.db?.open) this.db.close() }

  authenticate(username, password) {
    const user = this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim())
    if (!user || !bcrypt.compareSync(String(password || ''), user.password)) return null
    this.audit(user.username, 'LOGIN', 'Application', 'Successful local login')
    return { id: user.id, username: user.username }
  }

  changePassword(username, currentPassword, newPassword) {
    if (String(newPassword || '').length < 4) throw new Error('New password must contain at least 4 characters')
    const user = this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)
    if (!user || !bcrypt.compareSync(String(currentPassword || ''), user.password)) throw new Error('Current password is incorrect')
    this.db.prepare("UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), user.id)
    this.audit(username, 'PASSWORD_CHANGE', username, 'Administrator password changed')
    return { success: true }
  }

  listBranches() { return this.db.prepare('SELECT * FROM branches ORDER BY name COLLATE NOCASE').all() }

  saveBranch(data, actor = 'Admin') {
    const values = BRANCH_COLUMNS.map((key) => String(data[key] || '').trim() || null)
    let result
    if (data.id) {
      const assignments = BRANCH_COLUMNS.map((key) => `${key} = ?`).join(', ')
      result = this.db.prepare(`UPDATE branches SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, Number(data.id))
      if (!result.changes) throw new Error('Branch not found')
      this.audit(actor, 'BRANCH_UPDATE', String(data.id), data.name)
      return { ...data, id: Number(data.id) }
    }
    result = this.db.prepare(`INSERT INTO branches (${BRANCH_COLUMNS.join(',')}) VALUES (${BRANCH_COLUMNS.map(() => '?').join(',')})`).run(...values)
    this.audit(actor, 'BRANCH_ADD', String(result.lastInsertRowid), data.name)
    return { ...data, id: Number(result.lastInsertRowid) }
  }

  deleteBranch(id, actor = 'Admin') {
    const branch = this.db.prepare('SELECT name FROM branches WHERE id = ?').get(Number(id))
    if (!branch) throw new Error('Branch not found')
    this.db.prepare('DELETE FROM branches WHERE id = ?').run(Number(id))
    this.audit(actor, 'BRANCH_DELETE', String(id), branch.name)
    return { success: true }
  }

  listDevices() {
    return this.db.prepare(`SELECT d.*, p.status, p.ping_time
      FROM devices d
      LEFT JOIN ping_history p ON p.id = (SELECT id FROM ping_history WHERE device_id = d.id ORDER BY id DESC LIMIT 1)
      ORDER BY d.branch_id, d.device_type, d.name COLLATE NOCASE`).all()
  }

  getDevice(id) { return this.db.prepare('SELECT * FROM devices WHERE id = ?').get(Number(id)) }
  listMonitoredDevices() { return this.db.prepare('SELECT * FROM devices WHERE is_dashboard_visible = 1 ORDER BY id').all() }

  saveDevice(data, actor = 'Admin') {
    const normalized = { ...data }
    normalized.branch_id = Number(data.branch_id)
    normalized.port = data.port ? Number(data.port) : null
    normalized.connection_port = data.connection_port ? Number(data.connection_port) : null
    normalized.checkout_number = data.checkout_number ? Number(data.checkout_number) : null
    normalized.is_dashboard_visible = data.is_dashboard_visible ? 1 : 0
    normalized.protocol = data.protocol === 'http' ? 'http' : 'https'
    const values = DEVICE_COLUMNS.map((key) => normalized[key] === '' || normalized[key] === undefined ? null : normalized[key])
    if (data.id) {
      const result = this.db.prepare(`UPDATE devices SET ${DEVICE_COLUMNS.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, Number(data.id))
      if (!result.changes) throw new Error('Device not found')
      this.audit(actor, 'DEVICE_UPDATE', String(data.id), `${data.device_type} ${data.ip}`)
      return { ...normalized, id: Number(data.id) }
    }
    const result = this.db.prepare(`INSERT INTO devices (${DEVICE_COLUMNS.join(',')}) VALUES (${DEVICE_COLUMNS.map(() => '?').join(',')})`).run(...values)
    this.audit(actor, 'DEVICE_ADD', String(result.lastInsertRowid), `${data.device_type} ${data.ip}`)
    return { ...normalized, id: Number(result.lastInsertRowid) }
  }

  deleteDevice(id, actor = 'Admin') {
    const device = this.getDevice(id)
    if (!device) throw new Error('Device not found')
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(Number(id))
    this.audit(actor, 'DEVICE_DELETE', String(id), `${device.device_type} ${device.ip}`)
    return { success: true }
  }

  getSettings() {
    const result = {}
    for (const row of this.db.prepare('SELECT key, value FROM settings').all()) {
      try {
        const parsed = JSON.parse(row.value)
        result[row.key] = SENSITIVE_SETTINGS.has(row.key) && parsed ? this.vault.decrypt(parsed) : parsed
      } catch { result[row.key] = row.value }
    }
    return result
  }

  saveSettings(patch, actor = 'Admin') {
    const statement = this.db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
    const save = this.db.transaction(() => {
      for (const [key, value] of Object.entries(patch || {})) {
        if (!/^[a-z0-9_]+$/i.test(key)) continue
        const stored = SENSITIVE_SETTINGS.has(key) && value ? this.vault.encrypt(value) : value
        statement.run(key, JSON.stringify(stored))
      }
    })
    save()
    this.audit(actor, 'SETTINGS_UPDATE', Object.keys(patch || {}).join(','), 'Application settings updated')
    return this.getSettings()
  }

  listCredentials() {
    return this.db.prepare('SELECT id, name, username, created_at, 1 AS has_password FROM credentials ORDER BY name COLLATE NOCASE').all()
  }
  revealCredential(id) {
    const row = this.db.prepare('SELECT password FROM credentials WHERE id = ?').get(Number(id))
    if (!row) throw new Error('Credential not found')
    return this.vault.decrypt(row.password)
  }
  getCredential(id) {
    if (!id) return null
    const row = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(Number(id))
    return row ? { ...row, password: this.vault.decrypt(row.password) } : null
  }
  saveCredential(data, actor = 'Admin') {
    if (!data.name?.trim() || !data.username?.trim() || !data.password) throw new Error('Name, username, and password are required')
    const result = this.db.prepare('INSERT INTO credentials (name, username, password) VALUES (?, ?, ?)').run(data.name.trim(), data.username.trim(), this.vault.encrypt(data.password))
    this.audit(actor, 'CREDENTIAL_ADD', String(result.lastInsertRowid), data.name)
    return { id: Number(result.lastInsertRowid), name: data.name, username: data.username, has_password: 1 }
  }
  deleteCredential(id, actor = 'Admin') {
    const row = this.db.prepare('SELECT name FROM credentials WHERE id = ?').get(Number(id))
    if (!row) throw new Error('Credential not found')
    this.db.prepare('DELETE FROM credentials WHERE id = ?').run(Number(id))
    this.audit(actor, 'CREDENTIAL_DELETE', String(id), row.name)
    return { success: true }
  }
  getMappings() {
    const result = {}
    for (const row of this.db.prepare('SELECT device_type, credential_id FROM device_credentials ORDER BY device_type').all()) {
      if (!result[row.device_type]) result[row.device_type] = []
      result[row.device_type].push(row.credential_id)
    }
    return result
  }
  saveMappings(mappings, actor = 'Admin') {
    const remove = this.db.prepare('DELETE FROM device_credentials')
    const insert = this.db.prepare('INSERT OR IGNORE INTO device_credentials (device_type, credential_id) VALUES (?, ?)')
    this.db.transaction(() => {
      remove.run()
      for (const [type, ids] of Object.entries(mappings || {})) for (const id of ids) insert.run(type, Number(id))
    })()
    this.audit(actor, 'CREDENTIAL_MAPPING_UPDATE', 'Device types', 'Credential mappings updated')
    return this.getMappings()
  }

  recordPingBatch(results) {
    const insertPing = this.db.prepare('INSERT INTO ping_history (device_id, ping_time, status) VALUES (?, ?, ?)')
    const updateUptime = this.db.prepare(`INSERT INTO uptime_logs (device_id, uptime_percent, total_checks, successful_checks, date)
      VALUES (?, ?, 1, ?, date('now','localtime'))
      ON CONFLICT(device_id, date) DO UPDATE SET
        total_checks = total_checks + 1,
        successful_checks = successful_checks + excluded.successful_checks,
        uptime_percent = ((successful_checks + excluded.successful_checks) * 100.0) / (total_checks + 1)`)
    const prune = this.db.prepare(`DELETE FROM ping_history WHERE device_id = ? AND id NOT IN
      (SELECT id FROM ping_history WHERE device_id = ? ORDER BY id DESC LIMIT 1000)`)
    this.db.transaction(() => {
      for (const result of results) {
        insertPing.run(result.device_id, result.ping_time, result.status)
        const success = result.status === 'offline' ? 0 : 1
        updateUptime.run(result.device_id, success * 100, success)
        prune.run(result.device_id, result.device_id)
      }
    })()
  }

  getMonitorSnapshot(historyCount = 30) {
    const branches = this.listBranches()
    const devices = this.listDevices().filter((device) => device.is_dashboard_visible).map((device) => ({
      ...device,
      status: device.status || 'unknown',
      history: this.db.prepare('SELECT ping_time, status, timestamp FROM ping_history WHERE device_id = ? ORDER BY id DESC LIMIT ?').all(device.id, Number(historyCount)).reverse().map((row, index) => ({ ...row, sequence: index + 1 }))
    }))
    return { branches, devices, generated_at: new Date().toISOString() }
  }

  listInventory() {
    return this.db.prepare(`SELECT d.*, b.name AS branch_name, b.code AS branch_code, p.status, p.ping_time
      FROM devices d JOIN branches b ON b.id = d.branch_id
      LEFT JOIN ping_history p ON p.id = (SELECT id FROM ping_history WHERE device_id = d.id ORDER BY id DESC LIMIT 1)
      ORDER BY b.name, d.device_type, d.name`).all()
  }

  audit(user, action, target = null, details = null) {
    this.db.prepare('INSERT INTO audit_logs (user, action, target, details) VALUES (?, ?, ?, ?)').run(user || 'System', action, target, details)
  }
  listAudit(limit = 200) { return this.db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(Math.min(1000, Math.max(1, Number(limit)))) }
}

module.exports = { AppDatabase }
