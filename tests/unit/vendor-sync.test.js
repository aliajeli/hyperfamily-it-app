const test = require('node:test')
const assert = require('node:assert/strict')

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
