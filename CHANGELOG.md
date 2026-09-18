# Changelog

Every release of HyperFamily Branch Monitor, newest first.
Generated from lib/changelog.json by scripts/generate-changelog-md.js — do not edit by hand.

## 3.10.0-beta.1

**Release 3.10.0-beta.1**

_Released 2026-09-18 · beta channel_

### Improved
- Describe here, in one readable line each, what changed for the operator in 3.10.0-beta.1.
## 3.9.1-beta.1

**Every companion page renders again**

_Released 2026-09-17 · beta channel_

### Fixed
- Fixed “Application error: a client-side exception” on every phone page except the dashboard: desktop-only calls like the theme broadcast and the update/step subscribers rejected instead of degrading, and the unhandled rejection killed the whole page. The companion bridge now hands back silent no-op subscriptions and a resolved theme call, while data methods still explain themselves with a toast.
- Added an automated sweep that boots the real companion server against the real build and opens all eight pages like the phone does — this class of crash can no longer ship unnoticed.
## 3.9.0-beta.1

**The phone becomes a full companion**

_Released 2026-09-17 · beta channel_

### Added
- The Companion app is no longer limited to the dashboard: Notes, Terminal snippets, Inventory and the Credentials overview now open and read/write from the phone, on the same token-gated API as the desktop.
- The connect screen gained an explicit “Check for updates” button — updates come straight from GitHub Releases, so the app can update itself even before it has a workstation connection.
## 3.8.2-beta.1

**Phone app can reach the workstation again**

_Released 2026-09-17 · beta channel_

### Fixed
- Fixed the Companion app failing to connect with “Could not reach that server” even on the same network: Android 9+ silently blocked the plain-HTTP requests to the workstation — the app is now allowed to talk to the local network again.
- The companion server now answers with CORS headers, so the phone's reachability probe can actually read the response instead of discarding it.
- The connection failure message now also points at the Windows firewall (private networks) as a possible cause.
## 3.8.1-beta.1

**Interface styling restored**

_Released 2026-09-17 · beta channel_

### Fixed
- Fixed a critical styling regression from v3.7.0-beta.1: the stylesheet generator was still scanning only the old .js/.jsx sources, so after the TypeScript migration no layout classes were emitted and the whole interface rendered unstyled. Scanning now covers .ts/.tsx and every screen looks exactly as designed again.
- The automated interface suite now asserts that real computed styles are applied, so a silently empty stylesheet can never pass the tests again.
## 3.8.0-beta.1

**Pair the phone app with one QR scan**

_Released 2026-09-17 · beta channel_

### Added
- Settings → General → Companion server now shows a QR code that encodes the address, port and token together — with a picker when the workstation has several network addresses.

### Improved
- The HyperFamily Companion app gained a “Scan QR code” button: one scan of the code on the workstation fills the address, port and token and connects — manual entry still works as before.

### Fixed
- The Companion connection screen never displayed its status and error messages; messages like “Could not reach that server” are now shown correctly.
## 3.7.0-beta.1

**The interface moves to TypeScript and becomes component-driven**

_Released 2026-09-17 · beta channel_

### Improved
- The entire interface (every screen, component, store and library) migrated to TypeScript; `npm run typecheck` now type-checks both the main process and the interface on every build.
- Sixteen new reusable components extracted from the largest screens — Notes, About, Login and Update Store App — with their pure presentation logic split into standalone modules.
- The refactored screens are ~60% smaller each while looking and behaving exactly the same; the automated interface test suite passes unchanged.
## 3.6.0-beta.1

**The Electron layer moves to TypeScript**

_Released 2026-09-16 · beta channel_

### Improved
- All OS services, the IPC layer, the preload bridge and the database engine are now TypeScript sources, checked by the compiler on every build and every CI run.
- The TypeScript migration compiles in place, so installs, updates and stored data behave exactly as before.
## 3.5.0-beta.1

**Companion APK ships on GitHub Releases with in-app updates**

_Released 2026-09-16 · beta channel_

### Added
- The Android companion now updates itself from GitHub Releases, the same way the workstation app does: a banner on the connect screen offers the new version, downloads the APK, and opens the Android installer.
- A Mobile APK workflow builds the companion APK on every published release and attaches it to that release, signed with the project keystore.

### Improved
- Release APKs are signed with a stable project key so updates install cleanly over previous versions, and the companion version now mirrors the workstation version.
## 3.4.0-beta.1

**Android companion: the workstation becomes the phone’s backend**

_Released 2026-09-16 · beta channel_

### Added
- Companion server for Android: a switch in Settings → General turns this workstation into a token-protected backend that serves the application’s own interface and live branch data to the phone over the store network — it restarts automatically with the app.
- A new mobile/ project builds the HyperFamily Companion app (Capacitor): enter the workstation address and the companion token shown in Settings, then sign in with a regular application account to watch branch and device health from the store floor.

### Improved
- The companion token can be rotated from Settings at any time, which immediately locks out a lost or retired phone without touching the application accounts.
## 3.3.0-beta.1

**Engineering hardening: self-discovered tests, file logging, nightly UI checks**

_Released 2026-09-16 · beta channel_

### Improved
- The test runner now discovers every unit test automatically — a new test file can never again be silently skipped by the release pipeline.
- The main process keeps a rotating log file (main.log, 5 MB) with every start and every uncaught fault, so a field machine always has a sendable black box.
- Application windows are fully sandboxed: the renderer reaches the system only through the IPC bridge, never directly.
- Dependency health is enforced on every build: npm audit and Prettier formatting checks run in CI, and Dependabot proposes weekly updates.
- CHANGELOG.md is now generated from the same changelog the About page reads, and a nightly Playwright workflow drives the real UI in Chromium.

### Fixed
- The withTimeout guard could never fire in a plain Node context (its timer was unref'd), so the promised timeout never settled outside Electron — stalled-UNC protection is now guaranteed everywhere.
## 3.2.6

**Calmer performance, redesigned About, and instant Store App data**

_Released 2026-09-16 · main channel_

### Improved
- Lower CPU usage while monitoring: lighter polling waves and a deduplicated page header keep the application quiet in the background.
- Batch Store Commerce installs run faster and report per-checkout progress.
- The About page is redesigned around a gradient hero band with a glass spec panel (release, platform, channel, developer), a slimmer updates card with a gradient progress bar, and a dedicated Support & source card.
- Update Store App opens instantly from the sweep that runs at application startup; the page no longer re-scans on open — fresh data comes only from Recheck all, a branch Recheck, or a single checkout's Recheck.
- The Store App page now presents each branch as a card with its checkouts and their states, and the Asset inventory scrolls as a whole page with a sticky column header.

### Removed
- POS and Scale device types were retired from the directory.
## 3.2.5-beta.2

**Redesigned About page, instant Store App page, page-level inventory scroll**

_Released 2026-09-15 · beta channel_

### Improved
- The About page is redesigned: a gradient hero band with a glass spec panel (release, platform, channel, developer), a slimmer updates card with a gradient progress bar, and a dedicated Support & source card for issues, repository and developer contact.
- Update Store App now opens instantly with the versions collected by a sweep that runs at application startup — even when the page is never opened. Opening the page no longer re-scans every checkout; fresh data comes only from Recheck all, the branch Recheck, or a single checkout's Recheck.
- The Asset inventory list no longer scrolls inside its card — the whole page scrolls, with the column header sticking just below the app header.
## 3.2.5-beta.1

**Lower CPU usage, faster batch installs, and a calmer, roomier interface**

_Released 2026-09-15 · beta channel_

### Improved
- Much lower background CPU use: pings run in bounded waves (12 at a time) every 5 seconds instead of spawning a process per device every 3 seconds, the UI is refreshed only when a displayed value actually changes, and the VPN health probe is now a single combined check every 5 seconds instead of up to six process spawns every second.
- Store Commerce updates and agent imports now process up to 3 checkouts in parallel, and agent commands are answered up to 3× faster (poll interval 750 → 250 ms) — batch runs finish in a fraction of the former wall time.
- The app header no longer repeats each page's title; page headings are compact single rows, so every screen gains usable vertical space.
- Update Store App is redesigned around one card per branch: the card header shows the branch summary (checking/ok/offline counts) with Select all, Recheck and Update branch actions, and its checkouts are listed as compact rows with version and extension chips, status dot, and per-row Recheck / Import agent / Deploy / Inspect / Update actions.

### Removed
- POS and Scale no longer appear in Settings → Connections or Credential assignments — those devices are never connected to remotely.
## 3.2.4

**Export the directory as an importable workbook**

_Released 2026-09-15 · main channel_

### Added
- New Export button on Branches & Devices saves the full directory — branches, every device type, and Switch port groups — into a workbook built with the exact layout the Import feature reads, so the file can be imported on another workstation as-is with no manual editing.
## 3.2.3-beta.1

**Export the directory as an importable workbook**

_Released 2026-09-13 · beta channel_

### Added
- New Export button on Branches & Devices saves the full directory — branches, every device type, and Switch port groups — into a workbook built with the exact layout the Import feature reads, so the file can be imported on another workstation as-is with no manual editing.

### Removed
- The experimental “import from another workstation by IP” feature from the previous beta has been removed.
## 3.2.2

**Hyper.Commerce extension name and version on every checkout card**

_Released 2026-09-13 · main channel_

### Added
- Each checkout card now shows the Hyper.Commerce extension name and version under the Store Commerce version, read from the extension's POS/manifest.json — the exact values Store Commerce displays.
- Fallbacks keep older checkouts covered: Programs and Features first, then the file version of the deployed extension assemblies.
## 3.2.1-beta.1

**Hyper.Commerce name and version read from its POS manifest**

_Released 2026-09-13 · beta channel_

### Improved
- The extension line on each checkout card now shows the exact name and version from the extension's own POS/manifest.json (the same values Store Commerce displays), written under the Store Commerce version.
- Source order for the extension: POS manifest first, then Programs and Features, then the file version of the deployed assemblies — the card states which source answered.
## 3.2.0-beta.2

**Hyper.Commerce extension version on every checkout card**

_Released 2026-09-13 · beta channel_

### Added
- Update Store App now reads the Hyper.Commerce extension version on every checkout and shows it as an “Ext v…” pill next to the Store Commerce version.
- The agent reports the extension in its heartbeat: first from the extension's own Programs and Features entry, otherwise from the file version of the assemblies deployed to the Store Commerce Extensions folder.

### Improved
- Older agents without the heartbeat field still show the extension when its installer registered it in Programs and Features — the app matches the inventory list directly.
## 3.2.0-beta.1

**About page: redesigned product card and a matching update card**

_Released 2026-09-13 · beta channel_

### Improved
- The About page product card is redesigned around four live stat tiles — release, platform, update channel and developer — that stretch to fill the card, so no dead space remains next to the taller update card.
- The Application updates card now shares the same gradient backdrop and accent border as the product card, so the top row of the About page reads as one designed pair.
## 3.2.0

**About page: redesigned product card and a matching update card**

_Released 2026-09-13 · main channel_

### Improved
- The About page product card is redesigned around four live stat tiles — release, platform, update channel and developer — that stretch to fill the card, so no dead space remains next to the taller update card.
- The Application updates card now shares the same gradient backdrop and accent border as the product card, so the top row of the About page reads as one designed pair.
## 3.1.7

**Compact checkout cards — at least four per row**

_Released 2026-09-13 · main channel_

### Improved
- Update Store App checkout cards are redesigned as compact two-row tiles: status dot, name and address on the top row; version pill and icon actions below. At least four cards now fit on every line instead of three.
- Every card action stays one click away — inspect, recheck, Import Agent, Deploy and Update are icon buttons with explanatory tooltips.

### Fixed
- Remaining /install mentions in the Update button tooltip and service comments were replaced with the real install argument.
## 3.1.6-beta.1

**Compact checkout cards — at least four per row**

_Released 2026-09-13 · beta channel_

### Improved
- Update Store App checkout cards are redesigned as compact two-row tiles: status dot, name and address on the top row; version pill and icon actions below. At least four cards now fit on every line instead of three.
- Every card action stays one click away — inspect, recheck, Import Agent, Deploy and Update are icon buttons with explanatory tooltips.

### Fixed
- Remaining /install mentions in the Update button tooltip and service comments were replaced with the real install argument.
## 3.1.6

**Checkout agent runs as LocalSystem: Store Commerce closes and installs succeed**

_Released 2026-09-13 · main channel_

### Improved
- The agent directories are now locked to SYSTEM and local Administrators only; LocalService can no longer plant command files that the agent would execute.

### Fixed
- Open Store Commerce programs can now be closed on the checkout: the agent service runs as LocalSystem instead of LocalService, which had no right to terminate processes of the signed-in user.
- The Store Commerce installer no longer fails with “Access to the path 'extensions.config' is denied”: as LocalSystem it can write to C:\Program Files like a normal elevated installation.
- Upgrading is automatic — re-running Import Agent reconfigures the existing service account even when the agent EXE itself is unchanged.
## 3.1.5-beta.1

**Checkout agent now runs as LocalSystem: Store Commerce closes and installs succeed**

_Released 2026-09-13 · beta channel_

### Improved
- The agent directories are now locked to SYSTEM and local Administrators only; LocalService can no longer plant command files that the agent would execute.

### Fixed
- Open Store Commerce programs can now be closed on the checkout: the agent service runs as LocalSystem instead of LocalService, which had no right to terminate processes of the signed-in user.
- The Store Commerce installer no longer fails with “Access to the path 'extensions.config' is denied”: as LocalSystem it can write to C:\Program Files like a normal elevated installation.
- Upgrading is automatic — re-running Import Agent reconfigures the existing service account even when the agent EXE itself is unchanged.
## 3.1.5

**Checkout-side hashing, robust Store Commerce close, corrected installer call**

_Released 2026-09-13 · main channel_

### Improved
- Deploy verification is fast again on big files: the agent computes the SHA-256 of the copied file ON the checkout and sends back only the digest; older agents keep the classic read-back hash.
- Closing Store Commerce is more robust: the agent can terminate it in any session, retries the forced stop, and reports the exact Windows error if it still refuses.

### Fixed
- The Store Commerce installer is now invoked with its real argument — Hyper.StoreCommerce.Installer.exe install — instead of the mistyped /install switch.
## 3.1.4-beta.1

**Faster deploy verification and a corrected Store Commerce installer call**

_Released 2026-09-13 · beta channel_

### Improved
- Deploy verification is fast again on big files: the agent now computes the SHA-256 of the copied file ON the checkout and sends back only the 64-hex digest; checkouts without the new agent keep the classic read-back hash.
- Closing Store Commerce is more robust: the agent enables the debug privilege so it can terminate the process in any session, retries the forced stop, and reports the exact Windows error when a process still refuses to die.

### Fixed
- The Store Commerce installer is now invoked with its real argument — Hyper.StoreCommerce.Installer.exe install — instead of the mistyped /install switch.
- Closing Store Commerce on a checkout no longer ends in an error: the agent can now terminate it in any session and reports the exact Windows error if something still refuses.
## 3.1.4

**One-click Store Commerce update on any checkout**

_Released 2026-09-12 · main channel_

### Added
- Update Store App can now install Store Commerce itself: tick one, several or all checkouts and the app checks the connection, closes a running Store Commerce, verifies it is closed, finds Hyper.StoreCommerce.Installer.exe in the deploy folder and runs it with /install through the agent — no signed-in user and no UAC prompt on the checkout.
- Every checkout ends with a green or red info chip; clicking it shows the installer's exit code, everything the installer printed, and the Store Commerce version before → after.
- The agent gained a command channel (status, close, install) on the same SMB share as its heartbeat — whitelisted actions only, atomic command and answer files.
- The Store Commerce update batch can be stopped between checkouts; a running installer is never interrupted mid-install.

### Improved
- The agent now polls its command folder every second while keeping the 15-second inventory heartbeat unchanged.
## 3.1.3-beta.3

**One-click Store Commerce update on any checkout**

_Released 2026-09-12 · beta channel_

### Added
- Update Store App can now install Store Commerce itself: tick one, several or all checkouts and the app checks the connection, closes a running Store Commerce, verifies it is closed, finds Hyper.StoreCommerce.Installer.exe in the deploy folder and runs it with /install through the agent — no signed-in user and no UAC prompt on the checkout.
- Every checkout ends with a green or red info chip; clicking it shows the installer's exit code, everything the installer printed, and the Store Commerce version before → after.
- The agent gained a command channel (status, close, install) on the same SMB share as its heartbeat — whitelisted actions only, atomic command and answer files.
- The Store Commerce update batch can be stopped between checkouts; a running installer is never interrupted mid-install.

### Improved
- The agent now polls its command folder every second while keeping the 15-second inventory heartbeat unchanged.
## 3.1.3

**In-app changelog, cancellable agent import, readable typography**

_Released 2026-09-12 · main channel_

### Added
- About now has a Change log card: the release notes of the installed version, plus every previous version in one scrollable history.
- The changelog of a pending update is shown in About as well, even when the published GitHub notes are only a placeholder.
- Import Agent can now be stopped at any moment; the target checkout is rolled back to the previous executable and service state.
- Every technology tile in About → Production technology stack opens that technology's official website in the browser.
- GitHub releases are published with the release notes taken from lib/changelog.json, so the in-app changelog and the release page always agree.

### Improved
- The Import Agent dialog was rebuilt to match the Deploy dialog: colour-coded pipeline steps, per-checkout state, byte progress and a closing summary.
- The two About cards — product overview and Application updates — are now the same height on every screen size.
- The Application updates card keeps a fixed height: checking for, downloading and installing an update no longer makes it grow.
- Interface text now really follows the Fonts panel — the Text, Info and Monospace sizes are applied across the whole interface, not only to page titles.
- Readability: the smallest labels were raised by roughly one step, fractional window zoom is snapped to quarter steps, and font smoothing is enabled, so text stops looking soft on high-resolution displays.
- Dialogs, menus and the branch equipment view are lifted above the fixed header through one authoritative z-order scale.

### Fixed
- Settings → Fonts: a changed size or typeface no longer jumps back to the previous value after Save.
- Dashboard: opening a branch's equipment view no longer shows the Operations overview header on top of it.
## 3.1.2-beta.2

**In-app changelog, cancellable agent import, readable typography**

_Released 2026-09-12 · beta channel_

### Added
- About now has a Change log card: the release notes of the installed version, plus every previous version in one scrollable history.
- The changelog of a pending update is shown in About as well, even when the published GitHub notes are only a placeholder.
- Import Agent can now be stopped at any moment; the target checkout is rolled back to the previous executable and service state.
- Every technology tile in About → Production technology stack opens that technology's official website in the browser.
- GitHub releases are published with the release notes taken from lib/changelog.json, so the in-app changelog and the release page always agree.

### Improved
- The Import Agent dialog was rebuilt to match the Deploy dialog: colour-coded pipeline steps, per-checkout state, byte progress and a closing summary.
- The two About cards — product overview and Application updates — are now the same height on every screen size.
- The Application updates card keeps a fixed height: checking for, downloading and installing an update no longer makes it grow.
- Interface text now really follows the Fonts panel — the Text, Info and Monospace sizes are applied across the whole interface, not only to page titles.
- Readability: the smallest labels were raised by roughly one step, fractional window zoom is snapped to quarter steps, and font smoothing is enabled, so text stops looking soft on high-resolution displays.
- Dialogs, menus and the branch equipment view are lifted above the fixed header through one authoritative z-order scale.

### Fixed
- Settings → Fonts: a changed size or typeface no longer jumps back to the previous value after Save.
- Dashboard: opening a branch's equipment view no longer shows the Operations overview header on top of it.
## 3.1.2-beta.1

**Agent visibility over slow WAN/VPN links**

_Released 2026-09-11 · beta channel_

### Improved
- Agent imports and heartbeats now follow I/O progress instead of a fixed clock, so a slow but working branch link is no longer treated as a dead one.
- Import Agent reports the phase it is in and the bytes transferred, with a clear explanation when a link really has stalled.
- A long final SHA-256 verification re-checks that the agent is still alive before the import is declared successful.

### Fixed
- A freshly installed agent is no longer reported as missing while its first inventory is still being written over a slow connection.
## 3.1.1-beta.0

**Opening the 3.1.1 beta cycle**

_Released 2026-09-11 · beta channel_

### Improved
- The Beta branch is reopened for the next round of agent and deployment fixes on top of the stable 3.1.0 release.
## 3.1.0

**Smaller installer, selectable update channel, integrated recovery**

_Released 2026-09-11 · main channel_

### Added
- About → Application updates: a Main / Beta channel switch, stored per installation.
- Credential recovery is part of the desktop application itself (HyperFamily-Branch-Monitor.exe --recovery); no separate recovery executable is shipped any more.

### Improved
- The installer shrank from roughly 300 MB to roughly 100 MB: only the runtime packages the desktop shell needs are packaged, locale packs are trimmed and NSIS uses maximum compression.
- A beta installation that switches back to the Main channel is offered the newest stable release even when its number is lower — clearly labelled as an intentional downgrade.
## 3.0.1-beta.10

**Installer size and the update channel switch**

_Released 2026-09-10 · beta channel_

### Added
- Selectable update channel (Main stable only, or Beta including prereleases) with a stable fallback for beta installations.

### Improved
- Runtime dependencies were pruned, credential recovery was folded into the application and unused Chromium locales were removed.
## 3.0.1-beta.9

**Store App settings reorganised, About refreshed**

_Released 2026-09-09 · beta channel_

### Improved
- Settings → Store App groups the deployment path, the registered product name and the target access account together.
- The About page was refreshed with the technology credits and the developer contact.
## 3.0.1-beta.8

**Native Win32 agent replaces the bundled .NET agent**

_Released 2026-09-09 · beta channel_

### Improved
- The checkout agent is now a small native Win32 Windows service (C++17) instead of a bundled .NET runtime, which removes hundreds of megabytes from the installer.
## 3.0.1-beta.7

**WAN-tolerant agent transfers**

_Released 2026-09-09 · beta channel_

### Improved
- Agent file operations tolerate slow but progressing WAN transfers and report their phase and byte progress.
## 3.0.1-beta.6

**Verified Windows inventory agent**

_Released 2026-09-09 · beta channel_

### Added
- A verified Windows inventory agent and an Import Agent action for every checkout.
- Store Commerce versions are read from Programs and Features by the agent on the checkout itself.
## 3.0.1-beta.5

**Versions read through WMI**

_Released 2026-09-08 · beta channel_

### Fixed
- Installed program versions are read via WMI, which works on checkouts where Remote Registry is disabled.
## 3.0.1-beta.4

**Reach branches by IP, no stuck steps**

_Released 2026-09-08 · beta channel_

### Improved
- Checkouts can be reached by IP as well as by hostname, and the real product name is found even when it differs from the default.

### Fixed
- Deployment steps no longer stay stuck when a checkout drops out mid-run.
## 3.0.1-beta.3

**No ICMP gating, Remote Registry fallback**

_Released 2026-09-08 · beta channel_

### Improved
- Reachability no longer depends on ICMP, so firewalled checkouts are still serviced, and a fallback is used when Remote Registry is turned off.
## 3.0.1-beta.2

**Control Panel versions and cross-domain access**

_Released 2026-09-08 · beta channel_

### Added
- A target access account for checkouts that live in another domain.

### Fixed
- The interface no longer freezes while a checkout is being queried.
## 3.0.1-beta.1

**First automated beta pre-release**

_Released 2026-09-07 · beta channel_

### Added
- An automated Beta workflow publishes a pre-release installer on every push to the Beta branch.
## 3.0.0

**Update Store App: versions and verified deployments**

_Released 2026-09-09 · main channel_

### Added
- Update Store App: the Store Commerce version of every checkout, with verified file deployment and Jalali-dated backups.
- Uniform viewport scaling so the interface looks the same on every monitor.
