'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { getApi } from '@/lib/api'
import { applyTheme, readRememberedTheme } from '@/lib/themes'
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
      } catch {
        // Before sign-in there is no database yet; the remembered id is all we
        // have, and it is what the login screen is already painted with.
        applyTheme(readRememberedTheme() || 'aurora')
      }
    }
    load()
    const reload = () => load()
    window.addEventListener('hyperfamily:data-changed', reload)
    return () => { alive = false; window.removeEventListener('hyperfamily:data-changed', reload) }
  }, [setSettings])

  return <>{children}<Toaster richColors position="bottom-right" closeButton /></>
}
