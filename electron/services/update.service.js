const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

const { compareVersions } = require('./version')

class UpdateService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('download-progress', (progress) => this.sendEvent('update:event', { type: 'progress', percent: progress.percent, transferred: progress.transferred, total: progress.total }))
    autoUpdater.on('update-downloaded', (info) => this.sendEvent('update:event', { type: 'downloaded', version: info.version }))
    autoUpdater.on('error', (error) => this.sendEvent('update:event', { type: 'error', message: error.message }))
  }

  async check() {
    const currentVersion = app.getVersion()
    const response = await fetch('https://api.github.com/repos/aliajeli/hyperfamily-it-app/releases/latest', { headers: { 'User-Agent': 'HyperFamily-Branch-Monitor', Accept: 'application/vnd.github+json' } })
    if (response.status === 404) return { currentVersion, latestVersion: currentVersion, hasUpdate: false, releaseNotes: 'No published release found yet.' }
    if (!response.ok) throw new Error(`GitHub update check failed (${response.status})`)
    const release = await response.json()
    const latestVersion = String(release.tag_name || '').replace(/^v/, '')
    const asset = release.assets?.find((item) => item.name.endsWith('.exe'))
    return { currentVersion, latestVersion, hasUpdate: compareVersions(latestVersion, currentVersion) > 0, releaseNotes: release.body || '', publishedAt: release.published_at, downloadUrl: asset?.browser_download_url || null }
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
