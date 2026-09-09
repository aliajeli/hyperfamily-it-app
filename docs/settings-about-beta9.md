# 3.0.1-beta.9 — Settings and About

**Release target: Beta prerelease only. Do not merge into main until the user has tested and approved this build.**

## UI changes

- Settings → **Store App** now contains **Deploy destination folder** and **Target access — administrator account on the checkouts**. General retains login/recovery and monitoring settings.
- Removed **Product name in Programs and Features** from Settings. The installed-product picker on Update Store App and its existing `store_program_name` setting are deliberately retained.
- Destination saves patch **only `store_update_path`**; they cannot reset the selected product or overwrite access settings.
- Password inputs are never prefilled. Blank means retain the stored password; a typed password replaces it only on save. Access tests use a typed password when present and otherwise use the backend's stored credential. Test does not save credentials.
- Store App inputs and all three action buttons are disabled during a save/test. Validation and service errors remain visible as toasts. Labels are explicitly associated with inputs and help text.
- Navigation hints in Store App and access-denied messages point to the new tab.
- About product card uses an intrinsic-height, top-aligned layout, larger brand treatment, compact release metadata, and no duplicated version within the card. Update controls, changelog, support and mail links are preserved.
- About's initial version, shared `APP_VERSION`, and browser-preview API version come from `package.json`, replacing the stale `2.0.22` fallback.

## Technology audit

Credits live in `lib/technology-stack.json`. Next.js, React, Electron and Framer Motion major labels are derived from the dependency manifest. The list distinguishes runtime responsibilities from build tools through descriptions; it is not a list of all transitive packages.

| Area | Credits and source evidence |
| --- | --- |
| UI/runtime | Next.js / React (`app/`, `components/`); Electron / bundled Node.js (`electron/main/`) |
| Components/style | Actual Radix UI wrappers (`components/ui/index.jsx`), Tailwind (`tailwind.config.js`), Framer Motion, Lucide |
| State/charts/forms | Zustand (`stores/`), Recharts (`components/dashboard/`), React Hook Form + Zod (`components/devices/DeviceForm.jsx`, `components/devices/BranchForm.jsx`), Sonner notifications |
| Database/auth | Encrypted SQLite with SQLCipher pragma and bcryptjs (`electron/database/index.js`) |
| Secret storage | Electron safeStorage / Windows DPAPI and AES-256-GCM fallback (`electron/services/crypto.service.js`) |
| Operations | ssh2 (`electron/services/terminal.service.js`), ExcelJS (`electron/services/excel.service.js`), SMB / Windows SCM and SHA-256 (`electron/services/smb.service.js`, `store-agent.service.js`, `agent-transfer.service.js`, `store-update.service.js`) |
| Native Agent | C++17 / Win32 (`agent/main.cpp`, `agent/CMakeLists.txt`) |
| Delivery/build | electron-updater (`electron/services/update.service.js`); electron-builder / NSIS (`electron-builder.json`); CMake / MSVC (`agent/CMakeLists.txt`, beta release workflow) |

Removed the inaccurate shadcn/ui credit in favor of Radix UI. Installed-but-unused packages such as keytar, vaul, @formkit/auto-animate and @phosphor-icons/react are not advertised as used technologies. Build tools are not additional checkout runtime requirements. No claim is made that Electron's renderer is sandboxed or that an authentication secret never participates in remote authentication.

## Validation

Local checks: lint, Node unit tests, Next.js production/static-export build with Node 22.12, and `tests/settings-about.playwright.mjs` against the export. Browser checks cover:

- Removed General fields and new tab; invalid destination; destination save normalization.
- Product and stored-secret preservation, password replacement, tab switching and reload.
- Instrumented IPC payloads for blank versus typed passwords, destination-only patches, busy interlocks and save failure recovery.
- Fresh-password/domain/test-host validation.
- Accurate version and all 24 technology tiles, no shadcn/ui credit, and no stretched product-card interior.
- Update-check control; light/dark themes; 1366×768, 900×768 and 600×768 layouts; no horizontal page overflow or browser exceptions.

Optional browser test setup:

```sh
npm install --no-save --package-lock=false @playwright/test
npx playwright install --with-deps chromium
npm run build
# Serve out/ on port 3000 in a separate terminal, then:
node tests/settings-about.playwright.mjs
```

These browser tests use fixture credentials and a simulated API. They are not evidence of actual Windows admin-share authentication. Windows native-service, Electron integration and installer checks run in the existing Beta Release workflow after publication is triggered.

## User acceptance before main

1. Install beta.9 over beta.8; open Settings → General and Store App. Confirm the saved destination/account remain unchanged and the password field is blank with a stored-password hint.
2. Change/save the destination, switch tabs and restart. Confirm the previously selected installed product on Update Store App is still selected.
3. Test a real checkout using the stored password, then a typed credential; test alone must not replace the saved credential.
4. Confirm About's card in your preferred theme and at 1366×768, correct beta.9 version, technology credits and working update/support controls.
5. Smoke-test one checkout's Agent import, version refresh and verified deployment. Native protocol, service, SHA-256, WAN timeouts and rollback implementation are unchanged.
6. Report the result. **Only explicit approval authorizes a merge into main.**
