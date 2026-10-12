const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * electron/vendor/ssh2 is the pure-JavaScript fallback the terminal service
 * switches to when the native module cannot load (see terminal.service.js).
 * A silent npm update must never leave the fallback behind: when this test
 * fails, re-copy the library into electron/vendor/ (or consciously pin it
 * and update the expected version here).
 */
test('the vendored ssh2 fallback matches the npm dependency', () => {
  const vendor = require('../../electron/vendor/ssh2/package.json')
  const npm = require('ssh2/package.json')
  assert.equal(
    vendor.version,
    npm.version,
    `electron/vendor/ssh2 is ${vendor.version} but node_modules/ssh2 is ${npm.version} — re-vendor the fallback`
  )
})

/** Every checked-in TS source must have a CommonJS output for the packaged
 * fallback. The JS is generated at build time, never maintained in Git. */
test('the vendored TypeScript sources emit all required runtime JavaScript', () => {
  const root = path.join(__dirname, '../../electron/vendor')
  let checked = 0
  const visit = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name)
      if (item.isDirectory()) visit(file)
      else if (item.name.endsWith('.ts')) {
        assert.ok(fs.existsSync(file.replace(/\.ts$/, '.js')), `Missing built JS for ${file}`)
        checked++
      }
    }
  }
  visit(root)
  assert.equal(checked, 30)
  assert.equal(typeof require('../../electron/vendor/ssh2/lib/index.js').Client, 'function')
})
