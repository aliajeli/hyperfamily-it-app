/**
 * electron-builder afterPack hook.
 *
 * Electron ships Chromium locale packs (~100 files, ~40-50 MB unpacked) for
 * languages this app never uses. The UI is English-only, so keep en-US and
 * drop the rest from the packaged app before NSIS compresses it.
 */
const fs = require('fs')
const path = require('path')

const KEEP = new Set(['en-US.pak'])

exports.default = async function afterPack(context) {
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
