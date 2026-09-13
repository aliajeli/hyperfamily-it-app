/**
 * Entry point dispatcher.
 *
 *   hyperfamily.exe              → the full dashboard (main-window.js)
 *   hyperfamily.exe --recovery   → the small PIN-gated credential recovery
 *                                  window (recovery-mode.js), which recovers
 *                                  the forgotten local admin login. Installed
 *                                  shortcuts can point at this flag.
 *
 *   hyperfamily.exe --export-directory <path>
 *                                → headless directory snapshot (JSON) used by
 *                                  "Import from another workstation"; no
 *                                  window, exits when done.
 *
 * The recovery and export paths never touch the single-instance lock, so
 * they start fast and work while the dashboard is already running.
 */
'use strict'

const exportIndex = process.argv.indexOf('--export-directory')

if (exportIndex !== -1) require('./directory-export').runDirectoryExport(process.argv[exportIndex + 1])
else if (process.argv.includes('--recovery')) require('./recovery-mode')
else require('./main-window')
