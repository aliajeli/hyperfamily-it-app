const test = require('node:test')
const assert = require('node:assert/strict')
const { compareVersions } = require('../../electron/services/version')

test('compares semantic release versions', () => {
  assert.equal(compareVersions('1.2.0', '1.1.9'), 1)
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.9', '1.1.0'), -1)
  assert.equal(compareVersions('2.0', '1.99.99'), 1)
})

test('stable releases supersede prereleases with the same numeric version', () => {
  assert.equal(compareVersions('4.0.0', '4.0.0-beta.1'), 1)
  assert.equal(compareVersions('4.0.0-beta.1', '4.0.0'), -1)
  assert.equal(compareVersions('4.0.0-beta.2', '4.0.0-beta.1'), 1)
  assert.equal(compareVersions('4.0.0-rc.1', '4.0.0-beta.9'), 1)
})
