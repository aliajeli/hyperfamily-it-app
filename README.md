# HyperFamily Branch Monitor

A secure, offline-first Windows desktop application for monitoring HyperFamily retail branches, checking critical device availability, maintaining asset inventory, and launching approved remote-support tools.

[![CI](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/ci.yml/badge.svg)](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/ci.yml)

## Highlights

- **Real-time monitoring** — parallel pings, live status cards, Router charts, active-alert notifications, and daily uptime aggregation.
- **Adaptive branch dashboard** — four-column branch cards, configurable compact behavior, and animated modal or side-panel equipment views.
- **Branch-first device directory** — compact branch and equipment cards, required Device Names and Warehouse Codes, one Router per branch, reliable editing, and normalized Switch port records.
- **Encrypted local database** — SQLCipher-compatible AES-256 SQLite encryption; database key protected with Windows DPAPI. Passwords are additionally encrypted at field level.
- **Secure remote actions** — RDP, TeamViewer, Winbox, browser management, and Termius SSH with audit logging.
- **Complete Excel workflow** — download one official workbook containing `Branches` plus a dedicated sheet for every supported equipment type, atomically import all records (including up to 48 ports per Switch), or export a filtered inventory workbook.
- **VPN controls** — FortiClient full VPN and reviewed OpenVPN split-tunnel profiles.
- **Eight Nord themes** — four light and four dark palettes built entirely from Nord colors.
- **Responsive operations UI** — coordinated desktop density for 1366×768 workstations plus adaptive navigation and layouts at smaller and larger resolutions.
- **Signed update path** — GitHub release discovery and `electron-updater` integration.
- **JavaScript only** — no TypeScript source files.

## Screens and routes

| Route | Purpose |
| --- | --- |
| `/login` | Local bcryptjs authentication (`Admin` / `Admin` on a fresh install) |
| `/dashboard` | Live branch health, Router charts, alert notifications, expandable equipment, and three-dot remote actions |
| `/devices` | Compact branch-first workflow, type-specific forms, managed Switch ports, and complete Excel import |
| `/inventory` | Search, filter, Warehouse Code, Template download, atomic import, and Excel export |
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

## Branch and device workflow

1. Open **Branches & devices** and create a branch or select an existing branch.
2. Select **Add device** for that branch.
3. Choose one of the ten device-type cards.
4. Complete only the fields shown for that equipment type, choose whether it appears on the Dashboard, and save.
5. Use the device card's edit action to revise the saved record later.

Branch records require Name, Code, and a case-insensitively unique Warehouse Code, with optional network-link and contact information. Every Device requires a saved Device Name, and each Branch can contain at most one Router. Equipment forms are deliberately type-specific. Switches support up to 48 unique managed port records, numbered 1–48, each containing Port Number, VLAN, Status, IP, and Details. Scale serial numbers, Warehouse Codes, Dashboard visibility, and Switch ports are included in encrypted persistence and Excel inventory exports.

To bulk-load a directory, select **Download Import Template**, complete `Branches` and the relevant dedicated equipment sheets (`Router`, `Switch`, `iLO`, `Server`, `NVR`, `AccessPoint`, `Scale`, `Client`, `Checkout`, and `POS`), then select **Import Excel**. Every equipment row has an explicit Branch Code association. The entire workbook is validated before a transaction starts; any invalid row cancels the complete import so no partial directory is saved. Legacy `Devices` and `Switch Ports` workbooks from earlier releases remain import-compatible.

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
dist/HyperFamily-Branch-Monitor-Setup-2.0.19.exe
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

### Credential recovery

Forgotten the administrator login? The installer places a small standalone tool next to the application:

```text
%LOCALAPPDATA%\Programs\hyperfamily-branch-monitor\HyperFamily-Credential-Recovery.exe
```

The application mirrors the administrator username and password into a tiny DPAPI-encrypted file (`credentials.dat`, inside `%APPDATA%\HyperFamily Branch Monitor\`) at every start and after every password change. The tool only reads that one file — no database access, no native modules — and shows the credentials in a plain window with Copy buttons. No desktop shortcut is created. It only works for the same Windows user who runs the application; installs upgraded from before v2.0.18 see a "change the password once" hint until the password is saved once. A standalone copy is also attached to every GitHub release.

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
- Ensure **Show on Dashboard** is enabled for the device.

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
