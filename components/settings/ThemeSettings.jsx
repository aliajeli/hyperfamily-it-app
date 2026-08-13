'use client'

import { useMemo, useState } from 'react'
import { Check, Moon, Palette, Sun, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { THEMES, THEME_FAMILIES, applyTheme, findTheme } from '@/lib/themes'
import { getApi } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

export default function ThemeSettings({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [family, setFamily] = useState('all')
  const [mode, setMode] = useState('all')
  const [busy, setBusy] = useState('')

  const visible = useMemo(() => THEMES.filter((theme) => (
    (family === 'all' || theme.family === family) && (mode === 'all' || theme.mode === mode)
  )), [family, mode])

  const choose = async (theme) => {
    const previous = findTheme(settings.theme)
    applyTheme(theme)
    setBusy(theme.id)
    try {
      const next = await getApi().settings.save({ theme: theme.id })
      onSaved(next)
      setGlobalSettings(next)
      toast.success(`${theme.name} applied`)
    } catch (error) {
      applyTheme(previous)
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  const filterButton = (label, active, onClick, key) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 text-[11px] font-bold transition',
        active
          ? 'bg-[rgb(var(--primary))] text-white shadow-sm'
          : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]'
      )}
    >{label}</button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-[rgb(var(--surface)/.42)] p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-[rgb(var(--primary)/.14)] p-2 text-[rgb(var(--primary))]"><Palette size={17} /></div>
          <div>
            <h2 className="text-sm font-extrabold">Appearance</h2>
            <p className="text-[11px] text-[rgb(var(--muted))]">{THEMES.length} palettes — Nord plus modern and classic sets. Applied instantly.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border bg-[rgb(var(--surface)/.6)] p-1">
            {filterButton('All sets', family === 'all', () => setFamily('all'), 'all')}
            {THEME_FAMILIES.map((item) => filterButton(item, family === item, () => setFamily(item), item))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border bg-[rgb(var(--surface)/.6)] p-1">
            {filterButton('Any', mode === 'all', () => setMode('all'), 'any')}
            {filterButton(<span className="flex items-center gap-1"><Sun size={11} />Light</span>, mode === 'light', () => setMode('light'), 'light')}
            {filterButton(<span className="flex items-center gap-1"><Moon size={11} />Dark</span>, mode === 'dark', () => setMode('dark'), 'dark')}
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {visible.map((theme) => {
          const selected = settings.theme === theme.id
          return (
            <motion.button
              key={theme.id}
              type="button"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => choose(theme)}
              disabled={busy === theme.id}
              className={cn(
                'relative overflow-hidden rounded-xl border p-2.5 text-left transition',
                selected
                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.08)] shadow-md'
                  : 'bg-[rgb(var(--surface)/.45)] hover:border-[rgb(var(--primary)/.4)] hover:bg-[rgb(var(--surface)/.8)]'
              )}
            >
              {selected && <span className="absolute right-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full bg-[rgb(var(--primary))] text-white shadow"><Check size={11} strokeWidth={3} /></span>}
              <div
                className="mb-2 flex h-14 items-end gap-1 overflow-hidden rounded-lg border p-1.5"
                style={{ background: `rgb(${theme.canvas})` }}
              >
                <span className="h-full flex-1 rounded" style={{ background: `rgb(${theme.surface})` }} />
                <span className="h-2/3 w-3 rounded" style={{ background: `rgb(${theme.primary})` }} />
                <span className="h-1/2 w-3 rounded" style={{ background: `rgb(${theme.secondary})` }} />
                <span className="h-1/3 w-3 rounded" style={{ background: `rgb(${theme.accent})` }} />
              </div>
              <div className="flex items-center gap-1.5">
                <b className="truncate text-xs">{theme.name}</b>
                <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--border)/.65)] px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-[rgb(var(--muted))]">
                  {theme.mode === 'dark' ? <Moon size={8} /> : <Sun size={8} />}{theme.family}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[rgb(var(--muted))]">{theme.description}</p>
            </motion.button>
          )
        })}
      </div>

      {!visible.length && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-xs text-[rgb(var(--muted))]">
          <Sparkles size={14} />No theme matches these filters.
        </p>
      )}
    </div>
  )
}
