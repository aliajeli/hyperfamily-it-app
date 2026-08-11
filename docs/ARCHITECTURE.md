# Architecture

## Process boundary

The application uses three trust zones:

1. **Next.js renderer** — interface and client state; no Node.js access.
2. **Preload bridge** — fixed method map built with `contextBridge`; no generic IPC primitive is exposed.
3. **Electron main process** — authentication sessions, SQLCipher, OS process launch, ping service, VPN, Excel, dialogs, and updates.

All persistent production operations flow through `ipcRenderer.invoke` → validated `ipcMain.handle` handlers. Browser development uses the same API shape backed by local seeded demo data.

## Static renderer delivery

`next.config.js` uses `output: 'export'`. Production registers the privileged `app://hyperfamily/` scheme and maps safe paths into `out/`. This avoids a local HTTP server in the packaged app. Path traversal is rejected before file reads.

## Database

`AppDatabase` wraps the synchronous Better-SQLite3 API. The multiple-ciphers build opens the file with a random 256-bit key before any schema query. On Windows, Electron's `safeStorage` protects the sidecar key with DPAPI.

Schema migrations are idempotent. Foreign keys, WAL, prepared statements, transactions, indexes, and bounded ping retention are enabled. The first launch creates `Admin` with a bcrypt hash of `Admin`.

### Legacy plaintext migration

If an existing database has a plaintext SQLite header, startup checkpoints it, encrypts a copy with SQLCipher, reopens that copy with the protected key, runs an integrity check, and only then swaps files while preserving the original as `.plaintext-backup`. On any export, validation, or swap failure, the plaintext source stays available and the next launch retries even if a database key was already created. Remove the plaintext backup only after validating the encrypted copy.

## Monitoring loop

`PingMonitor` uses `execFile` rather than a shell and checks all dashboard-visible devices in parallel. Each cycle:

1. Resolves response status and latency.
2. Writes a transaction to `ping_history` and daily `uptime_logs`.
3. Keeps the latest 1,000 ping rows per device.
4. Emits a complete renderer snapshot.
5. Reads the current interval and schedules the next cycle.

A failed cycle is audited and retried after five seconds.

## Remote launch policy

The renderer sends a method, device ID, and optional credential ID. The main process resolves all sensitive and executable data from trusted storage. It never accepts an arbitrary executable or command string from a dashboard card.

## Update chain

The public release API supplies metadata. Actual packaged downloads and installation use `electron-updater`. Production releases should be Authenticode-signed and created only by the protected tag workflow.
