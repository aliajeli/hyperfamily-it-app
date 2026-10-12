const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
  releaseInstaller,
  trustedAssetDownloadUrl,
  verifyAssetDigest
} = require('../../electron/services/update-security')

const version = '4.0.1-beta.1'
const asset = {
  name: `HyperFamily-Branch-Monitor-Setup-${version}.exe`,
  size: 1024,
  browser_download_url: `https://github.com/aliajeli/hyperfamily-it-app/releases/download/v${version}/HyperFamily-Branch-Monitor-Setup-${version}.exe`,
  digest: `sha256:${crypto.createHash('sha256').update('fixture').digest('hex')}`
}

test('only the release installer for the selected version can be used as fallback', () => {
  assert.equal(releaseInstaller(asset, version).name, asset.name)
  assert.equal(releaseInstaller({ ...asset, name: 'HyperFamilyStoreAgent.exe' }, version), null)
  assert.equal(releaseInstaller({ ...asset, name: '../update.exe' }, version), null)
  assert.equal(releaseInstaller({ ...asset, size: -1 }, version), null)
  assert.equal(
    releaseInstaller({ ...asset, browser_download_url: 'https://github.com.evil/download' }, version),
    null
  )
  assert.equal(releaseInstaller(asset, '4.0.2'), null)
})

test('fallback refuses missing or mismatched digests and untrusted redirects', () => {
  const digest = asset.digest.slice(7)
  assert.doesNotThrow(() => verifyAssetDigest(asset.digest, digest))
  assert.throws(() => verifyAssetDigest(null, digest), /no valid GitHub SHA-256/)
  assert.throws(() => verifyAssetDigest(asset.digest, '0'.repeat(64)), /does not match/)
  assert.equal(trustedAssetDownloadUrl(asset.browser_download_url), true)
  assert.equal(trustedAssetDownloadUrl('https://release-assets.githubusercontent.com/object'), true)
  assert.equal(trustedAssetDownloadUrl('http://github.com/download'), false)
  assert.equal(trustedAssetDownloadUrl('https://github.com.evil.com/download'), false)
  assert.equal(trustedAssetDownloadUrl('https://user@github.com/download'), false)
})
