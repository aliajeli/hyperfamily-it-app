/**
 * electron-builder afterPack hook.
 *
 * Electron ships Chromium locale packs (~100 files, ~40-50 MB unpacked) for
 * languages this app never uses. The UI is English-only, so keep en-US and
 * drop the rest from the packaged app before NSIS compresses it.
 */
const fs = require('fs')
const path = require('path')
const asar = require('@electron/asar')

const KEEP = new Set(['en-US.pak'])

exports.default = async function afterPack(context) {
  // The third-party fallback is now TS-only in Git. Check the packaged ASAR,
  // not just the working tree, so a missing compile step cannot ship a broken
  // SSH terminal when the native ssh2 engine is unavailable on a store PC.
  const archive = path.join(context.appOutDir, 'resources', 'app.asar')
  if (!fs.existsSync(archive)) throw new Error('The packaged application archive is missing')
  for (const file of [
    'electron/vendor/ssh2/lib/index.js',
    'electron/vendor/ssh2/lib/protocol/crypto.js',
    'electron/vendor/asn1/lib/index.js',
    'electron/vendor/bcrypt-pbkdf/index.js',
    'electron/vendor/safer-buffer/safer.js',
    'electron/vendor/tweetnacl/nacl-fast.js'
  ]) {
    if (!asar.extractFile(archive, file).length) throw new Error(`Missing packaged vendored module: ${file}`)
  }
  console.log('after-pack: verified compiled vendored SSH fallback in app.asar')

  const localesDir = path.join(context.appOutDir, 'locales')
  if (!fs.existsSync(localesDir)) return

  let removed = 0
  for (const file of fs.readdirSync(localesDir)) {
    if (KEEP.has(file) || !file.endsWith('.pak')) continue
    fs.rmSync(path.join(localesDir, file), { force: true })
    removed++
  }
  console.log(`after-pack: removed ${removed} unused Electron locale files (kept en-US)`)
}
