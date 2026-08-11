const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { safeStorage } = require('electron')

class SecureVault {
  constructor(userDataPath) {
    this.keyPath = path.join(userDataPath, '.vault-key')
    this.databaseKeyPath = path.join(userDataPath, '.database-key')
    this.fallbackKey = null
  }

  hasDatabaseKey() { return fs.existsSync(this.databaseKeyPath) }

  getDatabaseKey() {
    if (this.hasDatabaseKey()) return this.decrypt(fs.readFileSync(this.databaseKeyPath, 'utf8'))
    const key = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(this.databaseKeyPath, this.encrypt(key), { mode: 0o600, flag: 'wx' })
    return key
  }

  getFallbackKey() {
    if (this.fallbackKey) return this.fallbackKey
    if (fs.existsSync(this.keyPath)) {
      this.fallbackKey = fs.readFileSync(this.keyPath)
    } else {
      this.fallbackKey = crypto.randomBytes(32)
      fs.writeFileSync(this.keyPath, this.fallbackKey, { mode: 0o600, flag: 'wx' })
    }
    if (this.fallbackKey.length !== 32) throw new Error('Invalid local encryption key')
    return this.fallbackKey
  }

  encrypt(value) {
    if (value == null || value === '') return ''
    const text = String(value)
    if (safeStorage.isEncryptionAvailable()) {
      return `dpapi:${safeStorage.encryptString(text).toString('base64')}`
    }
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return `aes:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`
  }

  decrypt(payload) {
    if (!payload) return ''
    if (payload.startsWith('dpapi:')) return safeStorage.decryptString(Buffer.from(payload.slice(6), 'base64'))
    if (payload.startsWith('aes:')) {
      const [, iv, tag, encrypted] = payload.split(':')
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.getFallbackKey(), Buffer.from(iv, 'base64'))
      decipher.setAuthTag(Buffer.from(tag, 'base64'))
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
    }
    // Migration compatibility for old development databases; save operations re-encrypt it.
    return payload
  }
}

module.exports = { SecureVault }
