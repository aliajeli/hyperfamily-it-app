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

### Headless build (Linux server / CI — no Android Studio)

The exact recipe verified on a plain Ubuntu container (Capacitor 7 needs
**JDK 21** — JDK 17 fails with `invalid source release: 21`):

```bash
# JDK 21 (Adoptium) + Android command-line tools
curl -sL -o jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
tar xzf jdk21.tar.gz && export JAVA_HOME=$PWD/jdk-21*
curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
unzip -q cmdtools.zip && mkdir -p android-sdk/cmdline-tools && mv cmdline-tools android-sdk/cmdline-tools/latest
export ANDROID_HOME=$PWD/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses > /dev/null
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-35" "build-tools;35.0.0"

cd mobile/android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug --no-daemon
# → app/build/outputs/apk/debug/app-debug.apk (~4 MB)
```

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
