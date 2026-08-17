/**
 * HyperFamily Credential Recovery (v2.0.21)
 * -----------------------------------------
 * A tiny window that shows the administrator username and password saved on
 * this computer — but only after the recovery PIN is entered correctly.
 *
 * The tool is deliberately dumb and light: it reads ONE small encrypted file
 * (`credentials.dat`) that the main application refreshes at every start and
 * after every password change. No database, no SQLCipher, no native modules —
 * just Node's built-in fs/path/crypto plus Electron's DPAPI-backed
 * safeStorage, exactly like the main application uses.
 *
 * Security gate (shared with the in-app dialog):
 *   - the file carries a scrypt hash of the recovery PIN (plain PIN is never
 *     stored anywhere)
 *   - five wrong attempts lock recovery for five minutes; the counters live
 *     inside the same file, so the app and this tool share one gate
 *   - DPAPI ties decryption to the Windows user, so the tool can only ever
 *     read credentials on the same account that runs the application
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app, BrowserWindow, Menu, ipcMain, safeStorage } = require('electron')

const CREDENTIALS_FILE = 'credentials.dat'
const FALLBACK_KEY_FILE = '.vault-key'
const MAX_ATTEMPTS = 5
const LOCK_MS = 5 * 60 * 1000

/** Every folder the main application may have stored the file in. */
function candidateFolders(app) {
  const folders = [
    'HyperFamily Branch Monitor', // canonical (v2.0.20)
    'hyperfamily-branch-monitor', // package-name variant
    'hyperfamily'                 // legacy variant
  ]
  const roots = []
  try { roots.push(app.getPath('appData')) } catch { /* best-effort */ }
  try {
    const local = app.getPath('localAppData')
    if (local !== roots[0]) roots.push(local)
  } catch { /* best-effort */ }
  const out = []
  for (const root of roots) {
    if (!root) continue
    for (const folder of folders) out.push(path.join(root, folder))
  }
  return [...new Set(out)]
}

function findCredentialsFile(app) {
  for (const dir of candidateFolders(app)) {
    const file = path.join(dir, CREDENTIALS_FILE)
    if (fs.existsSync(file)) return { file, dir }
  }
  return null
}

function fallbackKey(dirs) {
  for (const dir of dirs) {
    try {
      const key = fs.readFileSync(path.join(dir, FALLBACK_KEY_FILE))
      if (key.length === 32) return key
    } catch { /* try the next folder */ }
  }
  return null
}

function decryptValue(payload, dirs) {
  if (!payload) return ''
  const text = String(payload)
  if (text.startsWith('dpapi:')) {
    return safeStorage.decryptString(Buffer.from(text.slice(6), 'base64'))
  }
  if (text.startsWith('aes:')) {
    const key = fallbackKey(dirs)
    if (!key) throw new Error('the local encryption key is missing')
    const [, iv, tag, encrypted] = text.split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
  }
  return text
}

/** Mirrors the main application's SecureVault.encrypt. */
function encryptValue(text, dirs) {
  if (safeStorage.isEncryptionAvailable()) {
    return `dpapi:${safeStorage.encryptString(String(text)).toString('base64')}`
  }
  const key = fallbackKey(dirs)
  if (!key) throw new Error('the local encryption key is missing')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return `aes:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`
}

function verifyPinHash(pin, stored) {
  if (!stored || typeof stored !== 'string') return false
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const attempt = crypto.scryptSync(String(pin), salt, 32).toString('hex')
  const expected = Buffer.from(hash, 'hex')
  const actual = Buffer.from(attempt, 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

/** Session state: the file location plus its decrypted contents. */
const state = { found: null, dirs: [], data: null, error: '' }

function persist() {
  const payload = JSON.stringify(state.data)
  const encrypted = encryptValue(payload, state.dirs)
  try {
    fs.writeFileSync(state.found.file, encrypted, { mode: 0o600 })
  } catch { /* the lock state stays in memory; reveal still works on success */ }
}

function loadState() {
  state.dirs = candidateFolders(app)
  const found = findCredentialsFile(app)
  if (!found) {
    state.error = 'No saved credentials were found on this computer. Open the HyperFamily application once (it refreshes this file at every start), then run this tool again.'
    return
  }
  state.found = found
  try {
    state.data = JSON.parse(decryptValue(fs.readFileSync(found.file, 'utf8'), state.dirs) || '{}')
  } catch (error) {
    state.error = `The saved credentials could not be decrypted (${error.message}). This tool only works for the same Windows user who runs the application.`
  }
}

/** What the page needs before any PIN attempt. */
function publicState() {
  const data = state.data || {}
  const now = Date.now()
  const lockedUntil = Number(data.lockedUntil) || 0
  const attempts = Number(data.attempts) || 0
  return {
    error: state.error,
    pinSet: Boolean(data.pinHash),
    username: data.username || '',
    locked: lockedUntil > now,
    retryAfterMs: lockedUntil > now ? lockedUntil - now : 0,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts)
  }
}

function verify(pin) {
  if (state.error) return { ok: false, error: state.error }
  const data = state.data || {}
  if (!data.pinHash) return { ok: false, error: 'No recovery PIN has been set. Sign in to the application and set one in Settings → General, then run this tool again.' }

  const now = Date.now()
  const lockedUntil = Number(data.lockedUntil) || 0
  if (lockedUntil > now) return { ok: false, locked: true, retryAfterMs: lockedUntil - now, attemptsLeft: 0 }

  if (!verifyPinHash(pin, data.pinHash)) {
    const attempts = (Number(data.attempts) || 0) + 1
    const lock = attempts >= MAX_ATTEMPTS
    state.data = { ...data, attempts: lock ? 0 : attempts, lockedUntil: lock ? now + LOCK_MS : 0 }
    try { persist() } catch (error) { return { ok: false, error: `Could not update the lock state (${error.message}).` } }
    return { ok: false, locked: lock, retryAfterMs: lock ? LOCK_MS : 0, attemptsLeft: lock ? 0 : MAX_ATTEMPTS - attempts }
  }

  // Correct: reset the counters and reveal the credentials.
  state.data = { ...data, attempts: 0, lockedUntil: 0 }
  try { persist() } catch { /* revealing still works even if the reset cannot be written */ }
  return { ok: true, username: data.username || '', password: data.password || null }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  loadState()

  ipcMain.handle('recovery:state', () => publicState())
  ipcMain.handle('recovery:verify', (_event, pin) => verify(pin))

  const window = new BrowserWindow({
    width: 440,
    height: 340,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'HyperFamily Credential Recovery',
    backgroundColor: '#eef1f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => app.quit())
  window.loadFile(path.join(__dirname, 'page.html'))
})

app.on('window-all-closed', () => app.quit())
