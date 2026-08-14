/**
 * Regression tests for the SSH key exchange used to reach older switches.
 *
 * These MUST run under Electron (`npm run test:database` style, via
 * ELECTRON_RUN_AS_NODE), because the bug they guard only exists on BoringSSL:
 * plain Node links OpenSSL, still knows the small named MODP groups, and would
 * pass even with the fix removed.
 *
 * History: v2.0.4 patched the vendored ssh2 copy, but the real `ssh2` package
 * is loaded first and ships unpacked in the installer, so the fix never ran and
 * "Unknown DH group" persisted in the field. The tests below therefore check
 * the crypto layer and drive a real handshake with the *real* package.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { generateKeyPairSync } = require('node:crypto')

const { installDhCompat, FALLBACK_MODP_PRIMES } = require('../electron/services/dh-compat')

installDhCompat()

/** Groups ssh2 asks for by name; group1-sha1 maps to modp2. */
const REQUIRED_GROUPS = ['modp1', 'modp2', 'modp5']

test('every MODP group ssh2 can request is available', () => {
  for (const name of REQUIRED_GROUPS) {
    const group = crypto.createDiffieHellmanGroup(name)
    assert.ok(group, `${name} should be constructible`)
    const bits = Buffer.from(group.getPrime('hex'), 'hex').length * 8
    assert.equal(bits, { modp1: 768, modp2: 1024, modp5: 1536 }[name])
    assert.equal(group.getGenerator('hex').replace(/^0+/, ''), '2')
  }
})

test('getDiffieHellman resolves the same groups', () => {
  for (const name of REQUIRED_GROUPS) {
    assert.equal(
      crypto.getDiffieHellman(name).getPrime('hex').toUpperCase(),
      FALLBACK_MODP_PRIMES[name].replace(/\s+/g, '').toUpperCase()
    )
  }
})

test('a fallback group still agrees on a shared secret', () => {
  const alice = crypto.createDiffieHellmanGroup('modp2')
  const bob = crypto.createDiffieHellmanGroup('modp2')
  const alicePublic = alice.generateKeys()
  const bobPublic = bob.generateKeys()
  const aliceSecret = alice.computeSecret(bobPublic)
  const bobSecret = bob.computeSecret(alicePublic)
  assert.ok(aliceSecret.length > 0)
  assert.deepEqual(aliceSecret, bobSecret)
})

test('installDhCompat is idempotent', () => {
  const before = crypto.createDiffieHellmanGroup
  installDhCompat()
  installDhCompat()
  assert.equal(crypto.createDiffieHellmanGroup, before)
  assert.ok(crypto.createDiffieHellmanGroup('modp2'))
})

test('unknown group names still raise the original error', () => {
  assert.throws(() => crypto.createDiffieHellmanGroup('modp-nonexistent'))
})

/**
 * The real end-to-end check: the SSH engine the app actually loads must
 * complete a handshake with a server that only offers the legacy algorithms an
 * old switch offers. This is the exact scenario that produced the user-visible
 * "Unknown DH group" error.
 */
test('the app\'s SSH engine connects using diffie-hellman-group1-sha1', async () => {
  const terminal = require('../electron/services/terminal.service.js')
  const Client = terminal.loadSshClient()
  const { Server } = require('ssh2')

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
  })

  const legacy = {
    kex: ['diffie-hellman-group1-sha1'],
    cipher: ['aes128-cbc', '3des-cbc'],
    serverHostKey: ['ssh-rsa'],
    hmac: ['hmac-sha1']
  }

  const server = new Server({ hostKeys: [privateKey], algorithms: legacy }, (client) => {
    client.on('error', () => {})
    client.on('authentication', (ctx) => ctx.accept())
    client.on('ready', () => client.on('session', (accept) => {
      const session = accept()
      session.on('pty', (respond) => respond && respond())
      session.on('shell', (respond) => respond().write('SW#\r\n'))
    }))
  })
  server.on('error', () => {})

  try {
    const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
    const banner = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('handshake timed out')), 20000)
      const client = new Client()
      client.on('ready', () => client.shell({ term: 'xterm' }, (error, stream) => {
        if (error) { clearTimeout(timer); return reject(error) }
        stream.on('data', (data) => {
          if (!data.toString().includes('SW#')) return
          clearTimeout(timer)
          client.end()
          resolve(data.toString().trim())
        })
      }))
      client.on('error', (error) => { clearTimeout(timer); reject(error) })
      client.connect({
        host: '127.0.0.1',
        port,
        username: 'admin',
        password: 'pw',
        readyTimeout: 15000,
        algorithms: legacy
      })
    })
    assert.match(banner, /SW#/)
  } finally {
    server.close()
  }
})
