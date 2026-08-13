const net = require('node:net')
const { Client } = require('ssh2')

const safeHost = /^[a-zA-Z0-9.-]{1,253}$/
const MAX_SESSIONS = 12

// Telnet negotiation bytes.
const IAC = 255
const DONT = 254
const DO = 253
const WONT = 252
const WILL = 251
const SB = 250
const SE = 240
const ECHO = 1
const SUPPRESS_GO_AHEAD = 3
const TERMINAL_TYPE = 24
const NAWS = 31

/**
 * Answers Telnet option negotiation so the switch drops into character mode and
 * stops asking, then returns the printable payload only.
 */
function negotiateTelnet(socket, chunk, state) {
  const output = []
  let index = 0
  while (index < chunk.length) {
    const byte = chunk[index]
    if (byte !== IAC) { output.push(byte); index += 1; continue }

    const command = chunk[index + 1]
    if (command === undefined) break
    if (command === IAC) { output.push(IAC); index += 2; continue }

    if (command === SB) {
      let end = index + 2
      while (end < chunk.length && !(chunk[end] === IAC && chunk[end + 1] === SE)) end += 1
      const option = chunk[index + 2]
      if (option === TERMINAL_TYPE) {
        socket.write(Buffer.from([IAC, SB, TERMINAL_TYPE, 0, ...Buffer.from('xterm-256color'), IAC, SE]))
      }
      index = end + 2
      continue
    }

    const option = chunk[index + 2]
    if (option === undefined) break
    if (command === DO || command === DONT) {
      const supported = [TERMINAL_TYPE, NAWS, SUPPRESS_GO_AHEAD].includes(option)
      socket.write(Buffer.from([IAC, command === DO && supported ? WILL : WONT, option]))
      if (command === DO && option === NAWS) {
        const { cols = 80, rows = 24 } = state
        socket.write(Buffer.from([IAC, SB, NAWS, 0, cols & 0xff, 0, rows & 0xff, IAC, SE]))
      }
    } else if (command === WILL || command === WONT) {
      const wanted = [ECHO, SUPPRESS_GO_AHEAD].includes(option)
      socket.write(Buffer.from([IAC, command === WILL && wanted ? DO : DONT, option]))
    }
    index += 3
  }
  return Buffer.from(output)
}

/**
 * SSH and Telnet sessions for the in-app terminal. One instance per application
 * run; sessions are keyed by an id handed back to the renderer, and every
 * session is bound to the renderer that opened it so a stale window cannot
 * write into somebody else's shell.
 */
class TerminalService {
  constructor(database, sendToRenderer) {
    this.database = database
    this.send = sendToRenderer
    this.sessions = new Map()
    this.counter = 0
  }

  emit(sessionId, channel, payload) {
    const session = this.sessions.get(sessionId)
    if (!session || session.sender.isDestroyed()) return
    session.sender.send(channel, { sessionId, ...payload })
  }

  targets() {
    return this.database.listTerminalTargets()
  }

  resolve(deviceId) {
    const device = this.database.getDevice(deviceId)
    if (!device) throw new Error('Device not found')
    if (device.device_type !== 'Switch') throw new Error('The in-app terminal is available for switches')
    if (!safeHost.test(device.ip || '')) throw new Error('Unsafe or invalid device address')
    const credential = this.database.resolveDeviceCredential(deviceId)
    if (!credential) throw new Error('Assign a credential to switches in Settings \u2192 Credentials first')
    const settings = (() => { try { return this.database.getSettings() } catch { return {} } })()
    const transport = device.transport === 'telnet' ? 'telnet' : 'ssh'
    const fallbackPort = transport === 'telnet' ? (settings.terminal_telnet_port || 23) : (settings.terminal_ssh_port || 22)
    return {
      device,
      credential,
      transport,
      port: Number(device.connection_port) || Number(device.port) || fallbackPort
    }
  }

  open({ deviceId, cols = 80, rows = 24 }, sender, actor = 'Admin') {
    if (this.sessions.size >= MAX_SESSIONS) throw new Error(`At most ${MAX_SESSIONS} terminal sessions can be open at once`)
    const { device, credential, transport, port } = this.resolve(deviceId)
    this.counter += 1
    const sessionId = `term-${this.counter}`
    const meta = {
      sessionId, sender, transport,
      deviceId: device.id,
      name: device.name || device.device_type,
      host: device.ip,
      port,
      username: credential.username,
      cols, rows,
      client: null, socket: null, stream: null,
      closed: false
    }
    this.sessions.set(sessionId, meta)

    const target = `${meta.name} (${meta.host}:${port})`
    this.database.audit(actor, `${transport.toUpperCase()}_OPEN`, target, `Credential: ${credential.name}`)

    if (transport === 'telnet') this.openTelnet(meta, credential)
    else this.openSsh(meta, credential)

    return { sessionId, transport, host: meta.host, port, name: meta.name, username: credential.username }
  }

  openSsh(meta, credential) {
    const client = new Client()
    meta.client = client

    client.on('ready', () => {
      this.emit(meta.sessionId, 'terminal:status', { state: 'connected' })
      client.shell({ term: 'xterm-256color', cols: meta.cols, rows: meta.rows }, (error, stream) => {
        if (error) { this.fail(meta, error.message); return }
        meta.stream = stream
        stream.on('data', (chunk) => this.emit(meta.sessionId, 'terminal:data', { data: chunk.toString('utf8') }))
        stream.stderr?.on('data', (chunk) => this.emit(meta.sessionId, 'terminal:data', { data: chunk.toString('utf8') }))
        stream.on('close', () => this.close(meta.sessionId, 'Session closed by the device'))
      })
    })

    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => credential.password))
    })
    client.on('error', (error) => this.fail(meta, this.friendly(error)))
    client.on('close', () => this.close(meta.sessionId))

    this.emit(meta.sessionId, 'terminal:status', { state: 'connecting' })
    client.connect({
      host: meta.host,
      port: meta.port,
      username: credential.username,
      password: credential.password,
      tryKeyboard: true,
      readyTimeout: 15000,
      keepaliveInterval: 20000,
      // Switches in the field are often old; allow their legacy algorithms.
      algorithms: {
        kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512', 'diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1', 'diffie-hellman-group-exchange-sha1'],
        cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', 'aes192-cbc', 'aes256-cbc', '3des-cbc'],
        serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-dss'],
        hmac: ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
      }
    })
  }

  openTelnet(meta, credential) {
    const state = { cols: meta.cols, rows: meta.rows, sentUser: false, sentPass: false, buffer: '' }
    const socket = net.createConnection({ host: meta.host, port: meta.port })
    meta.socket = socket
    socket.setTimeout(20000)
    this.emit(meta.sessionId, 'terminal:status', { state: 'connecting' })

    socket.on('connect', () => {
      socket.setTimeout(0)
      this.emit(meta.sessionId, 'terminal:status', { state: 'connected' })
    })

    socket.on('data', (chunk) => {
      const clean = negotiateTelnet(socket, chunk, state)
      if (!clean.length) return
      const text = clean.toString('utf8')
      this.emit(meta.sessionId, 'terminal:data', { data: text })

      // Answer the classic login/password prompts once each.
      state.buffer = (state.buffer + text).slice(-200)
      const tail = state.buffer.toLowerCase()
      if (!state.sentUser && /(user\s?name|login|user)\s*[:>]\s*$/.test(tail)) {
        state.sentUser = true
        socket.write(`${credential.username}\r\n`)
      } else if (state.sentUser && !state.sentPass && /password\s*[:>]\s*$/.test(tail)) {
        state.sentPass = true
        socket.write(`${credential.password}\r\n`)
      }
    })

    socket.on('timeout', () => this.fail(meta, 'The device did not answer in time'))
    socket.on('error', (error) => this.fail(meta, this.friendly(error)))
    socket.on('close', () => this.close(meta.sessionId))
  }

  friendly(error) {
    const message = error?.message || String(error)
    if (/ECONNREFUSED/.test(message)) return 'Connection refused \u2014 the service is not listening on that port'
    if (/EHOSTUNREACH|ENETUNREACH/.test(message)) return 'The device is unreachable from this network'
    if (/ETIMEDOUT|timed out/i.test(message)) return 'The connection timed out'
    if (/All configured authentication methods failed/i.test(message)) return 'Authentication failed \u2014 check the credential assigned to switches'
    return message
  }

  write(sessionId, data, sender) {
    const session = this.owned(sessionId, sender)
    if (session.stream) session.stream.write(data)
    else if (session.socket && !session.socket.destroyed) session.socket.write(data)
    return true
  }

  resize(sessionId, { cols, rows }, sender) {
    const session = this.owned(sessionId, sender)
    session.cols = cols
    session.rows = rows
    if (session.stream) session.stream.setWindow(rows, cols, 0, 0)
    else if (session.socket && !session.socket.destroyed) {
      session.socket.write(Buffer.from([IAC, SB, NAWS, 0, cols & 0xff, 0, rows & 0xff, IAC, SE]))
    }
    return true
  }

  owned(sessionId, sender) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('That terminal session is no longer open')
    if (sender && session.sender !== sender) throw new Error('That terminal session belongs to another window')
    return session
  }

  fail(meta, message) {
    this.emit(meta.sessionId, 'terminal:status', { state: 'error', message })
    this.close(meta.sessionId, message)
  }

  close(sessionId, reason = '') {
    const session = this.sessions.get(sessionId)
    if (!session || session.closed) return true
    session.closed = true
    try { session.stream?.end() } catch { /* already gone */ }
    try { session.client?.end() } catch { /* already gone */ }
    try { session.socket?.destroy() } catch { /* already gone */ }
    this.emit(sessionId, 'terminal:status', { state: 'closed', message: reason })
    this.sessions.delete(sessionId)
    return true
  }

  closeAllFor(sender) {
    for (const [id, session] of [...this.sessions]) if (session.sender === sender) this.close(id, 'Window closed')
  }

  stop() {
    for (const id of [...this.sessions.keys()]) this.close(id, 'Application closing')
  }
}

module.exports = { TerminalService, negotiateTelnet }
