# HyperFamily Branch Monitor

A secure, offline-first Windows desktop application for monitoring HyperFamily retail branches, checking critical device availability, maintaining asset inventory, and launching approved remote-support tools.

[![CI](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/ci.yml/badge.svg)](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/ci.yml)

## Highlights

- **Real-time monitoring** — parallel pings, live status cards, Router charts, active-alert notifications, and daily uptime aggregation.
- **Adaptive branch dashboard** — four-column branch cards, configurable compact behavior, and animated modal or side-panel equipment views.
- **Branch and device directory** — full CRUD for branches and 10 device types with adaptive forms.
- **Encrypted local database** — SQLCipher-compatible AES-256 SQLite encryption; database key protected with Windows DPAPI. Passwords are additionally encrypted at field level.
- **Secure remote actions** — RDP, TeamViewer, Winbox, browser management, and Termius SSH with audit logging.
- **Inventory export** — filtered, formatted `.xlsx` workbooks via ExcelJS.
- **VPN controls** — FortiClient full VPN and reviewed OpenVPN split-tunnel profiles.
- **Four Nord themes** — Aurora, Frost, Snow, and Polar Night.
- **Signed update path** — GitHub release discovery and `electron-updater` integration.
- **JavaScript only** — no TypeScript source files.

## Screens and routes

| Route | Purpose |
| --- | --- |
| `/login` | Local bcryptjs authentication (`Admin` / `Admin` on a fresh install) |
| `/dashboard` | Live branch health, Router charts, alert notifications, expandable equipment, and three-dot remote actions |
| `/devices` | Branch and device CRUD |
| `/inventory` | Search, filter, status snapshot, and Excel export |
| `/settings` | General, Dashboard display, credentials, device tools, VPN, and theme settings |
| `/about` | Build information, updates, stack, and support links |

## Technology

- Next.js 15 App Router + React 19
- Electron 41 (compatible with the requested Electron 33+ architecture)
- Tailwind CSS 3.4 + shadcn-style Radix primitives
- Framer Motion 11, Recharts 3, Zustand 4
- `better-sqlite3-multiple-ciphers` (Better-SQLite3 API + SQLCipher)
- bcryptjs, Windows DPAPI (`safeStorage`), optional keytar
- ExcelJS and electron-updater

## Requirements

### Development

- Node.js 22.12 or later
- npm 10+
- Windows 10/11 for Electron integration tests and native remote/VPN features

### Installed desktop app

- Windows 10/11 x64
- ICMP permitted to monitored endpoints
- Optional, depending on the features used:
  - TeamViewer
  - MikroTik Winbox
  - Termius
  - FortiClient enterprise CLI
  - OpenVPN

## Quick start

```bash
git clone https://github.com/aliajeli/hyperfamily-it-app.git
cd hyperfamily-it-app
npm install
npm run dev
```

Fresh database credentials:

```text
Username: Admin
Password: Admin
```

Change the default password immediately under **Settings → General**.

### Browser-only UI preview

```bash
npm run dev:next
```

The browser preview uses seeded local demo data and does **not** execute OS operations. Remote tools, Excel save dialogs, VPN control, DPAPI, and native database behavior are available only inside Electron.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run Next.js and Electron together |
| `npm run dev:next` | Run browser UI preview |
| `npm run build` | Build and statically export Next.js |
| `npm run build:electron` | Create the Windows NSIS installer |
| `npm run lint` | Run ESLint |
| `npm test` | Run platform-neutral unit tests |
| `npm run test:database` | Run encrypted database integration tests through Electron |
| `npm run format` | Format source with Prettier |

Native dependencies are rebuilt for the active Electron version during `postinstall`.

## Production build

On Windows PowerShell:

```powershell
npm ci
npm run lint
npm test
npm run test:database
npm run build:electron
```

Expected artifact:

```text
dist/HyperFamily-Branch-Monitor-Setup-1.0.0.exe
```

For a trusted organizational rollout, configure an Authenticode certificate before publishing. Unsigned installers will trigger Windows SmartScreen warnings.

## Data and encryption

Production data is stored under Electron's per-user `userData` directory, normally:

```text
%APPDATA%\HyperFamily Branch Monitor\
```

Important files:

- `hyperfamily-monitor.db` — encrypted SQLCipher database
- `.database-key` — random database key encrypted by Windows DPAPI
- `.vault-key` — fallback key only when OS encryption is unavailable

The app never commits runtime databases or secrets. Database keys are tied to the Windows user profile; include a controlled export/recovery process before moving data to another account or PC.

See [SECURITY.md](SECURITY.md) for the threat model and disclosure process.

## VPN setup

### Full VPN

Full mode searches for FortiClient enterprise executables in their standard locations and asks the installed CLI to connect. Fortinet CLI availability and arguments differ between managed editions; validate against the exact client distributed by your organization.

### Split tunnel

Split mode requires an approved `.ovpn` profile that contains:

- `route-nopull`
- At least one explicit RFC1918 route (`10/8`, `172.16/12`, or `192.168/16`)

The service refuses a profile that does not satisfy both checks. OpenVPN credentials are written to a temporary user-only file and deleted after the process exits.

> VPN and routing changes can require administrator privileges. Always test with a staging gateway before branch rollout.

## Remote tools

Select a device card's three-dot button on the Dashboard. Methods appear according to device type. Credential submenus are populated from **Settings → Device tools** mappings.

- **RDP** stores a target-scoped credential with `cmdkey.exe`, then launches `mstsc.exe`.
- **TeamViewer** uses the configured executable and the device remote ID.
- **Winbox** uses the configured executable, endpoint, and selected credential.
- **Browser** launches HTTP/HTTPS management in the default browser.
- **Termius** launches its registered URI scheme.

Every launch attempt, success, configuration change, login, and VPN event is written to `audit_logs`. Password values are never written to audit records.

## Auto-update and releases

The About page checks:

```text
https://github.com/aliajeli/hyperfamily-it-app/releases/latest
```

Tagged builds can be published by the included GitHub Actions release workflow. Configure repository Actions and code-signing secrets before enabling production auto-installation.

## Troubleshooting

### Native module ABI error

Run:

```bash
npx electron-builder install-app-deps
```

Database integration tests intentionally run through Electron because the native SQLite module is built for Electron's Node ABI.

### Dashboard devices remain unknown/offline

- Confirm ICMP is permitted by endpoint and branch firewalls.
- Confirm the IP/hostname is reachable from the workstation or connected VPN.
- Check the ping interval under Settings.
- Ensure **Show on monitoring dashboard** is enabled for the device.

### Remote executable not found

Use **Settings → Device tools** to select the installed `.exe`. The application does not download third-party remote tools.

### Database cannot be opened after moving profiles

The database key is protected for the originating Windows account. Restore it under that account, or restore from an approved application-level backup. Do not copy only the `.db` file.

## Project structure

```text
electron/           Main process, preload, services, encrypted database
app/                Next.js routes
components/         UI, layout, dashboard, forms, settings
stores/             Zustand stores
lib/                Constants, API adapter, browser demo, utilities
tests/              Unit and Electron database integration tests
docs/               Architecture and Windows validation plan
.github/workflows/  CI and tagged release automation
```

## Validation status

The repository includes a passing static Next.js production build, ESLint configuration, pure unit tests, encrypted database integration tests, and Windows CI definitions. Hardware-dependent behavior—FortiClient, OpenVPN routes, RDP, TeamViewer, Winbox, Termius, real ICMP targets, code signing, and NSIS installation—must be validated on a clean Windows 10/11 machine with the organization's actual tools and network policies before production deployment.

See [docs/WINDOWS-TEST-PLAN.md](docs/WINDOWS-TEST-PLAN.md).

## Developer

**Ali Ajeli Lahiji**<br>
IT Specialist — HyperFamily Retail Stores

Repository: <https://github.com/aliajeli/hyperfamily-it-app>

Application support and reproducible bug reports are tracked through the repository's GitHub Issues page. Follow `SECURITY.md` for private vulnerability reporting.

## License

MIT — see [LICENSE](LICENSE).
