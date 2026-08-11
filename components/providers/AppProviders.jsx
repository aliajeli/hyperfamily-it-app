'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { getApi } from '@/lib/api'
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
        document.documentElement.dataset.theme = settings.theme || 'aurora'
      } catch {
        document.documentElement.dataset.theme = 'aurora'
      }
    }
    load()
    const reload = () => load()
    window.addEventListener('hyperfamily:data-changed', reload)
    return () => { alive = false; window.removeEventListener('hyperfamily:data-changed', reload) }
  }, [setSettings])

  return <>{children}<Toaster richColors position="bottom-right" closeButton /></>
}
