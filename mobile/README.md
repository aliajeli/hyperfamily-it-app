# HyperFamily Companion (Android)

The companion app for **HyperFamily Branch Monitor**. The phone never talks to
the store devices directly: it loads the workstation's own interface over the
local network and uses its API. One workstation runs the desktop app (the
server); the phone is a thin, token-protected shell around it.

```
📱 phone (this app)  ──store Wi-Fi──▶  🖥️ workstation with the desktop app  ──▶  branches & devices
```

## What is in here

| Path                  | Role                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------- |
| `www/index.html`      | Bundled connection screen: enter server address + port + companion token, then connect |
| `capacitor.config.ts` | Capacitor wiring (app id, cleartext LAN policy, navigation)                            |
| `android/`            | The generated Android project — open it in Android Studio                              |

## Build the APK (once per machine)

1. Install **Node.js 18+** and **Android Studio** (with the Android SDK).
2. From this folder:
   ```bash
   npm install
   npx cap add android     # only the first time (regenerates android/ if missing)
   npx cap sync android
   npx cap open android    # opens Android Studio
   ```
3. In Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.
   The debug APK lands in `android/app/build/outputs/apk/debug/`.
   For a signed release: **Build → Generate Signed Bundle / APK**.

## Use it

1. On the workstation: **Settings → General → Companion server (Android)** —
   enable it and note the address and token.
2. Open the app on the phone (same store network) and enter both.
3. Sign in with the same account you use on the desktop app.

The phone shows live branch/device health and the directory. Desktop-only
features (agent deployment, terminal sessions, update channel) answer with a
clear “not available in the companion app” message instead of failing.

## Security notes

- The API requires the **companion token** (Bearer). Rotate it any time from
  the Settings card; old phones stop working immediately.
- Sign-in still requires a real application account — the token only protects
  the transport.
- Traffic is plain HTTP on the LAN by design (store networks, no certificates).
  Never expose the port to the internet; a TLS option can be added later
  without changing the API.
