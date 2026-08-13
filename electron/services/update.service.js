const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

const { compareVersions } = require('./version')

const RELEASES_API = 'https://api.github.com/repos/aliajeli/hyperfamily-it-app/releases'
const REQUEST_HEADERS = { 'User-Agent': 'HyperFamily-Branch-Monitor', Accept: 'application/vnd.github+json' }

class UpdateService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    // The installer is not code signed yet, so Authenticode verification would
    // reject every download with ERR_UPDATER_INVALID_SIGNATURE. Skip it until a
    // certificate is configured (CSC_LINK / CSC_KEY_PASSWORD).
    if (typeof autoUpdater.verifyUpdateCodeSignature !== 'undefined') {
      autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null)
    }
    autoUpdater.on('download-progress', (progress) => this.sendEvent('update:event', { type: 'progress', percent: progress.percent, transferred: progress.transferred, total: progress.total }))
    autoUpdater.on('update-downloaded', (info) => this.sendEvent('update:event', { type: 'downloaded', version: info.version }))
    autoUpdater.on('error', (error) => this.sendEvent('update:event', { type: 'error', message: error.message }))
  }

  async check() {
    const currentVersion = app.getVersion()
    const response = await fetch(`${RELEASES_API}?per_page=20`, { headers: REQUEST_HEADERS })
    if (response.status === 404) return { currentVersion, latestVersion: currentVersion, hasUpdate: false, releaseNotes: 'No published release found yet.' }
    if (!response.ok) throw new Error(`GitHub update check failed (${response.status})`)

    const releases = await response.json()
    const published = (Array.isArray(releases) ? releases : []).filter((item) => item && !item.draft && !item.prerelease)
    if (!published.length) return { currentVersion, latestVersion: currentVersion, hasUpdate: false, releaseNotes: 'No published release found yet.' }

    // A tag can carry more than one release when a publish run races with
    // itself, and the installer may sit on either of them. Pick the newest
    // version, then merge every release sharing that tag so the .exe is found
    // regardless of which one it was attached to.
    const newest = published
      .map((item) => ({ item, version: String(item.tag_name || '').replace(/^v/, '') }))
      .sort((a, b) => compareVersions(b.version, a.version))[0]

    const sameTag = published.filter((item) => item.tag_name === newest.item.tag_name)
    const assets = sameTag.flatMap((item) => item.assets || [])
    const installer = assets.find((item) => item.name.toLowerCase().endsWith('.exe'))
    const notes = sameTag.map((item) => item.body).find(Boolean) || ''
    const latestVersion = newest.version

    return {
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      releaseNotes: notes,
      publishedAt: newest.item.published_at,
      downloadUrl: installer?.browser_download_url || newest.item.html_url || null
    }
  }

  async download() {
    if (!app.isPackaged) throw new Error('Update downloads are enabled in packaged builds only')
    await autoUpdater.checkForUpdates()
    return autoUpdater.downloadUpdate()
  }

  install() {
    if (!app.isPackaged) throw new Error('Update installation is enabled in packaged builds only')
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 0)
    return { success: true }
  }
}

module.exports = { UpdateService, compareVersions }
