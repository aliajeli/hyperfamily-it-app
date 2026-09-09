# 3.0.1-beta.7 — Agent Import over slow branch links

## Report and diagnosis

On `172.18.82.34`, beta.6 reported the bundled SHA-256, then only `Import did not complete` / `The operation was aborted`, without reaching the `compare` result. The beta.6 stream wrapper forcibly aborted **every hash after 60 seconds** and **every copy after 120 seconds**, even if bytes were still moving. The installed-file hash is performed before the comparison log entry, making that deadline consistent with the supplied sequence.

The agent EXE is roughly 75 MB. Reading that back over SMB in 60 seconds requires roughly 1.25 MB/s (10 Mbit/s) of effective throughput; WAN/VPN bandwidth and SMB latency can easily exceed this time budget. This is a confirmed limitation in the importer, not proof of the particular branch's underlying bandwidth, packet loss or firewall state. The private branch network is not available in the development environment.

## What changed

- Hashing and copying use a **120-second inactivity deadline**, reset by actual read/write progress. A healthy slow transfer no longer fails simply because it exceeded 60/120 seconds in total.
- A separate **30-minute hard maximum per file operation** bounds trickle traffic. This is not a 30-minute limit on an entire multi-stage import; comparison, staging, verification and final verification have separate budgets.
- SMB file buffers increased from Node's default small reads to **1 MiB**, reducing small-block overhead on high-latency links.
- Copy progress counts destination `bytesWritten`, not fast local reads buffered in memory. A stalled SMB write cannot hide behind local-read progress.
- The UI displays phase, transferred/read bytes, percentage, average speed and elapsed time. Live progress samples are coalesced instead of accumulating indefinitely in the import log.
- Errors identify the phase and target, and distinguish inactivity, hard-maximum expiry and underlying I/O errors. `AGENT_TRANSFER_IDLE_TIMEOUT` and `AGENT_TRANSFER_MAX_TIMEOUT` remain available in IPC results.
- All potentially slow transfer stages are announced before they start, especially **Reading installed agent SHA-256**, **Copying staged agent**, **Verifying staged agent SHA-256**, and **Verifying running agent SHA-256**.
- SHA-256 comparison, read-back verification, exclusive staging, cross-workstation locking and rollback remain enabled. An unreadable installed file is **not** treated as a checksum mismatch or permission to overwrite it.
- After a potentially long final hash read, the importer checks the service/heartbeat again before declaring success, rather than accepting the heartbeat sampled before that read.

The agent protocol and inventory functionality are unchanged; beta.6 agents already running in healthy branches can still report inventory to the beta.7 desktop. Import compares exact bundled bytes when requested, so importing the newly bundled agent may replace an older build.

## How to test at the branch

1. Install the **beta.7 desktop package** on the management workstation. The timeout correction is in the desktop importer, not in settings on the checkout.
2. First use **Import Agent** on `172.18.82.34`, not Import Agent to all.
3. Watch the new phase/progress line. A checksum read transfers the remote file back over SMB; slow but steadily increasing bytes are normal. Do not mistake read-back verification for a second deployment.
4. If it fails, share the new phase, error code/message, transferred bytes and elapsed time. Check WAN/VPN packet loss, throughput, SMB reachability and endpoint security if progress stops. Do not disable firewalls or grant broader permissions simply to bypass this error.
5. After one successful import, verify the Store Commerce version and then test the other remote checkouts.

Do not remove a live `C:\Agent\import.lock`. Normal timeout cleanup closes the transfer, removes staging and releases the lock. If an importer crashed, first confirm no other workstation is importing before having IT clear a stale lock, as documented for beta.6.

## Validation

Regression tests use throttled and stalled streams with scaled deadlines: slow progress beyond an idle window, stalled reads, stalled destination writes despite buffered local reads, hard-maximum expiry, network error preservation, empty/ordinary files and exclusive destination creation. Import-level tests cover comparison/staging/final-verification stalls, preservation or rollback of the old binary, staging/lock cleanup and final heartbeat revalidation.

The existing Windows-only integration test still exercises the real EXE, SCM automatic startup, LocalService permissions, actual heartbeat production, checksum-match import and stopped-service detection before publication. Unit tests cannot substitute for a real WAN/VPN deployment test at the affected branch.
