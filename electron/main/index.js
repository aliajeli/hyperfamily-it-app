/**
 * Entry point dispatcher.
 *
 *   hyperfamily.exe              → the full dashboard (main-window.js)
 *   hyperfamily.exe --recovery   → the small PIN-gated credential recovery
 *                                  window (recovery-mode.js), which recovers
 *                                  the forgotten local admin login. Installed
 *                                  shortcuts can point at this flag.
 *
 * The recovery path never touches the database, services or the
 * single-instance lock, so it starts fast and works while the dashboard is
 * already running.
 */
'use strict'

// The main process keeps a rotating file log (electron-log): every start,
// every uncaught fault. On a store PC this file is the black box that tells
// us what happened when something goes wrong far away.
const log = require('./logger')
log.info(
  `HyperFamily Branch Monitor ${require('../../package.json').version} starting (electron ${process.versions.electron}, win ${process.getSystemVersion?.() || 'n/a'})`
)
// A monitoring tool must survive a bad moment: log the fault, stay alive.
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception in main process:', error)
})
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection in main process:', reason)
})

if (process.argv.includes('--recovery')) require('./recovery-mode')
else require('./main-window')
