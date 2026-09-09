# HyperFamily Branch Monitor 3.0.0

## Approved stable promotion

The user confirmed successful testing of `3.0.1-beta.9` and authorized its merge into `main`, using the stable version **3.0.0**. The Beta source is commit `c00edc4ca9d6f388fe0e2ae3326ce2ff1dbcc6e5`. Existing Beta tags/branch are retained.

### Included changes

- Native C++17/Win32 checkout Agent, Automatic/LocalService service startup before login, machine-wide 32/64-bit installed-product inventory and live heartbeats.
- SHA-256 comparison/copy skipping, per-checkout and bulk Import, verified staging/replacement and service recovery behavior.
- WAN-aware transfer progress and timeouts retained from the approved beta.
- Store App settings tab for deployment destination and checkout administrator access; General no longer exposes product name.
- Existing installed-product selection and stored credentials preserved by destination-only settings saves.
- Compact modern About card, audited technology credits and package-derived version display.

### Stable-release adjustments

- Desktop and recovery-tool package manifests and lockfiles aligned to `3.0.0`.
- Native Agent version continues to derive from the root manifest. Windows FileVersion/ProductVersion are `3.0.0`; the prerelease resource flag is now conditional on a prerelease version suffix rather than always enabled.
- Windows native tests validate FileVersion, ProductVersion and IsPreRelease against the manifest. Metadata tests check root/recovery version consistency.
- Stable release workflow validates that its `v<version>` tag matches the stable package version before building.
- README replaced with current installation, upgrade, feature, configuration, deployment, security, build/test, release and troubleshooting documentation. Obsolete VPN and runtime claims corrected; security policy's version/implementation notes aligned.

## Important upgrade note

`3.0.0` is numerically lower than `3.0.1-beta.9`. Automatic downgrades remain disabled. Beta testers should close the app and install the 3.0.0 desktop installer manually under the same Windows account. Back up data/key files first and verify retained settings and inventory afterwards. This release numbering is intentional; it does not mean the approved beta features were removed.

The native Agent is approximately 200 KB in recent Windows builds, not the entire desktop installer. The service binary is installed through Import Agent, not by double-clicking it. Install the 3.0.0 desktop before importing its bundled Agent.

## Validation and rollout

Local validation covers lint, Node unit tests, Next.js static production build and browser Settings/About/Agent regression tests. The main CI and stable Release workflows run Windows CMake/MSVC, native service/version-resource tests, Node/Electron integrations and installer packaging. Consult the completed workflow runs for release-specific results.

Before wider rollout:

1. Install 3.0.0 manually over the approved beta; check About and retained account/inventory/settings.
2. Save the Store App destination, switch tabs/restart and verify the installed-product selection remains unchanged.
3. Test real checkout access with the stored credential; verify that Test access alone does not save a typed replacement.
4. Import the bundled Agent to one known checkout; check version inventory, hash-skip re-import and service startup after reboot.
5. Run a verified update-file deployment and inspect the dated backup/result on the target.
6. Validate gateway/VPN, third-party remote clients and organizational signing/allowlisting before deployment to all branches.

No real-network, physical reboot or endpoint-signing certification is implied by simulated browser tests or a successful hosted CI run.
