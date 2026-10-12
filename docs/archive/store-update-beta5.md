# 3.0.1-beta.5 — Store app installed-version recovery

## Reported failure

`store-update:installed` failed when the target answered SMB but its Remote Registry service was unavailable and neither RegBack nor repair contained a readable SOFTWARE hive. SMB connectivity is not proof that remote inventory is available. Modern Windows installations may not have a usable automatic RegBack backup.

## Changes

- Both the version cards and Installed programs dialog now use the same lookup chain: Remote Registry → **WMI StdRegProv over DCOM** → registry backup.
- WMI reads the live machine uninstall keys (normal and WOW6432Node), retaining Control Panel's DisplayVersion rather than substituting an executable version.
- WMI receives the Settings → Target access credentials explicitly; an SMB session does not supply credentials to DCOM. Credentials go to PowerShell through stdin JSON, not command-line arguments or generated files. Raw process exceptions are not exposed.
- A Remote Registry permission failure no longer prevents trying WMI, which has separate access controls.
- The version card retains the labelled executable-version last resort. The full inventory dialog deliberately does **not** pretend a single executable is a complete installed-programs list.
- Fixed the offline SOFTWARE hive query: after mounting the SOFTWARE hive, query `HKLM\<mount>\Microsoft\...`, not `HKLM\<mount>\SOFTWARE\Microsoft\...`. Use unique mounts for simultaneous requests and reject failed queries instead of displaying an empty inventory.
- The UI labels WMI/live data versus potentially stale backup data and removes the Electron IPC wrapper from dialog errors. Failure messages explain the needed permissions/transports.
- Registry subprocess timeout is 12 seconds; WMI subprocess timeout is 30 seconds; the enclosing authenticated inventory operation is capped at 90 seconds. No target service or firewall configuration is changed automatically.
- Beta releases are marked prerelease and are not promoted to GitHub's latest stable release. CI now also runs on Beta pushes.

## Target prerequisites / how to verify

1. In **Settings → Target access**, use an account authorized to administer the checkout in its own domain; verify the domain, username and password.
2. Have the Windows/domain administrator permit **Windows Management Instrumentation (WMI)** remote access from the management workstation only (the WMI firewall rule group, including DCOM endpoint mapper TCP 135 and negotiated RPC ports). WMI namespace/DCOM permissions and target policy must allow this account. Do not disable the firewall or broadly open RPC to untrusted networks.
3. Alternatively, have IT enable/allow **Remote Registry** under the organization's policy. The app does not start services, change startup types or weaken UAC/firewall settings.
4. On `st10007r02` / `172.18.168.33`, open **Update Store App → Installed programs**. With Remote Registry unavailable and WMI allowed, the dialog should say **Source: live registry via WMI**, and the Store Commerce version should match Programs and Features on the checkout.
5. Refresh the checkout's version card; its source tooltip should identify WMI and it should not carry the stale-data marker.
6. If WMI is blocked as well, a clear diagnostic remains expected. This release cannot bypass Windows permissions or a closed network transport. A reachable C$ share by itself cannot guarantee a live Control Panel inventory.

## Validation

Automated regression tests cover the reported fallback in both endpoints, explicit cross-domain credentials, denied Remote Registry access, missing backup, empty versus invalid WMI responses, process timeouts/secret-safe errors, and backup query paths/cleanup. `npm test` now includes registry and WMI tests. A Windows-only test parses the script with Windows PowerShell during CI/release validation.

Local validation is performed on Linux (unit tests, ESLint and Next production build). A real Windows checkout/network integration test is still required; the private target IP is not reachable from the development sandbox. The app's existing stable-only updater may not offer prereleases: install this beta from its GitHub release page when testing.
