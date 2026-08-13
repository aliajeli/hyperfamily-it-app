'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { getApi } from '@/lib/api'
import { THEMES } from '@/lib/constants'
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
        const theme = THEMES.find((item) => item.id === settings.theme) || THEMES[0]
        document.documentElement.dataset.theme = theme.id
        document.documentElement.dataset.colorMode = theme.mode
      } catch {
        document.documentElement.dataset.theme = 'aurora'
        document.documentElement.dataset.colorMode = 'light'
      }
    }
    load()
    const reload = () => load()
    window.addEventListener('hyperfamily:data-changed', reload)
    return () => { alive = false; window.removeEventListener('hyperfamily:data-changed', reload) }
  }, [setSettings])

  return <>{children}<Toaster richColors position="bottom-right" closeButton /></>
}
