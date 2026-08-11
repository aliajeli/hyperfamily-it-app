# Windows 10/11 Release Validation

Use a clean x64 VM and a staging branch/VPN. Record OS build, application commit, installed third-party tool versions, and evidence for each test.

## Installation and startup

- [ ] Build NSIS installer on `windows-latest` or a clean Windows build host.
- [ ] Verify Authenticode signature before execution.
- [ ] Install to the default directory and a custom directory.
- [ ] Launch in under three seconds on target hardware.
- [ ] Confirm the encrypted database and key sidecar are created under `%APPDATA%`.
- [ ] Confirm the database cannot be read by plain SQLite.
- [ ] Uninstall and verify user data retention policy.

## Authentication

- [ ] Sign in with `Admin` / `Admin` on a fresh profile.
- [ ] Reject incorrect credentials.
- [ ] Change the password and reject the former password.
- [ ] Restart the app and require a new authenticated session.
- [ ] Inspect audit rows for login, logout, and password change.

## Branches and devices

- [ ] Add, edit, and delete four branches.
- [ ] Confirm duplicate branch codes are rejected.
- [ ] Add every device type and validate adaptive fields.
- [ ] Confirm cascade deletion is clearly prompted and works.
- [ ] Toggle dashboard visibility.

## Monitoring

- [ ] Test at least 40 devices for one hour.
- [ ] Verify online (<50 ms), warning (>=50 ms), and no-response states.
- [ ] Change interval from 3 seconds to 1 and 60 seconds.
- [ ] Change history count from 30 to 10 and 100.
- [ ] Confirm UI remains responsive and memory remains stable.
- [ ] Confirm daily uptime aggregation and 1,000-row retention.

## Remote tools

- [ ] Map multiple credentials to a device type.
- [ ] Launch RDP and verify target-scoped `cmdkey` entry.
- [ ] Launch TeamViewer with a staging ID.
- [ ] Launch Winbox with configured path and port.
- [ ] Open HTTP and HTTPS management endpoints.
- [ ] Launch Termius URI.
- [ ] Verify all attempts are audited without passwords.

## VPN

- [ ] Reject incomplete settings.
- [ ] Reject split profile without `route-nopull`.
- [ ] Reject split profile without an RFC1918 route.
- [ ] Connect an approved split profile and verify only declared routes.
- [ ] Connect FortiClient full mode and verify default route behavior.
- [ ] Disconnect both modes and verify temporary auth file deletion.
- [ ] Test failure/timeout and status-button recovery.

## Inventory and settings

- [ ] Filter by branch, type, and text query.
- [ ] Export 1,000 assets in under five seconds.
- [ ] Open workbook in Excel and LibreOffice.
- [ ] Verify headers, borders, filters, widths, frozen row, and live statuses.
- [ ] Apply all four themes at 1920×1080 and 1366×768.

## Update and release

- [ ] Check latest GitHub release.
- [ ] Reject unsigned/tampered installer according to organization policy.
- [ ] Download with visible progress.
- [ ] Restart and install a signed staging update.
- [ ] Confirm settings and database survive the update.
