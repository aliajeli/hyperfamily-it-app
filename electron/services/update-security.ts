const crypto = require('node:crypto')

// GitHub supplies this digest for each release asset. It is useful for
// verifying download integrity, but is NOT a publisher signature: anyone able
// to replace the release asset and its API metadata can replace both.
function releaseInstaller(asset, version) {
  if (!asset || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) return null
  const name = `HyperFamily-Branch-Monitor-Setup-${version}.exe`
  if (asset.name !== name || !Number.isSafeInteger(asset.size) || asset.size <= 0) return null
  try {
    const url = new URL(asset.browser_download_url)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.username ||
      url.password ||
      !url.pathname.startsWith('/aliajeli/hyperfamily-it-app/releases/download/')
    )
      return null
  } catch {
    return null
  }
  return {
    url: asset.browser_download_url,
    name,
    size: asset.size,
    version,
    digest: asset.digest || null
  }
}

function trustedAssetDownloadUrl(url) {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(
        parsed.hostname
      )
    )
  } catch {
    return false
  }
}

function verifyAssetDigest(digest, actual) {
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(digest)) {
    throw new Error('The release has no valid GitHub SHA-256 digest; fallback install refused')
  }
  const expected = Buffer.from(digest.slice(7), 'hex')
  const received = Buffer.from(actual, 'hex')
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new Error('The downloaded installer SHA-256 does not match the release asset')
  }
}

module.exports = { releaseInstaller, trustedAssetDownloadUrl, verifyAssetDigest }
