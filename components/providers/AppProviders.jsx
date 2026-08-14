'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { getApi } from '@/lib/api'
import { applyTheme, readRememberedTheme } from '@/lib/themes'
import { applyTypography, rememberTypography, readRememberedTypography } from '@/lib/typography'
import { useSettingsStore } from '@/stores/settings.store'

export default function AppProviders({ children }) {
  const setSettings = useSettingsStore((state) => state.setSettings)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const settings = await getApi().settings.get()
        if (!alive) return
        setSettings(settings)
        // The saved setting wins, but a profile without one keeps whatever the
        // pre-paint boot script already restored instead of snapping back.
        applyTheme(settings.theme || readRememberedTheme() || 'aurora')
        // Fonts and interface scale live in the same settings row; cache them
        // so the next launch applies them before the first paint.
        applyTypography(settings)
        rememberTypography(settings)
      } catch {
        // Before sign-in there is no database yet; the remembered values are
        // all we have, and they are what the login screen is painted with.
        applyTheme(readRememberedTheme() || 'aurora')
        applyTypography(readRememberedTypography())
      }
    }
    load()
    const reload = () => load()
    window.addEventListener('hyperfamily:data-changed', reload)
    return () => { alive = false; window.removeEventListener('hyperfamily:data-changed', reload) }
  }, [setSettings])

  return <>{children}<Toaster richColors position="bottom-right" closeButton /></>
}
