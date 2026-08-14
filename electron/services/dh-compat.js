'use strict'

/**
 * Diffie-Hellman compatibility shim for BoringSSL.
 *
 * Electron does not link OpenSSL — it links BoringSSL, which deleted the small
 * named MODP groups. `crypto.createDiffieHellmanGroup('modp1'|'modp2')` (and its
 * alias `getDiffieHellman`) therefore throw ERR_CRYPTO_UNKNOWN_DH_GROUP, whose
 * message is literally "Unknown DH group". ssh2 calls that function by name for
 * `diffie-hellman-group1-sha1`, which maps to modp2 and is still the only key
 * exchange many older switches offer, so connecting to such a switch fails in
 * the packaged app while working fine under plain Node (OpenSSL).
 *
 * v2.0.4 patched the *vendored* ssh2 copy, but `loadSshClient()` prefers the
 * real `ssh2` package (shipped unpacked next to the asar), so the patched code
 * never ran. Patching the crypto module itself fixes every caller at once:
 * real ssh2, the vendored fallback, and any transitive dependency.
 *
 * The groups are public constants from RFC 2409 / RFC 3526, so recreating them
 * with an explicit prime is exactly equivalent to the named lookup. Only the
 * groups BoringSSL actually dropped are patched; everything else is untouched.
 *
 * Must be required BEFORE anything requires ssh2, because ssh2 destructures
 * `createDiffieHellmanGroup` off the crypto module at load time.
 */

const crypto = require('crypto')

/** RFC 2409 Oakley groups 1 and 2, plus RFC 3526 group 5. Generator is 2. */
const FALLBACK_MODP_PRIMES = {
  modp1: // 768-bit, RFC 2409 First Oakley Group
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
    'E485B576625E7EC6F44C42E9A63A3620FFFFFFFFFFFFFFFF',
  modp2: // 1024-bit, RFC 2409 Second Oakley Group
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
    'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
    'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381' +
    'FFFFFFFFFFFFFFFF',
  modp5: // 1536-bit, RFC 3526 group 5
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
    'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
    'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
    'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
    '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
    '670C354E4ABC9804F1746C08CA237327FFFFFFFFFFFFFFFF'
}

const GENERATOR = Buffer.from([0x02])

let applied = false

/**
 * Installs the shim. Idempotent, and never throws: if a future Electron ships a
 * crypto module whose properties cannot be redefined, SSH simply behaves as it
 * does today rather than taking the whole app down at startup.
 */
function installDhCompat() {
  if (applied) return { patched: false, reason: 'already applied' }
  applied = true

  const original = crypto.createDiffieHellmanGroup
  if (typeof original !== 'function') return { patched: false, reason: 'crypto.createDiffieHellmanGroup missing' }

  // Nothing to do on an OpenSSL build that still knows the small groups.
  try {
    original('modp2')
    return { patched: false, reason: 'named MODP groups already supported' }
  } catch { /* BoringSSL — continue and patch. */ }

  const patched = function createDiffieHellmanGroup(name) {
    try {
      return original.call(crypto, name)
    } catch (error) {
      const prime = FALLBACK_MODP_PRIMES[String(name).toLowerCase()]
      if (!prime) throw error
      // Equivalent to the named group: same prime, same generator.
      return crypto.createDiffieHellman(Buffer.from(prime.replace(/\s+/g, ''), 'hex'), GENERATOR)
    }
  }

  const targets = ['createDiffieHellmanGroup', 'getDiffieHellman']
  const done = []
  for (const key of targets) {
    if (typeof crypto[key] !== 'function') continue
    try {
      Object.defineProperty(crypto, key, { value: patched, writable: true, configurable: true, enumerable: false })
      done.push(key)
    } catch { /* leave this alias alone */ }
  }

  return { patched: done.length > 0, functions: done }
}

module.exports = { installDhCompat, FALLBACK_MODP_PRIMES }
