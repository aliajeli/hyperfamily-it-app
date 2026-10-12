# Beta 6 — Store inventory agent

> Historical .NET implementation. For the current native build and upgrade instructions, see [beta.8](store-agent-beta8.md).

## Operator workflow

1. Install **3.0.1-beta.6** of the desktop app. Its installer bundles `resources/agent/HyperFamilyStoreAgent.exe`; no separate agent download is needed for Import.
2. Set an administrator account for the target domain in **Settings → Target access**. The checkout must expose SMB/admin share C$ and permit **Remote Service Management / Service Control Manager** from the management workstation. Do not disable the firewall; scope allowed management access to trusted workstations. WMI, WinRM and Remote Registry are not required for this feature.
3. Open **Update Store App**. Before every version read (including the automatic opening sweep), the app verifies the EXE exists, the SCM service is Running, and its heartbeat is valid and less than 60 seconds old. Missing, stopped or unresponsive agents display exactly **Agent is not running**. Hover for diagnostic details. Offline/unreachable hosts and authentication failures remain distinct.
4. Click **Import Agent** on a checkout, or **Import Agent to all** in the toolbar. Confirm the target(s) and permanent automatic-start service installation. Import-all visits all listed checkouts serially and reports individual failures without abandoning the others.
5. The importer hashes both the bundled EXE and existing target EXE with SHA-256. Only missing or different binaries are copied. The staged copy is verified before stopping the service or replacing its binary; the final executable is verified again after startup.
6. A matching binary is **not** copied again. Import still restarts/configures the service to repair its startup settings and apply the service account, then verifies a fresh heartbeat.
7. After import, the affected checkout versions are automatically rechecked. The dialog includes per-checkout steps, copy/skipped status and failure reasons.

## Target installation

- Executable: `C:\Agent\HyperFamilyStoreAgent.exe`
- SCM service name: `HyperFamilyStoreAgent`
- Display name: `HyperFamily Store Inventory Agent`
- Startup type: **Automatic** (before interactive Login), with failure restart actions.
- Account: **NT AUTHORITY\LocalService** — no stored domain credentials and no LocalSystem requirement.
- Output: `C:\Agent\data\inventory.json`, atomically replaced every 15 seconds.
- Target: Windows 10/11 x64, matching the desktop app's supported OS family. The EXE is self-contained; .NET does **not** need to be installed on checkouts. Only build machines need the .NET 10 SDK.

The local agent reads both machine uninstall registry views, including their DisplayVersion. It never invokes Win32_Product, repairs MSI products, starts other applications or runs remote commands. Per-user HKCU/MSIX-only applications are not enumerated; Store Commerce is matched using the existing configurable program name in Settings.

There is no listening agent port or new HTTP endpoint. The app uses the authenticated SMB session to read the JSON and SCM to confirm the service state. Windows clocks must be synchronized; a stale/future heartbeat is rejected rather than displaying potentially old version data. The registry/inventory interval is 15 seconds, so a just-completed software update may take one interval to appear. A live agent with a registry permission error returns that error rather than an empty inventory.

## Safety and recovery

- Only SYSTEM and local Administrators can modify the executable directory; LocalService receives read/execute access. Only the `data` subfolder is writable by LocalService.
- The importer refuses symlink/junction targets and an existing same-name service pointing at an unexpected binary.
- In-process and on-target `import.lock` locks prevent overlapping imports. After an importer crashes, IT should verify no import is active before deleting `C:\Agent\import.lock`; locks are never silently stolen.
- Staging verification failure leaves the existing binary/service untouched. Startup/configuration failure attempts to restore the prior executable and restart a previously running service. If rollback itself fails, the error identifies the preserved `.previous` binary for administrator recovery. Startup/account repair is not rolled back to insecure previous settings.
- Services may restart briefly even when hashes match. Plan imports outside checkout-critical activity where needed. Normal software-file deployment is a separate action and does not replace/install the agent.
- Remote administration policies, including local-account UAC filtering, can prevent Import. Prefer an authorized target-domain administrator; the app does not disable UAC, enable services on its own before Import, or broadly open firewall rules.
- SHA-256 detects differences/copy corruption, not publisher authenticity. Obtain the desktop package/agent only from the trusted project release; configure code signing for production releases.

## Manual removal (administrator on the checkout)

Stop and delete only this named service, then remove its files if no longer needed:

```powershell
Stop-Service HyperFamilyStoreAgent
sc.exe delete HyperFamilyStoreAgent
Remove-Item -LiteralPath C:\Agent\HyperFamilyStoreAgent.exe
Remove-Item -LiteralPath C:\Agent\data -Recurse
```

Do not recursively delete `C:\Agent` if it contains unrelated files. Removal causes the desktop page to show **Agent is not running** again.

## Development and validation

```text
npm run build:agent          # .NET 10 SDK; emits a single self-contained win-x64 EXE
npm test                    # cross-platform unit/regression tests
npm run lint
npm run build
```

Windows CI additionally sets `HF_AGENT_WINDOWS_TEST=1` and runs `npm run test:agent` **before publication**. This opt-in test refuses a pre-existing agent installation, then exercises the built EXE's self-test, a real Windows service under LocalService, automatic startup, actual heartbeat output, hash-match import and stop detection. It cleans up the ephemeral runner afterward. Do not enable this test on a production checkout.

All packaging workflows build the agent and embed it in the desktop installer. Beta Release also attaches the standalone EXE. Push only the `Beta` branch: its workflow creates the beta tag/release. The stable tag workflow ignores prerelease tags, preventing duplicate publication jobs.

A real branch-network test (target account, C$ permissions, SCM firewall policy and restart after reboot) is still required before rolling out to every checkout. The development environment cannot reach private branch IPs.
