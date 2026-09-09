# 3.0.1-beta.8 — Small native Windows agent (test release)

## What changed

The agent is now a **C++17/Win32 Windows Service**, replacing the self-contained .NET 10 executable shipped in beta.6/7. It uses Windows registry, SCM and file APIs directly. The release build statically links the C/C++ runtime and does not need .NET, the VC++ Redistributable, companion DLLs, an agent port or a separate runtime installer on checkouts.

The initial MinGW cross-build was **235,008 bytes** versus **74,616,385 bytes** for the beta.7 agent. The authoritative MSVC release size and SHA-256 are printed in GitHub's build log and can be checked on the release assets. Every release build fails if the EXE is over **2 MiB**, is not Windows x64, contains a CLR header, lacks ASLR/DEP, or imports non-approved external DLLs. No executable packer is used.

This reduction applies to **HyperFamilyStoreAgent.exe**, not the entire Electron desktop installer. The desktop and credential recovery tool remain separate, larger components.

## Compatibility preserved

- Path and filename: `C:\Agent\HyperFamilyStoreAgent.exe`
- Service name: `HyperFamilyStoreAgent`
- Account/startup: LocalService, Automatic startup before Login, existing recovery settings
- Snapshot: `C:\Agent\data\inventory.json`, protocolVersion **1**, every **15 seconds**
- Same machine registry inventory fields, including DisplayVersion and both 64/32-bit uninstall views
- Persian/Unicode text and JSON escaping, REG_EXPAND_SZ values, case-insensitive deduplication
- No HKCU/MSIX inventory, MSI repair, WinRM, WMI, Remote Registry dependency, remote commands or listening port
- Same Import Agent / Import Agent to all, SHA-256 comparison and read-back verification
- Same beta.7 progress-aware WAN transfer timeouts, exclusive staging/locks and rollback
- Same presence/SCM/heartbeat gate and **Agent is not running** behavior

Snapshots are flushed to a unique temporary file and atomically renamed in the same data directory. Stop/shutdown requests interrupt the collection between registry keys, delete the live heartbeat and report Stopped to SCM. Failed registry reads produce a running heartbeat with inventoryError (not a false empty inventory); failed writes do not make stale inventory look fresh.

## First test / upgrade from a managed agent

1. Install the **beta.8 desktop application** on the management workstation. Its package bundles the native EXE. Existing beta.6/7 agents continue to report inventory until explicitly imported/upgraded.
2. Pick **one** known checkout and click **Import Agent**. Do not start with Import Agent to all.
3. On that first upgrade, the old ~75 MB EXE still has to be read for its SHA-256. That one-time comparison can be slow on a WAN. The replacement copy and all later native-agent checksum reads are much smaller.
4. Import stops the same named service, verifies/replaces its EXE, preserves Automatic/LocalService configuration, starts it and verifies its heartbeat. The previous EXE is restored if replacement/startup fails, using the existing importer.
5. Check the Programs and Features version against the displayed Store Commerce version, then re-import the same bundle: it should report **SHA-256 matches — copy skipped**.
6. Stop the service and recheck to verify **Agent is not running**. Restart the service and check again. On a test checkout, reboot and verify automatic startup before Login.
7. Test a second checkout in another branch before considering a wider rollout.

The standalone EXE is a service binary, not an interactive setup program. Use the desktop Import action rather than double-clicking it. It is published along with `HyperFamilyStoreAgent.exe.sha256`.

This is an unsigned test build unless project signing is configured. Do not disable endpoint protection to bypass a block; review any signing/allowlisting requirement with IT.

## Windows build and tests

Build dependencies (management/build machine only): Node 22.12+, CMake 3.20+, Visual Studio C++ Build Tools with the Windows SDK. GitHub's Windows runner includes these tools.

```text
npm run build:agent
npm test
npm run lint
npm run build
```

`build:agent` reads the version from package.json, builds x64 Release with MSVC/static CRT, runs the C++ JSON tests, verifies EXE size/dependencies and writes its SHA-256 sidecar. It does not use NuGet or the .NET SDK.

Windows CI also opts into `npm run test:agent` with `HF_AGENT_WINDOWS_TEST=1` on an ephemeral runner. It tests:

- Native EXE size/import-table validation and executable self-test
- Temporary HKLM registry fixtures in both views (cleaned up afterward)
- Persian/Japanese names, emoji, quotes/control characters and environment expansion
- Real service installation under LocalService and Automatic startup
- Live snapshots, sequence advancement over the 15-second heartbeat interval
- Matching-hash re-import, new instance ID after restart, and stopped-service detection

Do not opt into this integration test on production machines. It deliberately refuses a pre-existing agent installation before testing a real service at C:\Agent.

## Optional Linux cross-compilation checks

Release artifacts are built/tested on Windows. A MinGW cross-compile and a portable serializer test can catch syntax, linking and JSON regressions locally:

```sh
cmake -S agent -B agent/build/mingw \
  -DCMAKE_SYSTEM_NAME=Windows \
  -DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++ \
  -DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres \
  -DAGENT_VERSION=3.0.1-beta.8 -DCMAKE_BUILD_TYPE=Release
cmake --build agent/build/mingw --target HyperFamilyStoreAgent
g++ -std=c++17 agent/tests/json.test.cpp -o agent/build/json-tests
agent/build/json-tests
node electron/scripts/verify-agent.js agent/build/HyperFamilyStoreAgent.exe
```

Cross-compilation is not a substitute for the Windows service and real branch-network tests.
