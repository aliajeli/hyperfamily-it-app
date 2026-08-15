const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { app, shell } = require('electron')
const { autoUpdater } = require('electron-updater')

const { compareVersions } = require('./version')

const RELEASES_API = 'https://api.github.com/repos/aliajeli/hyperfamily-it-app/releases'
const REQUEST_HEADERS = { 'User-Agent': 'HyperFamily-Branch-Monitor', Accept: 'application/vnd.github+json' }

/**
 * Update flow
 * -----------
 * The button in About walks through three states that this service drives:
 *
 *   "Download vX"  ->  "Downloading NN%"  ->  "Install and restart"
 *
 * Downloading is attempted with electron-updater first because it supports
 * differential downloads. When anything in that pipeline fails — a checksum
 * mismatch, a signature check, a missing latest.yml, a provider hiccup — the
 * service falls back to fetching the release installer straight from GitHub
 * instead of surfacing an error and leaving the user stuck. Either way the
 * result is a ready installer on disk and a "downloaded" event, so pressing
 * Install always ends with the new version running.
 */
class UpdateService {
  constructor(sendEvent) {
    this.sendEvent = sendEvent
    this.status = { ...UpdateService.idleStatus() }
    this.installerPath = null

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.disableWebInstaller = true
    // Differential downloads are the whole point of the update flow: the
    // installer is ~180 MB, but a release that only changes the renderer
    // bundle transfers a few megabytes of changed blocks because
    // electron-updater diffs the new .blockmap against the installed one.
    // Keep this false, and never let a downgrade trigger a full re-download.
    autoUpdater.disableDifferentialDownload = false
    autoUpdater.allowDowngrade = false
    autoUpdater.logger = null
    // The installer is not code signed yet, so Authenticode verification would
    // reject every download with ERR_UPDATER_INVALID_SIGNATURE. Skip it until a
    // certificate is configured (CSC_LINK / CSC_KEY_PASSWORD).
    if (typeof autoUpdater.verifyUpdateCodeSignature !== 'undefined') {
      autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null)
    }

    // autoUpdater is a module-level singleton. Clearing our channels first
    // keeps a second UpdateService (a reload in development, for instance)
    // from emitting every event twice.
    autoUpdater.removeAllListeners('download-progress')
    autoUpdater.removeAllListeners('update-downloaded')
    autoUpdater.removeAllListeners('error')

    autoUpdater.on('download-progress', (progress) => {
      this.reportProgress({
        transferred: progress.transferred || 0,
        total: progress.total || 0,
        // electron-updater measures the rate itself; trust it when present.
        bytesPerSecond: progress.bytesPerSecond
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.markDownloaded(info?.version || null, autoUpdater.downloadedUpdateHelper?.file || null, false)
    })
    // Errors are not forwarded raw any more: download() decides whether the
    // fallback can still rescue the update before the user is told anything.
    autoUpdater.on('error', (error) => { this.lastUpdaterError = error })
  }

  /** The shape every idle/reset status uses, so no field can go missing. */
  static idleStatus() {
    return {
      downloading: false,
      downloaded: false,
      percent: 0,
      version: null,
      viaFallback: false,
      transferred: 0,
      total: 0,
      remaining: 0,
      bytesPerSecond: 0,
      etaSeconds: null
    }
  }

  emit(payload) {
    this.sendEvent('update:event', payload)
  }

  /**
   * Single place where download progress is turned into the numbers the About
   * page shows: how much has arrived, how much is left, how fast it is going,
   * and how long that implies.
   *
   * The rate is smoothed over a short window rather than measured chunk to
   * chunk, because raw per-chunk timings jump around enough to make the
   * on-screen speed unreadable.
   */
  reportProgress({ transferred, total, bytesPerSecond }) {
    const now = Date.now()
    if (!this.rateWindow || this.rateWindow.start > now) this.resetRate(transferred, now)

    let rate = Number(bytesPerSecond) || 0
    if (!rate) {
      const elapsed = (now - this.rateWindow.time) / 1000
      if (elapsed >= 0.4) {
        const instant = (transferred - this.rateWindow.bytes) / elapsed
        // Exponential smoothing; first sample seeds the average outright.
        rate = this.rateWindow.rate ? this.rateWindow.rate * 0.7 + instant * 0.3 : instant
        this.rateWindow = { ...this.rateWindow, time: now, bytes: transferred, rate }
      } else {
        rate = this.rateWindow.rate
      }
    } else {
      this.rateWindow = { ...this.rateWindow, time: now, bytes: transferred, rate }
    }

    const safeTotal = total > 0 ? total : 0
    const remaining = safeTotal ? Math.max(0, safeTotal - transferred) : 0
    this.status.downloading = true
    this.status.percent = safeTotal
      ? Math.max(0, Math.min(100, Math.round((transferred / safeTotal) * 100)))
      : 0
    this.status.transferred = transferred
    this.status.total = safeTotal
    this.status.remaining = remaining
    this.status.bytesPerSecond = Math.max(0, Math.round(rate))
    this.status.etaSeconds = rate > 1024 && remaining ? Math.round(remaining / rate) : null

    this.emit({
      type: 'progress',
      percent: this.status.percent,
      transferred,
      total: safeTotal,
      remaining,
      bytesPerSecond: this.status.bytesPerSecond,
      etaSeconds: this.status.etaSeconds
    })
  }

  resetRate(bytes = 0, now = Date.now()) {
    this.rateWindow = { start: now, time: now, bytes, rate: 0 }
  }

  markDownloaded(version, installerPath, viaFallback) {
    const total = this.status.total || 0
    this.status = {
      ...UpdateService.idleStatus(),
      downloaded: true,
      percent: 100,
      version,
      viaFallback,
      transferred: total,
      total
    }
    if (installerPath) this.installerPath = installerPath
    this.emit({ type: 'downloaded', version, viaFallback, total })
  }

  /** Lets the UI restore the Download/Install button after a page change. */
  state() {
    return { ...this.status, canInstall: this.status.downloaded, isPackaged: app.isPackaged }
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

    this.latestInstaller = installer
      ? { url: installer.browser_download_url, name: installer.name, size: installer.size, version: latestVersion }
      : null

    // Remember the size so the progress bar has a total even before the first
    // byte arrives, and so the check result can advertise the download size.
    if (installer?.size && !this.status.downloading && !this.status.downloaded) {
      this.status.total = installer.size
    }

    return {
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      releaseNotes: notes,
      publishedAt: newest.item.published_at,
      downloadUrl: installer?.browser_download_url || newest.item.html_url || null,
      downloadSize: installer?.size || 0,
      downloadName: installer?.name || null,
      ...this.state()
    }
  }

  async download() {
    if (!app.isPackaged) throw new Error('Update downloads are enabled in packaged builds only')
    if (this.status.downloading) throw new Error('A download is already running')
    if (this.status.downloaded) return this.state()

    const knownTotal = this.latestInstaller?.size || this.status.total || 0
    this.status = { ...UpdateService.idleStatus(), downloading: true, total: knownTotal, remaining: knownTotal }
    this.resetRate(0)
    this.lastUpdaterError = null
    this.emit({ type: 'progress', percent: 0, transferred: 0, total: knownTotal, remaining: knownTotal, bytesPerSecond: 0, etaSeconds: null })

    try {
      const result = await this.downloadWithUpdater()
      if (result) return this.state()
    } catch (error) {
      this.lastUpdaterError = error
    }

    // electron-updater could not finish. Fetch the installer from the release
    // page instead so the user still gets the update.
    try {
      await this.downloadFromGitHub()
      return this.state()
    } catch (error) {
      this.status = { ...UpdateService.idleStatus() }
      const detail = this.lastUpdaterError?.message ? ` (${this.lastUpdaterError.message})` : ''
      const message = `${error.message}${detail}`
      this.emit({ type: 'error', message })
      throw new Error(message)
    }
  }

  /** electron-updater path: differential download when possible. */
  async downloadWithUpdater() {
    let updaterError = null
    const onError = (error) => { updaterError = error }
    autoUpdater.on('error', onError)
    try {
      const checkResult = await autoUpdater.checkForUpdates()
      if (!checkResult?.updateInfo) throw new Error('electron-updater found no update metadata')
      // A differential pass writes only the changed blocks; if the blockmap is
      // missing or unusable electron-updater silently falls back to the full
      // file, so this stays a single call either way.
      const files = await autoUpdater.downloadUpdate(checkResult.cancellationToken)
      if (updaterError) throw updaterError
      const file = (Array.isArray(files) ? files.find((item) => String(item).toLowerCase().endsWith('.exe')) || files[0] : null) || null
      if (file) this.installerPath = file
      if (!this.status.downloaded) this.markDownloaded(checkResult.updateInfo.version, file, false)
      return true
    } finally {
      autoUpdater.removeListener('error', onError)
    }
  }

  /** Fallback path: stream the release .exe from GitHub with progress. */
  async downloadFromGitHub() {
    if (!this.latestInstaller?.url) await this.check()
    const asset = this.latestInstaller
    if (!asset?.url) throw new Error('No Windows installer is attached to the latest release')

    const response = await fetch(asset.url, { headers: { 'User-Agent': REQUEST_HEADERS['User-Agent'] }, redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`Downloading the installer failed (${response.status})`)

    const total = Number(response.headers.get('content-length')) || asset.size || 0
    const directory = path.join(app.getPath('temp') || os.tmpdir(), 'hyperfamily-branch-monitor-update')
    fs.mkdirSync(directory, { recursive: true })
    const target = path.join(directory, asset.name)
    const partial = `${target}.part`
    const handle = fs.createWriteStream(partial)

    let transferred = 0
    let lastEmit = 0
    this.status.total = total
    this.resetRate(0)
    try {
      for await (const chunk of response.body) {
        transferred += chunk.length
        if (!handle.write(Buffer.from(chunk))) await new Promise((resolve) => handle.once('drain', resolve))
        // Emit on a timer rather than per chunk: often enough for a smooth
        // readout, rarely enough not to flood the IPC channel.
        const now = Date.now()
        if (now - lastEmit >= 250) {
          lastEmit = now
          this.reportProgress({ transferred, total })
        }
      }
      this.reportProgress({ transferred, total })
      await new Promise((resolve, reject) => handle.end((error) => (error ? reject(error) : resolve())))
    } catch (error) {
      handle.destroy()
      try { fs.unlinkSync(partial) } catch { /* nothing to clean up */ }
      throw new Error(`Downloading the installer failed: ${error.message}`)
    }

    if (total && transferred !== total) {
      try { fs.unlinkSync(partial) } catch { /* nothing to clean up */ }
      throw new Error('The downloaded installer is incomplete')
    }

    try { fs.rmSync(target, { force: true }) } catch { /* nothing to replace */ }
    fs.renameSync(partial, target)
    this.markDownloaded(asset.version, target, true)
    return target
  }

  /**
   * Applies the downloaded update and brings the app back up on the new
   * version. electron-updater's own quit-and-install is preferred; when the
   * fallback download was used the NSIS installer is launched directly with
   * the same arguments electron-updater would have passed.
   */
  install() {
    if (!app.isPackaged) throw new Error('Update installation is enabled in packaged builds only')
    if (!this.status.downloaded) throw new Error('Download the update first')

    // Give the renderer a moment to paint "Installing…" and let this IPC call
    // return before the app tears itself down.
    if (!this.status.viaFallback) {
      setImmediate(() => {
        try {
          autoUpdater.quitAndInstall(false, true)
        } catch {
          // quitAndInstall refuses when it cannot locate its own cached file.
          try { this.runInstaller() } catch { /* reported below by the UI timeout */ }
        }
      })
      return { success: true, method: 'updater' }
    }

    // The installer must exist before we promise anything to the caller.
    const installer = this.installerPath
    if (!installer || !fs.existsSync(installer)) throw new Error('The downloaded installer is no longer on disk; download it again')
    setImmediate(() => { try { this.runInstaller() } catch { /* nothing left to try */ } })
    return { success: true, method: 'installer' }
  }

  runInstaller() {
    const installer = this.installerPath
    if (!installer || !fs.existsSync(installer)) throw new Error('The downloaded installer is no longer on disk; download it again')

    // "--updated" tells the electron-builder NSIS script this is an upgrade,
    // "/S" runs it without prompts, "--force-run" relaunches the app after.
    // The one-click per-user NSIS target needs no elevation, so this whole
    // sequence completes without a wizard or a UAC dialog.
    try {
      const child = spawn(installer, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false })
      child.unref()
    } catch {
      // Last resort: hand the file to the shell so the user can click through.
      shell.openPath(installer)
    }

    setTimeout(() => { app.removeAllListeners('window-all-closed'); app.quit() }, 1200)
  }
}

module.exports = { UpdateService, compareVersions }
