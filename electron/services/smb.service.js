const { execFile } = require('child_process')

/**
 * Cross-domain access to the checkouts.
 *
 * The operator workstation is joined to one domain (gig) while the checkouts
 * live in another (okcs), and the two do not trust each other. Windows will
 * therefore refuse every \\host\C$ access with "Access is denied" unless an
 * explicit SMB session is established first with credentials valid in the
 * TARGET domain. That is exactly what `net use \\host\IPC$ /user:okcs\admin`
 * does: once the session exists, all later UNC access to that host — file
 * reads, copies, and the remote registry — rides on it.
 *
 * Windows allows only ONE set of credentials per server at a time, so an
 * already-open session (for example one Explorer opened) must be torn down
 * before ours is created, and sessions are reference-counted so parallel
 * version checks against the same host share a single mount.
 */

const HOST_PATTERN = /^[a-zA-Z0-9._-]{1,253}$/

/** Runs a command, always resolving, never hanging longer than `timeoutMs`. */
function run(command, args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (error, stdout = '', stderr = '') => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr), timedOut: Boolean(error?.killed) })
    })
  })
}

/** `okcs` + `administrator` → `okcs\administrator`; a domain already typed into the username wins. */
function qualifyUser(domain, username) {
  const user = String(username || '').trim()
  const dom = String(domain || '').trim().replace(/\\+$/, '')
  if (!user) return ''
  if (user.includes('\\') || user.includes('@')) return user
  return dom ? `${dom}\\${user}` : user
}

class SmbSessionManager {
  constructor(options = {}) {
    this.exec = options.exec || run
    this.platform = options.platform || process.platform
    // host (lowercase) → { count, ready: Promise<void> }
    this.sessions = new Map()
  }

  /** Credentials as stored in Settings → Target access. */
  static credentialsFrom(settings = {}) {
    return {
      domain: String(settings.target_domain || '').trim(),
      username: String(settings.target_admin_user || '').trim(),
      password: String(settings.target_admin_password || '')
    }
  }

  #normalizeHost(host) {
    const clean = String(host || '').trim().replace(/^\\+/, '').replace(/[\\/].*$/, '')
    if (!clean || !HOST_PATTERN.test(clean)) throw new Error(`Invalid host name “${host}”`)
    return clean
  }

  async #connect(host, credentials) {
    const user = qualifyUser(credentials.domain, credentials.username)
    // Drop whatever session Windows may already hold for this server —
    // otherwise `net use` fails with 1219 (multiple connections not allowed).
    await this.exec('net', ['use', `\\\\${host}\\IPC$`, '/delete', '/y'], 15000)
    const result = await this.exec('net', ['use', `\\\\${host}\\IPC$`, credentials.password, `/user:${user}`, '/persistent:no'], 25000)
    if (!result.ok) {
      const message = (result.stderr || result.stdout || '').replace(/\s+/g, ' ').trim()
      if (result.timedOut) throw new Error(`Timed out opening an SMB session to ${host}`)
      if (/1326|logon failure|user name or password/i.test(message)) {
        throw new Error(`${host} rejected the credentials for ${user} — check Settings → Target access`)
      }
      if (/1219/.test(message)) throw new Error(`${host} already has a session with different credentials; sign out of it and retry`)
      throw new Error(`Could not open an SMB session to ${host} — ${message || 'net use failed'}`)
    }
  }

  /**
   * Runs `task` with an authenticated session to `host` held open, then
   * releases it. Concurrent callers for the same host share one session.
   * With no credentials configured the task simply runs on the caller's own
   * identity, which is what a same-domain deployment needs.
   */
  async withHost(host, credentials, task) {
    const clean = this.#normalizeHost(host)
    const usable = this.platform === 'win32' && credentials && credentials.username && credentials.password
    if (!usable) return task()

    const key = clean.toLowerCase()
    let entry = this.sessions.get(key)
    if (!entry) {
      entry = { count: 0, ready: this.#connect(clean, credentials) }
      this.sessions.set(key, entry)
    }
    entry.count += 1
    try {
      await entry.ready
      return await task()
    } finally {
      entry.count -= 1
      if (entry.count <= 0) {
        this.sessions.delete(key)
        // Best effort: a dangling session would block the next run's /user:.
        this.exec('net', ['use', `\\\\${clean}\\IPC$`, '/delete', '/y'], 15000).catch(() => {})
      }
    }
  }

  /** Verifies the stored credentials against one host, for the Settings "Test" button. */
  async test(host, credentials) {
    const clean = this.#normalizeHost(host)
    if (this.platform !== 'win32') throw new Error('Target access can only be tested on Windows')
    if (!credentials.username || !credentials.password) throw new Error('Enter a username and password first')
    const startedAt = Date.now()
    await this.#connect(clean, credentials)
    const probe = await this.exec('cmd', ['/c', 'dir', `\\\\${clean}\\C$`], 20000)
    await this.exec('net', ['use', `\\\\${clean}\\IPC$`, '/delete', '/y'], 15000)
    if (!probe.ok) throw new Error(`Signed in to ${clean} but the C$ admin share is not reachable — is the account a local administrator there?`)
    return { ok: true, host: clean, user: qualifyUser(credentials.domain, credentials.username), durationMs: Date.now() - startedAt }
  }

  /** Releases every session this process opened (called on app quit). */
  async releaseAll() {
    const hosts = [...this.sessions.keys()]
    this.sessions.clear()
    await Promise.all(hosts.map((host) => this.exec('net', ['use', `\\\\${host}\\IPC$`, '/delete', '/y'], 10000).catch(() => {})))
  }
}

module.exports = { SmbSessionManager, qualifyUser }
