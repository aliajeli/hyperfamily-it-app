const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeChannel,
  updaterFlags,
  evaluateChannelUpdate,
  isPrereleaseVersion
} = require('../electron/services/update-channel')

const stable300 = { tag_name: 'v3.0.0', prerelease: false, draft: false }
const beta10 = { tag_name: 'v3.0.1-beta.10', prerelease: true, draft: false }
const beta9 = { tag_name: 'v3.0.1-beta.9', prerelease: true, draft: false }
const draftBeta = { tag_name: 'v9.9.9-beta.1', prerelease: true, draft: true }

test('prerelease detection follows the version suffix', () => {
  assert.equal(isPrereleaseVersion('3.0.1-beta.10'), true)
  assert.equal(isPrereleaseVersion('3.0.0'), false)
  assert.equal(isPrereleaseVersion(''), false)
})

test('channel normalization keeps explicit choices and defaults by build type', () => {
  assert.equal(normalizeChannel('beta', '3.0.0'), 'beta')
  assert.equal(normalizeChannel('main', '3.0.1-beta.10'), 'main')
  // Nothing stored yet: betas follow beta, stable builds follow main.
  assert.equal(normalizeChannel(null, '3.0.1-beta.10'), 'beta')
  assert.equal(normalizeChannel(undefined, '3.0.0'), 'main')
  assert.equal(normalizeChannel('nonsense', '3.0.0'), 'main')
})

test('updater flags: beta allows prereleases, main allows downgrade only from a prerelease install', () => {
  assert.deepEqual(updaterFlags('beta', '3.0.1-beta.10'), { allowPrerelease: true, allowDowngrade: false })
  assert.deepEqual(updaterFlags('beta', '3.0.0'), { allowPrerelease: true, allowDowngrade: false })
  // The headline rule: a beta install on the main channel may go back down to stable.
  assert.deepEqual(updaterFlags('main', '3.0.1-beta.10'), { allowPrerelease: false, allowDowngrade: true })
  assert.deepEqual(updaterFlags('main', '3.0.0'), { allowPrerelease: false, allowDowngrade: false })
})

test('main channel only ever sees stable releases', () => {
  const result = evaluateChannelUpdate({ releases: [beta10, stable300], channel: 'main', currentVersion: '3.0.0' })
  assert.equal(result.latestVersion, '3.0.0')
  assert.equal(result.hasUpdate, false)
  assert.equal(result.release.prerelease, false)
})

test('beta channel picks the newest release including prereleases', () => {
  const result = evaluateChannelUpdate({ releases: [stable300, beta9, beta10], channel: 'beta', currentVersion: '3.0.1-beta.9' })
  assert.equal(result.latestVersion, '3.0.1-beta.10')
  assert.equal(result.hasUpdate, true)
  assert.equal(result.isDowngrade, false)
})

test('beta channel with a fresh install and no newer build reports no update', () => {
  const result = evaluateChannelUpdate({ releases: [stable300, beta10], channel: 'beta', currentVersion: '3.0.1-beta.10' })
  assert.equal(result.hasUpdate, false)
})

test('beta install on the main channel is offered the newest stable even though it is lower', () => {
  const result = evaluateChannelUpdate({ releases: [stable300, beta10], channel: 'main', currentVersion: '3.0.1-beta.10' })
  assert.equal(result.latestVersion, '3.0.0')
  assert.equal(result.hasUpdate, true)
  assert.equal(result.isDowngrade, true)
})

test('drafts are invisible on every channel', () => {
  const result = evaluateChannelUpdate({ releases: [draftBeta], channel: 'beta', currentVersion: '3.0.0' })
  assert.equal(result.release, null)
  assert.equal(result.hasUpdate, false)
})

test('empty release lists never count as an update', () => {
  assert.equal(evaluateChannelUpdate({ releases: [], channel: 'main', currentVersion: '3.0.1-beta.10' }).hasUpdate, false)
  assert.equal(evaluateChannelUpdate({ releases: null, channel: 'beta', currentVersion: '3.0.0' }).release, null)
})
