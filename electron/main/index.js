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

if (process.argv.includes('--recovery')) require('./recovery-mode')
else require('./main-window')
