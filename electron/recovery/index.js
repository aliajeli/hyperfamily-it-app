/**
 * HyperFamily Credential Recovery
 * --------------------------------
 * A tiny standalone window that reads the administrator username and password
 * from the machine's own HyperFamily database and displays them, so a
 * forgotten login can be recovered without reinstalling anything.
 *
 * The package name deliberately matches the main application, so
 * app.getPath('userData') resolves to the same folder and the same encrypted
 * database. Decryption reuses the exact same scheme as the app:
 *
 *   .database-key  -> DPAPI (safeStorage) blob, or AES-256-GCM with .vault-key
 *   database       -> SQLCipher with that key
 *   password_recovery column -> same DPAPI/AES scheme
 *
 * The password is only recoverable when it was saved by v2.0.18 or later;
 * older databases show a "change the password once" hint instead.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app, BrowserWindow, Menu, safeStorage } = require('electron')
const Database = require('better-sqlite3-multiple-ciphers')

const DB_FILE = 'hyperfamily-monitor.db'
const KEY_FILE = '.database-key'
const FALLBACK_KEY_FILE = '.vault-key'

function fallbackKey(userDataPath) {
  const keyPath = path.join(userDataPath, FALLBACK_KEY_FILE)
  try {
    const key = fs.readFileSync(keyPath)
    return key.length === 32 ? key : null
  } catch { return null }
}

function decryptValue(payload, userDataPath) {
  if (!payload) return ''
  const text = String(payload)
  if (text.startsWith('dpapi:')) {
    return safeStorage.decryptString(Buffer.from(text.slice(6), 'base64'))
  }
  if (text.startsWith('aes:')) {
    const key = fallbackKey(userDataPath)
    if (!key) throw new Error('the local encryption key is missing')
    const [, iv, tag, encrypted] = text.split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
  }
  return text
}

function readCredentials(userDataPath) {
  const keyPath = path.join(userDataPath, KEY_FILE)
  if (!fs.existsSync(keyPath)) {
    return { error: 'No HyperFamily database key was found on this machine. Run the application at least once, then try again.' }
  }

  let databaseKey
  try {
    databaseKey = decryptValue(fs.readFileSync(keyPath, 'utf8'), userDataPath)
  } catch (error) {
    return { error: `The database key could not be decrypted (${error.message}). This tool only works for the same Windows user who runs the application.` }
  }

  const dbPath = path.join(userDataPath, DB_FILE)
  if (!fs.existsSync(dbPath)) {
    return { error: 'The HyperFamily database was not found on this machine. Run the application at least once, then try again.' }
  }

  let db
  try {
    db = new Database(dbPath)
    db.pragma("cipher='sqlcipher'")
    db.pragma(`key="x'${databaseKey}'"`)
    db.prepare('SELECT count(*) AS count FROM sqlite_master').get()
  } catch (error) {
    return { error: `The database could not be opened (${error.message}).` }
  }

  try {
    const rows = db.prepare('SELECT username, password_recovery FROM users ORDER BY id').all()
    return {
      users: rows.map((row) => ({
        username: row.username,
        password: row.password_recovery ? decryptValue(row.password_recovery, userDataPath) : null
      }))
    }
  } catch (error) {
    return { error: `The credentials could not be read (${error.message}).` }
  } finally {
    try { db.close() } catch { /* already closed */ }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}

function buildPage(result) {
  const rows = (result.users || [])
    .map((user) => `
      <div class="card">
        <div class="field"><span class="k">Username</span><span class="v" id="u">${escapeHtml(user.username)}</span>
          <button onclick="copyTo('${escapeHtml(user.username)}', this)">Copy</button></div>
        <div class="field"><span class="k">Password</span>
          <span class="v${user.password ? '' : ' hint'}">${user.password ? escapeHtml(user.password) : 'not recorded on this database'}</span>
          ${user.password ? `<button onclick="copyTo('${escapeHtml(user.password)}', this)">Copy</button>` : ''}</div>
        ${!user.password ? '<p class="hint">Saved before recovery existed — change the password once inside the application to store a recoverable copy.</p>' : ''}
      </div>`)
    .join('')

  const body = result.error
    ? `<div class="error"><div class="eicon">!</div><p>${escapeHtml(result.error)}</p></div>`
    : rows || '<p class="hint">No administrator accounts were found.</p>'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HyperFamily Credential Recovery</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(160deg, #2e3440 0%, #232833 100%);
    color: #eceff4; min-height: 100vh; padding: 22px 18px;
    display: flex; flex-direction: column;
  }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .logo { width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(145deg, #f8544a, #a8101a);
    display: grid; place-items: center; font-weight: 900; font-size: 18px; color: #fff;
    box-shadow: 0 4px 14px rgba(212,33,31,.4); }
  h1 { font-size: 15px; font-weight: 800; letter-spacing: .2px; }
  p.sub { font-size: 10.5px; color: #9aa4b8; margin-top: 2px; }
  .card { background: rgba(236,239,244,.06); border: 1px solid rgba(236,239,244,.14);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
  .field { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .field + .field { border-top: 1px solid rgba(236,239,244,.08); }
  .k { width: 78px; font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .12em; color: #9aa4b8; }
  .v { flex: 1; font-family: Consolas, monospace; font-size: 13px; word-break: break-all; }
  .v.hint { color: #9aa4b8; font-family: inherit; font-size: 11px; }
  button { background: #88c0d0; border: 0; color: #232833; font-weight: 800;
    font-size: 10.5px; padding: 5px 12px; border-radius: 8px; cursor: pointer; }
  button:hover { filter: brightness(1.1); }
  button.copied { background: #a3be8c; }
  .hint { font-size: 10px; color: #9aa4b8; line-height: 1.5; margin-top: 4px; }
  .error { background: rgba(191,97,106,.12); border: 1px solid rgba(191,97,106,.4);
    border-radius: 12px; padding: 16px; display: flex; gap: 12px; align-items: flex-start; }
  .eicon { width: 26px; height: 26px; border-radius: 50%; background: #bf616a; color: #fff;
    display: grid; place-items: center; font-weight: 900; flex-shrink: 0; }
  .error p { font-size: 11.5px; line-height: 1.55; color: #efc9cc; }
  footer { margin-top: auto; font-size: 9.5px; color: #7c8698; text-align: center;
    padding-top: 12px; line-height: 1.5; }
  b { color: #eceff4; }
</style>
</head>
<body>
  <header>
    <div class="logo">HF</div>
    <div>
      <h1>HyperFamily Credential Recovery</h1>
      <p class="sub">Administrator login stored on this computer</p>
    </div>
  </header>
  ${body}
  <footer>Decrypted for the signed-in Windows user only.<br>Do not share these credentials — anyone with them can open the application.</footer>
  <script>
    function copyTo(text, button) {
      navigator.clipboard.writeText(text).then(() => {
        const old = button.textContent
        button.textContent = 'Copied'
        button.classList.add('copied')
        setTimeout(() => { button.textContent = old; button.classList.remove('copied') }, 1400)
      })
    }
  </script>
</body>
</html>`
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const window = new BrowserWindow({
    width: 520,
    height: 430,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'HyperFamily Credential Recovery',
    backgroundColor: '#232833',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => app.quit())
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPage(readCredentials(app.getPath('userData'))))}`)
})

app.on('window-all-closed', () => app.quit())
