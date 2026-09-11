# Release 3.1.0 — smaller installer, selectable update channel, integrated recovery

**Type:** stable release on `main`, promoted from the approved `3.0.1-beta.x` line (through beta.10).
**Tag:** `v3.1.0` · **Installer:** `HyperFamily-Branch-Monitor-Setup-3.1.0.exe`

## Highlights

### 1. Installer size: ~300 MB → ~100 MB

The one-click installer sheds about two thirds of its size with **no feature
removed**:

- The app renders from a fully static Next.js export (`out/`), yet the package
  used to ship the entire server framework and every UI library uncompressed
  inside `node_modules`. Only the packages the Electron main process actually
  requires at runtime are packaged now: `better-sqlite3-multiple-ciphers`,
  `exceljs`, `ssh2`, `electron-updater` and `bcryptjs` (plus optional
  `keytar`). Packaged application code (`app.asar`) fell from ~150 MB to
  ~13 MB.
- Per-platform native prebuilds are filtered to Windows x64, the browser
  bundle of `exceljs` is excluded, and source maps, type definitions and
  package markdown files no longer ship.
- Chromium locale packs other than `en-US` are stripped automatically during
  packaging (`electron/scripts/after-pack.cjs`).
- NSIS now uses maximum compression.

### 2. Selectable update channel (About page)

Updates used to look at stable releases only. There are now two checkboxes in
**About → Application updates → Update channel**:

| Choice | What it offers |
| --- | --- |
| **Main release** | Published stable releases only. |
| **Beta release** | The newest release, including beta prereleases. |

- The choice is stored per installation and survives restarts.
- **Switching back from beta:** a beta install that selects **Main release** is
  offered the newest stable version even when its number is *lower* than the
  installed beta. This is an intentional, clearly-labelled downgrade — the About
  page shows an amber notice before you download it.
- Switching the channel cancels any download belonging to the other channel
  and re-checks immediately.

No stored choice defaults sensibly: stable builds follow Main, beta builds
follow Beta.

### 3. Credential recovery integrated into the desktop app

The separate `HyperFamily-Credential-Recovery.exe` — previously a full second
Electron runtime bundled into every installer — is replaced by a **recovery
mode of the desktop app itself**:

```text
HyperFamily-Branch-Monitor.exe --recovery
```

Same PIN-gated window, same `credentials.dat` format, same scrypt PIN gate and
five-attempt lockout; recovery mode additionally skips the single-instance
lock so it opens while the dashboard is running. Existing recovery files and
PINs keep working unchanged. The standalone build remains available to
developers via `npm run build:recovery` but is no longer shipped or attached
to releases.

## Upgrade notes

- From **3.0.0:** update normally from About (Main channel) or run the 3.1.0
  installer over the existing install.
- From **3.0.1-beta.x:** 3.1.0 is numerically and functionally the newer line;
  the updater offers it automatically on either channel. Beta users who stay
  on the Beta channel will see the next beta when one is published; selecting
  Main pins them to stable releases from then on.
- Close the app before installing, keep the same Windows account, and confirm
  `3.1.0` in About afterwards. Existing data, settings, branches, credentials,
  recovery file and PIN are untouched.

## Validation

- Node unit suite: **96 tests** (94 pass, 2 Windows-only skips off-Windows),
  including 9 dedicated update-channel tests covering beta-only, main-only,
  downgrade-from-beta and draft-filtering rules.
- `electron-builder --win --dir` trial packaging: `win-unpacked` ≈ **329 MB**
  (previously ~820 MB), app.asar **13 MB**, locales removed as configured.
- Lint clean; Next.js static build green; Windows CI and the Release workflow
  remain the authoritative build certificate.
