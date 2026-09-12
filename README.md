# HyperFamily Branch Monitor — 3.1.0

A Windows desktop workspace for HyperFamily retail IT: branch connectivity monitoring, device and asset inventory, remote support, and verified checkout application deployment.

[![CI](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/ci.yml)
[![Release](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/release.yml/badge.svg)](https://github.com/aliajeli/hyperfamily-it-app/actions/workflows/release.yml)

**Stable version:** `3.1.0` · **Stable branch:** `main` · **Platform:** Windows 10/11 x64 · **License:** MIT

## Contents

- [Download and install](#download-and-install)
- [What is included in 3.1.0](#what-is-included-in-310)
- [First-run checklist](#first-run-checklist)
- [Screens and settings](#screens-and-settings)
- [Branches, devices and Excel](#branches-devices-and-excel)
- [Store App deployment and native Agent](#store-app-deployment-and-native-agent)
- [Remote access and VPN](#remote-access-and-vpn)
- [Data, credentials and recovery](#data-credentials-and-recovery)
- [Technology and architecture](#technology-and-architecture)
- [Development and Windows builds](#development-and-windows-builds)
- [Tests and validation](#tests-and-validation)
- [Releases and updates](#releases-and-updates)
- [Troubleshooting](#troubleshooting)
- [Documentation, support and license](#documentation-support-and-license)

## Download and install

Use the [3.1.0 release page](https://github.com/aliajeli/hyperfamily-it-app/releases/tag/v3.1.0) for the exact release, or [latest stable release](https://github.com/aliajeli/hyperfamily-it-app/releases/latest) for subsequent stable versions.

| Release file | Purpose |
| --- | --- |
| [HyperFamily-Branch-Monitor-Setup-3.1.0.exe](https://github.com/aliajeli/hyperfamily-it-app/releases/download/v3.1.0/HyperFamily-Branch-Monitor-Setup-3.1.0.exe) | Main Windows installer; includes the desktop app with integrated credential recovery, plus the native Agent bundle |
| `HyperFamilyStoreAgent.exe` | Standalone checkout Windows Service binary; normally installed using the desktop Import action |
| `HyperFamilyStoreAgent.exe.sha256` | SHA-256 checksum of the standalone Agent |
| Installer `.blockmap` and `latest.yml` | Update metadata; not additional programs to install |

### Management workstation

- Windows 10/11 **x64**.
- Network/VPN reachability to the branches and DNS resolution for configured hostnames.
- ICMP access for monitoring; Windows admin-share and remote service-management access for checkout Agent deployment.
- Install only the external clients you actually use, such as FortiClient, TeamViewer, Winbox or Termius. They are not downloaded or bundled by this project. Windows RDP uses the system client.
- Node.js, CMake, a .NET runtime and compiler tools are **not installation prerequisites** for the packaged desktop app. Build prerequisites are listed separately below.

Run the setup program under the Windows account that will operate the app. The installer is per-user and creates desktop/Start menu shortcuts. Installing the desktop app does not, by itself, grant administrator rights on remote checkouts.

### Upgrade from the approved beta

Version **3.1.0** supersedes the `3.0.1-beta.x` line and carries the same or newer features, so the updater offers it to beta installs normally. Users of a beta older than beta.10 can close the app and run the **3.1.0 installer manually** instead.

Before installing, close the app and make an approved backup of its data and key files. Use the same Windows account and installation identity. Do not delete the application data or assume that a database copied to another account can be decrypted. After installation, confirm **3.1.0** in About and check your saved branches, product selection, deployment destination and target account.

Existing Agent installations remain in place until explicitly imported again. Install the new desktop build **before** importing its bundled Agent; an older desktop still carries its own older Agent.

## What is included in 3.1.0

This stable release includes the approved Beta work through beta.10:

- **Branch monitoring:** parallel reachability checks, live status, response charts, active alerts, uptime information and configurable dashboard presentation.
- **Device inventory:** ten equipment types, branch/warehouse associations, switch port records, filtering and workbook import/export.
- **Remote operations:** configurable connection methods and credential assignments, in-app SSH terminal, web management and external remote-support tools.
- **Checkout updates:** installed-software inventory, per-checkout and bulk Agent Import, product selection and verified update-file deployment.
- **Small native Agent:** C++17/Win32 service rather than a bundled .NET application; starts automatically before interactive login. Recent release binaries are approximately 200 KB, with an enforced 2 MiB build limit. This is the **Agent size**, not the Electron installer size.
- **WAN-aware Import:** progress-sensitive timeouts, matching-hash copy skipping, staged replacement, service repair/startup and rollback handling.
- **Organized settings:** General contains application account/recovery and monitoring settings. The new **Store App** tab contains deployment destination and checkout administrator access.
- **Refreshed About:** compact product card, package-derived version, audited technology credits, update controls and support links.
- **Local data and customization:** encrypted SQLite storage, per-field secret protection, PIN-gated recovery, multiple light/dark themes, custom colors, fonts, scaling and operational notes.

On top of the beta line, 3.1.0 cuts the Windows installer from roughly 300 MB to about 100 MB (the separate recovery app is now integrated into the desktop app), and adds a selectable **main/beta update channel** in About. The stable release also aligns the desktop manifests and removes the native Agent's Windows prerelease flag for stable builds. See [3.1.0 release notes](docs/release-3.1.0.md).

## First-run checklist

1. Install the desktop app and sign in. A **new database** starts with username `Admin` and password `Admin`.
2. Immediately change that login in **Settings → General**. Set a 4–8 digit credential-recovery PIN and store it securely.
3. Add branches and devices manually or import the official Excel template.
4. Configure monitoring and Dashboard behavior to suit the branch network.
5. Configure saved remote credentials, their assignments and device-type connection methods.
6. Open **Settings → Store App**, verify the checkout-local destination, and enter the account used to access checkouts. Use **Test access** against one known checkout.
7. In **Update Store App**, import the Agent to **one test checkout** and verify inventory before performing a wider rollout.
8. Confirm the installed product/version, deploy a test update and verify the result on that checkout.

The local application administrator login and the remote checkout administrator account are **different settings**. Changing one does not change the other.

## Screens and settings

| Route | Purpose |
| --- | --- |
| `/login` | Local sign-in, remember-account option and PIN-gated credential recovery |
| `/dashboard` | Branch health, gateway/device response charts, alerts and remote actions |
| `/dashboard/gateway` | Gateway-focused monitoring view |
| `/devices` | Branches, equipment records, type-specific forms and Excel workflows |
| `/inventory` | Searchable inventory, warehouse information and workbook export/import |
| `/terminal` | In-app SSH sessions |
| `/store-update` | Installed product/version checks, Agent Import and update-file deployment |
| `/notes` | Operational notes |
| `/settings` | Application, checkout, connectivity and appearance settings |
| `/about` | Product/version information, updates with main/beta channel choice, technology credits and support |

### Settings tabs

| Tab | Configuration |
| --- | --- |
| **General** | Application administrator username/password, recovery PIN, ping interval and chart history |
| **Store App** | Deploy destination folder; target domain, administrator username/password; checkout access test |
| **Dashboard** | Dashboard display and interaction preferences |
| **Credentials** | Saved remote-access credentials |
| **Assignments** | Credential mappings to equipment types/devices |
| **Connections** | Enabled connection methods and default method per equipment type |
| **Device tools** | External client/tool configuration |
| **Terminal & web** | Terminal and device web preferences |
| **VPN** | FortiClient and gateway settings/diagnostics |
| **Theme** | Light/dark themes and custom colors |
| **Fonts** | Typography and interface sizing |

**Product name in Programs and Features is no longer a Settings field.** Choose the installed product on **Update Store App**. Saving the deployment destination changes only `store_update_path` and preserves the selected product.

## Branches, devices and Excel

Branches have a name, branch code and case-insensitively unique warehouse code, plus optional network/contact information. Each device belongs to a branch and has a saved device name.

Supported equipment types:

`Router` · `Switch` · `iLO` · `Server` · `NVR` · `AccessPoint` · `Scale` · `Client` · `Checkout` · `POS`

- Forms expose fields appropriate to the selected device type.
- Each branch can have at most one Router.
- Switches support up to 48 unique ports, numbered 1–48, with VLAN, status, IP and details.
- Device records can be included in or excluded from the Dashboard.
- Scale serial numbers, warehouse codes and switch ports are retained in persistence and inventory workflows.

### Workbook workflow

1. Download the application's official import template.
2. Complete the `Branches` sheet and the relevant dedicated equipment sheets.
3. Associate equipment rows using the branch code.
4. Import the completed workbook and resolve validation errors, if any.
5. Export inventory as needed and treat the exported workbook as sensitive operational data.

The workbook is validated before a database transaction starts. Invalid rows cancel the import rather than leave a partially imported directory. Legacy `Devices` and `Switch Ports` workbooks remain supported by the importer. Prefer the current template for new workbooks.

## Store App deployment and native Agent

### Roles and layout

The desktop app orchestrates operations from the management workstation. Each checkout runs the native inventory Agent as a Windows Service:

| Property | Value |
| --- | --- |
| Executable | `C:\Agent\HyperFamilyStoreAgent.exe` |
| Service name | `HyperFamilyStoreAgent` |
| Service account | `NT AUTHORITY\LocalService` |
| Startup | Automatic; no interactive login or Startup-folder shortcut required |
| Inventory source | Machine-wide Programs and Features registry entries, both 64-bit and 32-bit views |
| Heartbeat | Approximately every 15 seconds; includes process/instance identity and sequence |
| Protocol | Version 1; same inventory/import contract retained from the beta service |
| Implementation | Native x64 C++17/Win32, static CRT; no separately installed .NET or VC++ Redistributable required |

The Agent publishes a local inventory snapshot which the desktop reads through authenticated Windows admin shares. It is **not an HTTP server** and does not require a new custom inbound Agent port. Windows SMB and remote Service Control Manager connectivity still need to be allowed by organizational policy.

### Target access

In **Settings → Store App → Target access**, configure an account with local administrator rights on the checkout. For untrusted/different domains, use the target domain plus username, or a domain-qualified username/UPN as appropriate.

- The password field is never prefilled.
- Leaving it blank when a password is already stored **retains** that secret.
- Entering a new password replaces the saved secret only when you save.
- **Test access** tests the typed credential when supplied, otherwise the stored one; it does not save changes.
- The destination and target-account saves are separate; saving either does not reset the installed-product selection.
- Credentials are stored encrypted at rest and used for Windows authentication. The app does not claim that credentials are isolated from all processes running as the same Windows user.

### Import Agent

Use **Import Agent** on one checkout card, or **Import Agent to all** after the single-checkout test passes.

The importer compares SHA-256 before copying and copies only missing/different binaries. It uses staging, integrity checks, controlled service stop/start and rollback handling. An identical binary skips the copy but can still have its service configuration repaired/restarted. Check the operation summary rather than assuming that “copy skipped” means no service operation occurred.

A missing or stopped Agent is gated with the exact message:

```text
Agent is not running
```

Do not double-click the standalone Agent expecting a setup wizard. Use the desktop Import workflow. A running service with an inventory-read error is distinct from a stopped service; inspect the reported error rather than treating it as an empty software list.

### Slow branch links

Agent hash/copy operations use a **120-second no-progress timeout** and a **30-minute maximum duration per protected transfer operation**. Progress resets the idle timeout; these are not guarantees for total multi-checkout completion time.

The same rules apply when connecting **from outside the store over VPN**: the agent heartbeat/inventory read runs under a 45-second *no-data* deadline (progress keeps it alive) with a 5-minute ceiling, the post-import WAIT for the first agent heartbeat allows up to 5 minutes, and remote service-control calls allow 45-120 seconds per operation instead of LAN-sized values. A busy/slow tunnel therefore slows the steps down instead of failing them.

The first replacement of an older bundled-runtime Agent may still need to read/hash the old approximately 75 MB file. Later native-Agent transfers and comparisons are much smaller. Do not remove integrity checks or disable endpoint protection to work around a slow or blocked operation.

### Deploy an application update

1. Confirm that the Agent is running and the expected installed product/version is selected.
2. Check the destination, for example `C:\Store Commerce\Updates`, in **Settings → Store App**. It is a local path **on each checkout**, not on the management workstation.
3. Select the update file and review the intended targets.
4. Run deployment and inspect per-checkout progress and the final summary.
5. Verify the deployed file/application behavior on the target before expanding the rollout.

The deployment pipeline performs reachability checks, a Jalali-dated backup of an existing destination file, copy and SHA-256 verification, with retry/error reporting. Agent Import and application-file deployment are separate operations; copying an update file does not itself guarantee that the target application's own update/install procedure has completed.

## Remote access and VPN

Configure available methods under **Connections**, credentials under **Credentials / Assignments**, and executable paths under **Device tools**.

- **RDP:** launches Windows `mstsc.exe`; credentials can be registered for the specific target using Windows Credential Manager.
- **TeamViewer / Winbox:** use the locally installed, configured client and the selected device/credential.
- **Web management:** device HTTP/HTTPS access follows the configured browser/web preference.
- **SSH:** the application includes an ssh2-based terminal; external Termius integration is also available where configured.

The current VPN implementation supports **global/system FortiClient VPN**. It launches the installed client so the operator can complete the connection, then observes the tunnel adapter. Merely finding a FortiClient process is not treated as a successful VPN connection. Settings includes gateway test/diagnostic support.

Older documentation referring to an application-level proxy tunnel or OpenVPN split-tunnel mode describes superseded behavior; those are **not current supported connection modes**. FortiClient editions, gateway TLS policy, permissions and endpoint restrictions vary, so validate with the organization's actual client and gateway.

## Data, credentials and recovery

### Local storage and backups

Operational data is stored in an encrypted SQLite database in Electron's per-user `userData` directory under `%APPDATA%`. The directory identity can differ between development and packaged execution; do not assume that the recovery-file folder is always the database folder.

Important files include:

- `hyperfamily-monitor.db` — SQLCipher-compatible encrypted operational database.
- `.database-key` — database key protected through the application's vault.
- `.vault-key` — fallback encryption key when OS-backed encryption is unavailable.

Electron `safeStorage` uses Windows DPAPI where available. The vault includes an AES-256-GCM fallback. That fallback is not equivalent to hardware-backed or cross-user isolation; protect access to the workstation and its files.

Close the application before a file-level backup and retain the required keys along with the database. A copied `.db` alone is not sufficient. DPAPI-protected keys normally require the originating Windows account/profile. Keep Excel exports, inventory snapshots and backup files under appropriate access controls.

### Credential recovery

The local application login is verified using bcryptjs. For PIN-gated recovery, the app also maintains an encrypted recoverable copy of the administrator credential. Set a **4–8 digit recovery PIN** in **Settings → General**.

Two recovery paths use that PIN:

1. **Recover credentials** on the login screen.
2. **Recovery mode** of the installed desktop app: run `HyperFamily-Branch-Monitor.exe --recovery` (or `npm run recovery` in development). The same PIN-gated window opens from the main executable — a separate recovery app is no longer bundled or attached to releases. A standalone build remains available via `npm run build:recovery` if ever needed.

The recovery file has a canonical location:

```text
%APPDATA%\HyperFamily Branch Monitor\credentials.dat
```

Recovery reads that file under the same Windows user; it does not bypass DPAPI or provide access to another account's database. The PIN is scrypt-hashed. Five wrong attempts lock recovery for five minutes. Without a configured PIN, credentials are not revealed. Older upgraded profiles may need the application password saved once before a recoverable copy is available.

### Security boundaries

- Renderer Node integration is disabled and context isolation is enabled; the renderer is **not configured as a fully sandboxed process**.
- The preload bridge and authenticated IPC mediate desktop operations.
- This is an administrative workstation tool, not a zero-trust remote-access broker. Same-user malware, privileged local processes and some external-client command lines remain relevant threats.
- Use least-privilege accounts, endpoint protection, disk encryption and controlled branch firewall rules. Do not expose Windows admin shares or service management directly to the public internet.
- Do not assume a downloaded release is Authenticode-signed. Signing depends on configured release secrets; update signature enforcement is currently disabled in the packaging configuration. Verify organizational signing/allowlisting requirements before unattended rollout.
- Never commit passwords, PATs, production databases, VPN profiles, real inventory exports or signing keys. See [SECURITY.md](SECURITY.md).

## Technology and architecture

The desktop UI is a statically exported Next.js application loaded by Electron. Main-process services handle native operations and encrypted persistence through a preload IPC boundary. The separate native Agent handles checkout-local registry inventory and heartbeat publication.

| Layer | Technologies actually used |
| --- | --- |
| UI/runtime | Next.js 15, React 19, Electron 41 and its bundled Node.js runtime |
| Interface | Tailwind CSS, custom Radix UI components, Framer Motion, Lucide and Sonner |
| State/forms/charts | Zustand, React Hook Form + Zod, Recharts |
| Data/security | better-sqlite3-multiple-ciphers / SQLCipher, bcryptjs, Windows DPAPI, AES-256-GCM |
| Operations | ssh2, ExcelJS, Windows SMB/SCM and SHA-256 |
| Native Agent | C++17 / Win32; static CRT |
| Delivery/build | electron-updater, electron-builder / NSIS, CMake / MSVC |

About's 24 technology credits are maintained in [`lib/technology-stack.json`](lib/technology-stack.json). Selected framework major labels and the displayed application version derive from the package manifest. Installed-but-unused dependencies are not automatically advertised as part of the active production stack. The desktop/frontend source uses JavaScript/JSX; the Agent uses C++, not JavaScript.

```text
app/                    Next.js routes
components/             UI, layout, forms, dashboard and settings
stores/                 Zustand stores
lib/                    Constants, themes, typography, IPC/browser API adapter
agent/                  Native Windows service, CMake resources and C++ tests
electron/main/          Electron lifecycle, preload and IPC handlers
electron/database/      Encrypted persistence and migrations
electron/services/      Monitoring, deployment, terminal, VPN and other OS services
electron/recovery/      Shared credential recovery core, page and optional standalone shell
electron/scripts/       Native Agent build and binary verification
tests/                  Unit, Electron, Windows service and browser checks
docs/                   Architecture, release notes and validation guides
.github/workflows/      CI, Beta prerelease and stable tag-release automation
```

## Development and Windows builds

### Build-machine requirements

- Node.js **22.12 or newer**, npm and Git.
- Windows 10/11 x64 for the native app, Windows integration tests and installers.
- CMake **3.20+**, Visual Studio C++ Build Tools and the Windows SDK for the Agent and native modules.
- No .NET SDK or NuGet restore is required to build the native Agent.

```powershell
git clone https://github.com/aliajeli/hyperfamily-it-app.git
cd hyperfamily-it-app
git switch main
npm ci
npm run dev
```

`postinstall` rebuilds native dependencies for Electron. Do not run Electron-native database tests under an unrelated system Node ABI.

### Browser-only preview

```sh
npm run dev:next
```

This uses browser-local demo data and simulated operations, not real Windows authentication, DPAPI, service installation, VPN or branch deployment. Do not enter production credentials into a browser demo. The production/static UI can be generated with `npm run build` and served from `out/`.

### Reproducible local installer sequence

Run on Windows PowerShell:

```powershell
npm ci
npm run build:agent
npm run lint
npm test
npm run test:database
npm run test:ssh
npm run test:vpn
npm run test:template
npm run build
npx electron-builder --win nsis --x64 --publish never
```

(`npm run build:recovery` remains available to build the optional standalone recovery tool; it is no longer needed for the installer.)

Expected installer:

```text
dist/HyperFamily-Branch-Monitor-Setup-3.1.0.exe
```

The Agent bundle is embedded via `extraResources` and must be built before packaging.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js and Electron development processes |
| `npm run dev:next` | Browser-only UI preview |
| `npm run build` | Next.js production build/static export |
| `npm run build:agent` | Windows x64 CMake/MSVC build, C++ tests, native PE/size checks and SHA sidecar |
| `npm run build:recovery` | Build standalone recovery executable |
| `npm run build:electron` | Build Agent + frontend + desktop installer; build recovery first |
| `npm start` | Start Electron with the available app build |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm test` | Node unit/contract tests; some checks are conditional on Windows/artifact availability |
| `npm run test:database` | Encrypted database integration through Electron |
| `npm run test:ssh` | SSH compatibility integration through Electron |
| `npm run test:vpn` | VPN service integration through Electron |
| `npm run test:template` | Excel template/import integration through Electron |
| `npm run test:agent` | Explicitly opted-in real Windows Agent/service tests |

## Tests and validation

The beta line passed its Windows CI/release pipelines, the Node unit test suite (96 tests), native Agent service tests and browser regression checks. Version 3.1.0 additionally checks stable Windows version-resource flags, consistent desktop/recovery manifests and the update-channel logic with dedicated unit tests. Release-specific CI results remain the authoritative build evidence; simulated tests do not certify every physical checkout or gateway.

### Real Windows service tests

Run only in an **isolated, elevated Windows test environment**, not on a production checkout:

```powershell
npm run build:agent
$env:HF_AGENT_WINDOWS_TEST = '1'
npm run test:agent
Remove-Item Env:HF_AGENT_WINDOWS_TEST
```

These tests create temporary registry fixtures and a real service at `C:\Agent`. They verify Unicode inventory, both registry views, binary version/flags, LocalService/Automatic configuration, heartbeat advancement, hash-skip re-import and stopped-service detection. They refuse a pre-existing Agent installation. GitHub's ephemeral Windows runners perform this opt-in automatically.

### Optional browser checks

After a production build, serve `out/` on port 3000 in another terminal:

```sh
npm install --no-save --package-lock=false @playwright/test
npx playwright install chromium
node tests/settings-about.playwright.mjs
node tests/store-agent.playwright.mjs
```

On Linux, Playwright may additionally require `npx playwright install-deps chromium`. The settings/About checks cover save/reload/tab switching, product/secret preservation, error/busy states, accurate versions, light/dark themes and responsive layouts. Agent browser checks simulate single/bulk Import and matching-hash behavior. Screenshots go to `test-artifacts/settings-about/` unless overridden with `TEST_SCREENSHOTS`.

Before a real branch rollout, test a known checkout, authenticated admin shares, service startup after reboot, inventory accuracy, deployment/backup behavior, WAN conditions and any external clients. See [Windows test plan](docs/WINDOWS-TEST-PLAN.md) and the release-specific guides below.

## Releases and updates

| Trigger | Result |
| --- | --- |
| Push / pull request to supported CI branches | Validation; branch pushes also package an unsigned test installer |
| Push to `Beta` | Beta Release workflow builds the version in `package.json` and publishes a **prerelease** |
| Push stable tag such as `v3.1.0` | Release workflow builds/tests Windows artifacts and publishes the stable release |
| Push to `main` without a release tag | CI only; it does not by itself publish a stable GitHub release |

For a stable release, update the root and recovery package/lock versions together, validate, commit on `main`, and push the matching `v<version>` tag. Keep the `Beta` branch and historical prerelease tags intact; never retag an already-published release to silently replace its contents.

About offers a selectable **update channel** next to the update controls: **Main release** offers only published stable releases, and **Beta release** offers the newest release including prereleases; the choice is stored per installation. A beta install that selects **Main release** is offered the newest stable version even when its number is lower than the installed beta — switching back from beta is a deliberate, confirmed downgrade. Drafts are excluded on both channels. Where supported, downloads use differential metadata and expose progress, pause/resume/stop and install/restart controls; a full download can still be needed. Installation is an explicit action.

The release workflow uses its repository `GITHUB_TOKEN`. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` securely if producing signed installers; never put them in source files. A successful workflow alone does not prove that signing secrets were configured.

## Troubleshooting

| Symptom | Checks / action |
| --- | --- |
| `Agent is not running` | Confirm the service exists/is running; use Import Agent on one checkout and inspect the summary. Double-clicking the EXE is not service installation. |
| Access denied / rejected credentials | Check Settings → Store App → Target access, target administrator rights, domain/user syntax, Windows remote UAC policy and admin-share/SCM firewall rules. |
| Agent transfer times out | Inspect the reported hash/copy/verification phase and progress. Check WAN throughput and endpoint scanning. Initial legacy-Agent hashing can be slow. |
| Import ends waiting for the agent heartbeat | Typical on a slow VPN before 3.1.2-beta.1 — the wait now allows several minutes and streams the inventory under a no-data deadline. If it still fails, check C:\Agent\data permissions, the checkout clock and that the service stays Running. |
| Agent shows as not seen over VPN | The inspection read shares the WAN-aware limits now; also confirm TCP 445 stays open through the tunnel and the account has admin-share access. |
| Product/version missing | Check the selected product on Update Store App, machine-wide Programs and Features entries, Agent freshness and any inventory error. |
| Wrong deployment destination | Update Settings → Store App; the path is interpreted on each checkout. Saving it should not change product selection. |
| Native module ABI error | Run `npx electron-builder install-app-deps`; use Electron for its native integration tests. |
| Device unknown/offline | Check ICMP, address/DNS, VPN/routes, ping settings and Dashboard visibility. |
| External executable not found | Set its actual installed path under Device tools or VPN; the app does not install third-party clients. |
| FortiClient is open but VPN is off | Complete connection in FortiClient and verify a real tunnel adapter/routes; process presence alone is insufficient. |
| Database/recovery fails after moving accounts | Restore under the originating Windows account with the required data/key files; do not copy only the database. |
| SmartScreen or endpoint block | Verify source, signing and organizational allowlisting with IT. Do not disable protection as a workaround. |

## Documentation, support and license

- [3.1.0 release notes and upgrade checklist](docs/release-3.1.0.md)
- [Settings/About changes and technology audit](docs/settings-about-beta9.md)
- [Native Agent architecture, build and upgrade notes](docs/store-agent-beta8.md)
- [WAN timeout/progress troubleshooting](docs/store-agent-beta7.md)
- [Service/import design history](docs/store-agent-beta6.md)
- [Architecture](docs/ARCHITECTURE.md) · [Windows validation plan](docs/WINDOWS-TEST-PLAN.md) · [Security policy](SECURITY.md)

Beta guides are historical implementation/test references; their beta version numbers and pre-approval merge instructions are not the current stable release status. This README and the 3.1.0 release notes describe the current stable release on `main`.

**Developer:** Ali Ajeli Lahiji — IT Specialist, HyperFamily Retail Stores
**Email:** [Lahiji.ali@hyperfamili.com](mailto:Lahiji.ali@hyperfamili.com)
**Repository:** <https://github.com/aliajeli/hyperfamily-it-app>

Report reproducible non-sensitive problems through [GitHub Issues](https://github.com/aliajeli/hyperfamily-it-app/issues). Include app version, Windows version, failing operation and sanitized logs/screenshots. Never attach passwords, tokens, private IP inventories or databases to a public issue. Use the private reporting channel described in SECURITY.md for vulnerabilities.

MIT — see [LICENSE](LICENSE).
