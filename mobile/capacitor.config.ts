import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hyperfamily.companion',
  appName: 'HyperFamily Companion',
  webDir: 'www',
  server: {
    // The workstation serves the interface over plain HTTP on the store LAN.
    // Access is guarded twice: the companion token (API) and a regular
    // application account (sign-in). cleartext + allowNavigation let the
    // WebView move from the bundled connection page to the chosen server.
    cleartext: true,
    allowNavigation: ['*']
  },
  android: {
    allowMixedContent: true
  }
}

export default config
