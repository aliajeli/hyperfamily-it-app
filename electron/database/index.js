const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3-multiple-ciphers')
const bcrypt = require('bcryptjs')
const { runMigrations, DEVICE_COLUMNS } = require('./migrations')

const BRANCH_COLUMNS = ['name', 'code', 'warehouse_code', 'link1', 'ip_link1', 'link2', 'ip_link2', 'manager_name', 'manager_tell', 'deputy_name', 'deputy_tell']
const SENSITIVE_SETTINGS = new Set(['teamviewer_password', 'vpn_pass'])
const MAX_SWITCH_PORTS = 48

function normalizeSwitchPorts(ports) {
  if (!Array.isArray(ports)) throw new Error('Switch ports must be provided as a list')
  if (ports.length > MAX_SWITCH_PORTS) throw new Error(`A Switch can contain at most ${MAX_SWITCH_PORTS} ports`)

  const seen = new Set()
  return ports.map((port, index) => {
    const portNumber = Number(port?.port_number)
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > MAX_SWITCH_PORTS) {
      throw new Error(`Switch port ${index + 1} must use a Port Number from 1 through ${MAX_SWITCH_PORTS}`)
    }
    if (seen.has(portNumber)) throw new Error(`Switch Port Number ${portNumber} is duplicated`)
    seen.add(portNumber)
    return { ...port, port_number: portNumber }
  })
}

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

  updateCredentials(userId, payload = {}) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId))
    if (!user || !bcrypt.compareSync(String(payload.currentPassword || ''), user.password)) throw new Error('Current password is incorrect')

    const nextUsername = String(payload.newUsername || '').trim()
    const nextPassword = String(payload.newPassword || '')
    if (nextUsername.length < 3 || nextUsername.length > 64) throw new Error('Username must contain between 3 and 64 characters')
    if (/[\u0000-\u001f\u007f]/.test(nextUsername)) throw new Error('Username contains unsupported characters')
    if (nextPassword && nextPassword.length < 4) throw new Error('New password must contain at least 4 characters')

    const passwordHash = nextPassword ? bcrypt.hashSync(nextPassword, 10) : user.password
    try {
      this.db.prepare("UPDATE users SET username = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextUsername, passwordHash, user.id)
    } catch (error) {
      if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) throw new Error('That username is already in use')
      throw error
    }

    const changed = []
    if (nextUsername !== user.username) changed.push(`username from ${user.username} to ${nextUsername}`)
    if (nextPassword) changed.push('password')
    this.audit(nextUsername, 'ACCOUNT_UPDATE', nextUsername, `Administrator ${changed.length ? changed.join(' and ') : 'credentials verified'}`)
    return { id: user.id, username: nextUsername }
  }

  changePassword(username, currentPassword, newPassword) {
    const user = this.db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim())
    if (!user) throw new Error('Current password is incorrect')
    this.updateCredentials(user.id, { currentPassword, newUsername: user.username, newPassword })
    return { success: true }
  }

  listBranches() { return this.db.prepare('SELECT * FROM branches ORDER BY name COLLATE NOCASE').all() }

  saveBranch(data, actor = 'Admin') {
    const name = String(data.name || '').trim()
    const code = String(data.code || '').trim()
    const warehouseCode = String(data.warehouse_code || '').trim()
    if (!name || !code) throw new Error('Branch name and code are required')
    if (!warehouseCode) throw new Error('Warehouse Code is required')
    if (!/^[A-Za-z0-9_-]+$/.test(code) || code.length > 20) throw new Error('Branch Code must use no more than 20 letters, numbers, dashes, or underscores')
    if (!/^[A-Za-z0-9_-]+$/.test(warehouseCode) || warehouseCode.length > 40) throw new Error('Warehouse Code must use no more than 40 letters, numbers, dashes, or underscores')
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

  listSwitchPorts(deviceId = null) {
    if (deviceId) return this.db.prepare('SELECT * FROM switch_ports WHERE device_id = ? ORDER BY port_number').all(Number(deviceId))
    return this.db.prepare('SELECT * FROM switch_ports ORDER BY device_id, port_number').all()
  }

  attachSwitchPorts(devices) {
    const portsByDevice = new Map()
    for (const port of this.listSwitchPorts()) {
      if (!portsByDevice.has(port.device_id)) portsByDevice.set(port.device_id, [])
      portsByDevice.get(port.device_id).push(port)
    }
    return devices.map((device) => ({ ...device, switch_ports: portsByDevice.get(device.id) || [] }))
  }

  listDevices() {
    const devices = this.db.prepare(`SELECT d.*, p.status, p.ping_time
      FROM devices d
      LEFT JOIN ping_history p ON p.id = (SELECT id FROM ping_history WHERE device_id = d.id ORDER BY id DESC LIMIT 1)
      ORDER BY d.branch_id, d.device_type, d.name COLLATE NOCASE`).all()
    return this.attachSwitchPorts(devices)
  }

  getDevice(id) {
    const device = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(Number(id))
    return device ? { ...device, switch_ports: this.listSwitchPorts(device.id) } : undefined
  }
  listMonitoredDevices() { return this.db.prepare('SELECT * FROM devices WHERE is_dashboard_visible = 1 ORDER BY id').all() }

  replaceSwitchPorts(deviceId, ports = []) {
    this.db.prepare('DELETE FROM switch_ports WHERE device_id = ?').run(Number(deviceId))
    if (!ports.length) return
    const insert = this.db.prepare(`INSERT INTO switch_ports (device_id, port_number, vlan, status, ip, details)
      VALUES (?, ?, ?, ?, ?, ?)`)
    for (const port of ports) {
      insert.run(
        Number(deviceId),
        Number(port.port_number),
        String(port.vlan || '').trim() || null,
        ['up', 'down', 'disabled'].includes(port.status) ? port.status : 'up',
        String(port.ip || '').trim() || null,
        String(port.details || '').trim() || null
      )
    }
  }

  saveDevice(data, actor = 'Admin') {
    const normalized = { ...data }
    normalized.branch_id = Number(data.branch_id)
    normalized.name = String(data.name || '').trim()
    if (!normalized.name) throw new Error('Device Name is required')
    normalized.port = data.port ? Number(data.port) : null
    normalized.connection_port = String(data.connection_port || '').trim() || null
    normalized.checkout_number = data.checkout_number ? Number(data.checkout_number) : null
    normalized.is_dashboard_visible = data.is_dashboard_visible ? 1 : 0
    normalized.protocol = data.protocol === 'http' ? 'http' : 'https'
    const switchPorts = normalized.device_type === 'Switch' ? normalizeSwitchPorts(data.switch_ports || []) : []
    const values = DEVICE_COLUMNS.map((key) => normalized[key] === '' || normalized[key] === undefined ? null : normalized[key])

    return this.db.transaction(() => {
      if (normalized.device_type === 'Router') {
        const deviceId = Number(data.id) || 0
        const existingRouter = this.db.prepare(`SELECT id FROM devices
          WHERE branch_id = ? AND device_type = 'Router' AND id <> ? LIMIT 1`)
          .get(normalized.branch_id, deviceId)
        const current = deviceId ? this.db.prepare('SELECT branch_id, device_type FROM devices WHERE id = ?').get(deviceId) : null
        const editingLegacyRouterInPlace = current?.device_type === 'Router' && current.branch_id === normalized.branch_id
        if (existingRouter && !editingLegacyRouterInPlace) throw new Error('Only one Router can be defined for each branch')
      }

      let deviceId
      if (data.id) {
        deviceId = Number(data.id)
        const result = this.db.prepare(`UPDATE devices SET ${DEVICE_COLUMNS.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, deviceId)
        if (!result.changes) throw new Error('Device not found')
        this.audit(actor, 'DEVICE_UPDATE', String(deviceId), `${data.device_type} ${data.ip}`)
      } else {
        const result = this.db.prepare(`INSERT INTO devices (${DEVICE_COLUMNS.join(',')}) VALUES (${DEVICE_COLUMNS.map(() => '?').join(',')})`).run(...values)
        deviceId = Number(result.lastInsertRowid)
        this.audit(actor, 'DEVICE_ADD', String(deviceId), `${data.device_type} ${data.ip}`)
      }

      this.replaceSwitchPorts(deviceId, switchPorts)
      return { ...normalized, id: deviceId, switch_ports: this.listSwitchPorts(deviceId) }
    })()
  }

  importDirectory(payload = {}, actor = 'Admin') {
    const branchRows = Array.isArray(payload.branches) ? payload.branches : []
    const deviceRows = Array.isArray(payload.devices) ? payload.devices : []

    return this.db.transaction(() => {
      const summary = {
        branches_added: 0,
        branches_updated: 0,
        devices_added: 0,
        devices_updated: 0,
        switch_ports_imported: 0
      }

      for (const branch of branchRows) {
        const existing = this.db.prepare('SELECT id FROM branches WHERE code = ? COLLATE NOCASE').get(branch.code)
        this.saveBranch({ ...branch, id: existing?.id }, actor)
        if (existing) summary.branches_updated += 1
        else summary.branches_added += 1
      }

      for (const device of deviceRows) {
        const branch = this.db.prepare('SELECT id FROM branches WHERE code = ? COLLATE NOCASE').get(device.branch_code)
        if (!branch) throw new Error(`Branch Code "${device.branch_code}" does not exist`)

        const existing = device.device_type === 'Router'
          ? this.db.prepare("SELECT id FROM devices WHERE branch_id = ? AND device_type = 'Router' LIMIT 1").get(branch.id)
          : this.db.prepare('SELECT id FROM devices WHERE branch_id = ? AND device_type = ? AND ip = ? COLLATE NOCASE LIMIT 1').get(branch.id, device.device_type, device.ip)
        const saved = this.saveDevice({ ...device, id: existing?.id, branch_id: branch.id }, actor)
        if (existing) summary.devices_updated += 1
        else summary.devices_added += 1
        if (saved.device_type === 'Switch') summary.switch_ports_imported += saved.switch_ports.length
      }

      const branchChanges = summary.branches_added + summary.branches_updated
      const deviceChanges = summary.devices_added + summary.devices_updated
      this.audit(actor, 'DIRECTORY_IMPORT', 'Excel workbook', `${branchChanges} branches, ${deviceChanges} devices, ${summary.switch_ports_imported} switch ports processed`)
      return { success: true, ...summary }
    })()
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
  getDeviceMappings() {
    const result = {}
    for (const row of this.db.prepare('SELECT device_id, credential_id FROM device_credential_assignments ORDER BY device_id').all()) {
      if (!result[row.device_id]) result[row.device_id] = []
      result[row.device_id].push(row.credential_id)
    }
    return result
  }

  // Unified view used by the Credential Mapping UI:
  // { types: { [device_type]: [credentialId] }, devices: { [deviceId]: [credentialId] } }
  getCredentialMap() {
    return { types: this.getMappings(), devices: this.getDeviceMappings() }
  }

  saveMappings(mappings, actor = 'Admin') {
    // Accepts either the legacy shape ({ [device_type]: [ids] }) or the new
    // unified shape ({ types: {...}, devices: {...} }).
    const unified = mappings && (mappings.types || mappings.devices)
      ? mappings
      : { types: mappings || {}, devices: null }

    const clearTypes = this.db.prepare('DELETE FROM device_credentials')
    const insertType = this.db.prepare('INSERT OR IGNORE INTO device_credentials (device_type, credential_id) VALUES (?, ?)')
    const clearDevices = this.db.prepare('DELETE FROM device_credential_assignments')
    const insertDevice = this.db.prepare('INSERT OR IGNORE INTO device_credential_assignments (device_id, credential_id) VALUES (?, ?)')

    this.db.transaction(() => {
      if (unified.types) {
        clearTypes.run()
        for (const [type, ids] of Object.entries(unified.types)) {
          for (const id of ids || []) insertType.run(type, Number(id))
        }
      }
      if (unified.devices) {
        clearDevices.run()
        for (const [deviceId, ids] of Object.entries(unified.devices)) {
          for (const id of ids || []) insertDevice.run(Number(deviceId), Number(id))
        }
      }
    })()

    this.audit(actor, 'CREDENTIAL_MAPPING_UPDATE', 'Devices and device types', 'Credential mappings updated')
    return this.getCredentialMap()
  }

  // Credentials that may be used with a device: explicit per-device assignments
  // take precedence in the UI ordering, followed by device-type assignments.
  listCredentialsForDevice(deviceId) {
    const device = this.db.prepare('SELECT id, device_type FROM devices WHERE id = ?').get(Number(deviceId))
    if (!device) return []
    const rows = this.db.prepare(`SELECT c.id, c.name, c.username, 1 AS has_password, 'device' AS scope
        FROM device_credential_assignments a JOIN credentials c ON c.id = a.credential_id
        WHERE a.device_id = ?
      UNION
      SELECT c.id, c.name, c.username, 1 AS has_password, 'type' AS scope
        FROM device_credentials t JOIN credentials c ON c.id = t.credential_id
        WHERE t.device_type = ?`).all(device.id, device.device_type)

    const seen = new Map()
    for (const row of rows.sort((a, b) => (a.scope === 'device' ? -1 : 1) - (b.scope === 'device' ? -1 : 1))) {
      if (!seen.has(row.id)) seen.set(row.id, row)
    }
    return [...seen.values()].sort((a, b) => (a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'device' ? -1 : 1))
  }

  // Resolves the credential a launcher should use when none was picked
  // explicitly: the device-specific assignment wins over the type-level one.
  resolveDeviceCredential(deviceId) {
    const best = this.listCredentialsForDevice(deviceId)[0]
    return best ? this.getCredential(best.id) : null
  }

  listNotes() {
    return this.db.prepare('SELECT id, name, body, pinned, created_at, updated_at FROM notes ORDER BY pinned DESC, updated_at DESC').all()
  }

  saveNote(payload = {}, actor = 'System') {
    const name = String(payload.name || '').trim()
    if (!name) throw new Error('A note needs a name')
    const body = typeof payload.body === 'string' ? payload.body : ''
    const pinned = payload.pinned ? 1 : 0
    if (payload.id) {
      this.db.prepare('UPDATE notes SET name = ?, body = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, body, pinned, Number(payload.id))
      this.audit(actor, 'NOTE_UPDATE', name, `Note ${payload.id}`)
      return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(payload.id))
    }
    const info = this.db.prepare('INSERT INTO notes (name, body, pinned) VALUES (?, ?, ?)').run(name, body, pinned)
    this.audit(actor, 'NOTE_CREATE', name, `Note ${info.lastInsertRowid}`)
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid)
  }

  deleteNote(id, actor = 'System') {
    const note = this.db.prepare('SELECT name FROM notes WHERE id = ?').get(Number(id))
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(Number(id))
    if (note) this.audit(actor, 'NOTE_DELETE', note.name, `Note ${id}`)
    return true
  }

  listSnippets() {
    return this.db.prepare('SELECT id, name, command, description, created_at, updated_at FROM terminal_snippets ORDER BY name COLLATE NOCASE').all()
  }

  saveSnippet(payload = {}, actor = 'System') {
    const name = String(payload.name || '').trim()
    // Multi-line snippets are supported: only the line endings are normalised
    // and the outer blank space trimmed, so a whole configuration block keeps
    // its internal newlines and can be replayed line by line.
    const command = String(payload.command || '').replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '')
    if (!name) throw new Error('A snippet needs a name')
    if (!command) throw new Error('A snippet needs a command')
    if (command.length > 20000) throw new Error('A snippet cannot be longer than 20000 characters')
    const description = String(payload.description || '').trim() || null
    const lineCount = command.split('\n').filter((line) => line.trim().length).length
    const summary = lineCount > 1 ? `${lineCount} lines` : command
    if (payload.id) {
      this.db.prepare('UPDATE terminal_snippets SET name = ?, command = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, command, description, Number(payload.id))
      this.audit(actor, 'SNIPPET_UPDATE', name, summary)
      return this.db.prepare('SELECT * FROM terminal_snippets WHERE id = ?').get(Number(payload.id))
    }
    const info = this.db.prepare('INSERT INTO terminal_snippets (name, command, description) VALUES (?, ?, ?)').run(name, command, description)
    this.audit(actor, 'SNIPPET_CREATE', name, summary)
    return this.db.prepare('SELECT * FROM terminal_snippets WHERE id = ?').get(info.lastInsertRowid)
  }

  deleteSnippet(id, actor = 'System') {
    const snippet = this.db.prepare('SELECT name FROM terminal_snippets WHERE id = ?').get(Number(id))
    this.db.prepare('DELETE FROM terminal_snippets WHERE id = ?').run(Number(id))
    if (snippet) this.audit(actor, 'SNIPPET_DELETE', snippet.name, `Snippet ${id}`)
    return true
  }

  // Branch-grouped switch list used by the in-app terminal.
  listTerminalTargets() {
    const rows = this.db.prepare(`SELECT d.id, d.name, d.ip, d.transport, d.model, d.location,
        b.id AS branch_id, b.name AS branch_name, b.code AS branch_code
      FROM devices d JOIN branches b ON b.id = d.branch_id
      WHERE d.device_type = 'Switch'
      ORDER BY b.name COLLATE NOCASE, d.name COLLATE NOCASE`).all()
    const branches = new Map()
    for (const row of rows) {
      if (!branches.has(row.branch_id)) {
        branches.set(row.branch_id, { id: row.branch_id, name: row.branch_name, code: row.branch_code, switches: [] })
      }
      branches.get(row.branch_id).switches.push({
        id: row.id, name: row.name, ip: row.ip, model: row.model, location: row.location,
        transport: row.transport === 'telnet' ? 'telnet' : 'ssh'
      })
    }
    return [...branches.values()]
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
    const rows = this.db.prepare(`SELECT d.*, b.name AS branch_name, b.code AS branch_code, b.warehouse_code AS branch_warehouse_code, p.status, p.ping_time
      FROM devices d JOIN branches b ON b.id = d.branch_id
      LEFT JOIN ping_history p ON p.id = (SELECT id FROM ping_history WHERE device_id = d.id ORDER BY id DESC LIMIT 1)
      ORDER BY b.name, d.device_type, d.name`).all()
    return this.attachSwitchPorts(rows)
  }

  audit(user, action, target = null, details = null) {
    this.db.prepare('INSERT INTO audit_logs (user, action, target, details) VALUES (?, ?, ?, ?)').run(user || 'System', action, target, details)
  }
  listAudit(limit = 200) { return this.db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(Math.min(1000, Math.max(1, Number(limit)))) }
}

module.exports = { AppDatabase }
