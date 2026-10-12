/**
 * File logging for the main process, built on electron-log.
 *
 * The log lives at %APPDATA%\HyperFamily Branch Monitor\logs\main.log and
 * rotates at 5 MB (keeping main.old.log), so a field machine always carries
 * a recent, sendable history — the app's "black box" for diagnosing crashes
 * and IPC failures on store PCs without remote access.
 */
const log = require('electron-log/main')

log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'info'

module.exports = log
