/**
 * HyperFamily Credential Recovery (v2.0.19)
 * -----------------------------------------
 * A tiny window that shows the administrator username and password saved on
 * this computer, so a forgotten login can be recovered.
 *
 * The tool is deliberately dumb and light: it reads ONE small encrypted file
 * (`credentials.dat`) that the main application refreshes at every start and
 * after every password change. No database, no SQLCipher, no native modules —
 * just Node's built-in fs/path/crypto plus Electron's DPAPI-backed
 * safeStorage, exactly like the main application uses.
 *
 * The file lives in the main application's data folder:
 *
 *   %APPDATA%\HyperFamily Branch Monitor\credentials.dat
 *
 * DPAPI ties the encryption to the Windows user, so the tool can only ever
 * read credentials on the same account that runs the application.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app, BrowserWindow, Menu, safeStorage } = require('electron')

const APP_DATA_FOLDER = 'HyperFamily Branch Monitor'
const CREDENTIALS_FILE = 'credentials.dat'
const FALLBACK_KEY_FILE = '.vault-key'

function fallbackKey(dir) {
  try {
    const key = fs.readFileSync(path.join(dir, FALLBACK_KEY_FILE))
    return key.length === 32 ? key : null
  } catch { return null }
}

function decryptValue(payload, dir) {
  if (!payload) return ''
  const text = String(payload)
  if (text.startsWith('dpapi:')) {
    return safeStorage.decryptString(Buffer.from(text.slice(6), 'base64'))
  }
  if (text.startsWith('aes:')) {
    const key = fallbackKey(dir)
    if (!key) throw new Error('the local encryption key is missing')
    const [, iv, tag, encrypted] = text.split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
  }
  return text
}

function readCredentials() {
  const dir = path.join(app.getPath('appData'), APP_DATA_FOLDER)
  const file = path.join(dir, CREDENTIALS_FILE)
  if (!fs.existsSync(file)) {
    return { error: 'No saved credentials were found on this computer. Open the HyperFamily application once (it refreshes this file at every start), then run this tool again.' }
  }
  try {
    const data = JSON.parse(decryptValue(fs.readFileSync(file, 'utf8'), dir) || '{}')
    const username = String(data.username || '').trim()
    const password = typeof data.password === 'string' ? data.password : ''
    if (!username) {
      return { error: 'The saved credentials are empty. Change the administrator password once inside the application, then run this tool again.' }
    }
    return { username, password: password || null }
  } catch (error) {
    return { error: `The saved credentials could not be decrypted (${error.message}). This tool only works for the same Windows user who runs the application.` }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}

function buildPage(result) {
  const row = (label, value, hint) => `
    <div class="row">
      <div class="cell">
        <div class="k">${label}</div>
        <div class="v${hint ? ' hint' : ''}">${hint ? hint : escapeHtml(value)}</div>
      </div>
      ${hint ? '' : `<button onclick="copyTo('${escapeHtml(value).replace(/'/g, "\\'")}', this)">Copy</button>`}
    </div>`

  const body = result.error
    ? `<div class="error">${escapeHtml(result.error)}</div>`
    : (row('Username', result.username) + row('Password', result.password || '', result.password ? null : 'not recorded — change the password once inside the application'))

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HyperFamily Credential Recovery</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #eef1f6; color: #222a35;
    padding: 20px 18px; min-height: 100vh; }
  h1 { font-size: 15px; }
  p.sub { font-size: 11px; color: #66707f; margin: 3px 0 14px; }
  .row { background: #ffffff; border: 1px solid #dbe1ea; border-radius: 10px;
    padding: 10px 14px; margin-bottom: 8px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px; }
  .k { font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .1em; color: #77828f; }
  .v { font-family: Consolas, monospace; font-size: 14px; word-break: break-all; margin-top: 2px; }
  .v.hint { color: #98a1af; font-family: inherit; font-size: 11px; }
  button { background: #3b6fd4; border: 0; color: #fff; font-weight: 700; font-size: 11px;
    padding: 6px 14px; border-radius: 7px; cursor: pointer; flex-shrink: 0; }
  button:hover { filter: brightness(1.08); }
  button.copied { background: #2e9e5b; }
  .error { background: #fdecec; border: 1px solid #f0c2c2; border-radius: 10px;
    padding: 14px; font-size: 12px; line-height: 1.6; color: #8c2f2f; }
  footer { margin-top: auto; font-size: 10px; color: #8a94a3; text-align: center; padding-top: 10px; }
</style>
</head>
<body>
  <h1>HyperFamily Credential Recovery</h1>
  <p class="sub">The administrator login saved on this computer</p>
  ${body}
  <footer>Works only for the Windows user who runs the application.</footer>
  <script>
    function copyTo(text, button) {
      navigator.clipboard.writeText(text).then(function () {
        var old = button.textContent
        button.textContent = 'Copied'
        button.classList.add('copied')
        setTimeout(function () { button.textContent = old; button.classList.remove('copied') }, 1400)
      })
    }
  </script>
</body>
</html>`
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const window = new BrowserWindow({
    width: 440,
    height: 300,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'HyperFamily Credential Recovery',
    backgroundColor: '#eef1f6',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => app.quit())
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPage(readCredentials()))}`)
})

app.on('window-all-closed', () => app.quit())
