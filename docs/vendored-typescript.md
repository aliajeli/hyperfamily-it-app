# Vendored TypeScript source and runtime JavaScript

The 30 checked-in files under `electron/vendor/` are third-party libraries (ssh2 and its fallback dependencies). Their LICENSE files and upstream version metadata remain in place. To keep the application's maintained source tree TypeScript-only, their `.js` source files were moved to `.ts` **without rewriting the third-party algorithms**.

`npm run compile:vendor` transpiles these files in place as CommonJS `.js`. These generated files are git-ignored but must exist for Node/Electron at runtime and are included in the packaged application. `npm run build`, tests and the normal start commands compile them before use. Electron cannot execute the `.ts` source directly.

**Limitation:** `tsconfig.vendor.json` uses `noCheck` to avoid asserting that a mechanical source-format conversion fully types upstream code. The vendored code remains a maintained fork, not a fresh type-checked implementation. The SSH handshake test explicitly runs both the installed engine and the compiled vendored fallback; the vendor-sync unit test verifies that all 30 JavaScript artifacts are emitted.

When updating ssh2 or a fallback dependency, compare the upstream package and license, copy the new source as TypeScript, compile it, and run both the unit and Electron SSH suites. Do not copy upstream `.js` files into Git without repeating the migration and test process.
