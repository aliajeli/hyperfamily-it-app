'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Moon, Palette, Sun, Sparkles, Wand2, RotateCcw, Save } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  THEMES,
  THEME_FAMILIES,
  THEME_VARS,
  THEME_VAR_DETAILS,
  CUSTOM_THEME_ID,
  applyTheme,
  findTheme,
  buildCustomTheme,
  defaultCustomColors,
  parseCustomColors,
  tripletToHex,
  hexToTriplet
} from '@/lib/themes'
import { Button } from '@/components/ui'
import { getApi } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

/**
 * Theme picker plus a full custom-palette editor.
 *
 * The preset grid and the editor share one preview path: editing a swatch
 * calls applyTheme immediately, so the page the user is judging *is* the
 * preview. Saving only persists what is already on screen, and leaving the tab
 * without saving restores the stored theme, so an experiment can never be
 * stranded half-applied.
 */
export default function ThemeSettings({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [family, setFamily] = useState('all')
  const [mode, setMode] = useState('all')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(settings.theme === CUSTOM_THEME_ID)
  const [custom, setCustom] = useState(() => ({ ...defaultCustomColors(), ...(parseCustomColors(settings.theme_custom) || {}) }))
  const [dirty, setDirty] = useState(false)

  const isCustomActive = settings.theme === CUSTOM_THEME_ID
  const customTheme = useMemo(() => buildCustomTheme(custom), [custom])

  // Abandoning an unsaved experiment must not leave the app in those colours.
  useEffect(() => () => {
    if (dirty) applyTheme(settings.theme || THEMES[0].id, parseCustomColors(settings.theme_custom))
    // The cleanup intentionally reads the values captured at unmount time.
  }, [dirty, settings.theme, settings.theme_custom])

  const visible = useMemo(() => THEMES.filter((theme) => (
    (family === 'all' || theme.family === family) && (mode === 'all' || theme.mode === mode)
  )), [family, mode])

  const persist = async (patch, label, revert) => {
    try {
      const next = await getApi().settings.save(patch)
      onSaved(next)
      setGlobalSettings(next)
      setDirty(false)
      toast.success(label)
    } catch (error) {
      revert?.()
      toast.error(error.message)
    }
  }

  const choose = async (theme) => {
    const previous = findTheme(settings.theme, parseCustomColors(settings.theme_custom))
    applyTheme(theme)
    setBusy(theme.id)
    await persist({ theme: theme.id }, `${theme.name} applied`, () => applyTheme(previous))
    setBusy('')
  }

  const editColor = (key, hex) => {
    const nextColors = { ...custom, [key]: hexToTriplet(hex) }
    setCustom(nextColors)
    setDirty(true)
    // Live preview: the whole app repaints as the slider moves.
    applyTheme(buildCustomTheme(nextColors))
  }

  const saveCustom = async () => {
    setBusy(CUSTOM_THEME_ID)
    applyTheme(customTheme)
    await persist(
      { theme: CUSTOM_THEME_ID, theme_custom: JSON.stringify(custom) },
      'Custom theme saved',
      () => applyTheme(findTheme(settings.theme, parseCustomColors(settings.theme_custom)))
    )
    setBusy('')
  }

  const startFrom = (theme) => {
    const nextColors = Object.fromEntries(THEME_VARS.map((key) => [key, theme[key]]))
    setCustom(nextColors)
    setDirty(true)
    applyTheme(buildCustomTheme(nextColors))
    toast.info(`Custom theme seeded from ${theme.name} — press Save to keep it`)
  }

  const filterButton = (label, active, onClick, key) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2 py-0.5 text-[11px] font-bold transition',
        active
          ? 'bg-[rgb(var(--primary))] text-white shadow-sm'
          : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]'
      )}
    >{label}</button>
  )

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 rounded-xl border bg-[rgb(var(--surface)/.42)] px-2.5 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[rgb(var(--primary)/.14)] p-1.5 text-[rgb(var(--primary))]"><Palette size={15} /></div>
          <div>
            <h2 className="text-[13px] font-extrabold">Appearance</h2>
            <p className="text-[10.5px] text-[rgb(var(--muted))]">{THEMES.length} palettes plus your own custom theme. Applied instantly.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border bg-[rgb(var(--surface)/.6)] p-0.5">
            {filterButton('All sets', family === 'all', () => setFamily('all'), 'all')}
            {THEME_FAMILIES.map((item) => filterButton(item, family === item, () => setFamily(item), item))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border bg-[rgb(var(--surface)/.6)] p-0.5">
            {filterButton('Any', mode === 'all', () => setMode('all'), 'any')}
            {filterButton(<span className="flex items-center gap-1"><Sun size={11} />Light</span>, mode === 'light', () => setMode('light'), 'light')}
            {filterButton(<span className="flex items-center gap-1"><Moon size={11} />Dark</span>, mode === 'dark', () => setMode('dark'), 'dark')}
          </div>
          <Button
            type="button"
            size="sm"
            variant={editing ? 'default' : 'secondary'}
            onClick={() => setEditing((current) => !current)}
            aria-expanded={editing}
          >
            <Wand2 size={14} />Custom theme
          </Button>
        </div>
      </div>

      {editing && (
        <section aria-label="Custom theme editor" className="rounded-xl border border-[rgb(var(--primary)/.35)] bg-[rgb(var(--primary)/.05)] p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-xs">Custom colours</b>
            <span className="text-[10.5px] text-[rgb(var(--muted))]">Every change previews live on this page.</span>
            {isCustomActive && !dirty && (
              <span className="flex items-center gap-1 rounded-full bg-nord-14/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-[#66834e]"><Check size={9} strokeWidth={3} />Active</span>
            )}
            {dirty && <span className="rounded-full bg-nord-13/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-[#8b6e1c]">Unsaved</span>}
            <div className="ml-auto flex items-center gap-1.5">
              <Button type="button" size="sm" onClick={saveCustom} disabled={busy === CUSTOM_THEME_ID}>
                <Save size={14} />{busy === CUSTOM_THEME_ID ? 'Saving…' : 'Save & apply'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => startFrom(findTheme(settings.theme === CUSTOM_THEME_ID ? THEMES[0].id : settings.theme))}>
                <RotateCcw size={14} />Reset
              </Button>
            </div>
          </div>

          <div className="mt-2 grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {THEME_VARS.map((key) => {
              const detail = THEME_VAR_DETAILS[key] || { label: key, hint: '' }
              const hex = tripletToHex(custom[key])
              return (
                <label key={key} className="flex items-center gap-2 rounded-lg border bg-[rgb(var(--surface))] p-1.5" title={detail.hint}>
                  <input
                    type="color"
                    aria-label={`${detail.label} colour`}
                    value={hex}
                    onChange={(event) => editColor(key, event.target.value)}
                    className="h-7 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                  />
                  <span className="min-w-0">
                    <b className="block truncate text-[10.5px] leading-tight">{detail.label}</b>
                    <span className="block font-mono text-[9px] uppercase text-[rgb(var(--muted))]">{hex}</span>
                  </span>
                </label>
              )
            })}
          </div>

          <p className="mt-1.5 text-[10px] text-[rgb(var(--muted))]">
            Tip: click any preset below while this editor is open to copy its palette here as a starting point.
          </p>
        </section>
      )}

      {/* 41 palettes cannot fit a 768px screen at a readable size, so the
          list scrolls inside its own bounded region: the settings page itself
          never grows a scrollbar, which is the actual requirement. */}
      <div className={cn(
        'scroll-y grid gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8',
        // The editor eats roughly a fifth of the viewport when it is open, so
        // the preset list gives that space back instead of pushing the page
        // past one screen.
        editing ? 'max-h-[40vh]' : 'max-h-[62vh]'
      )}>
        {(editing ? [customTheme, ...visible] : visible).map((theme) => {
          const selected = theme.id === CUSTOM_THEME_ID ? isCustomActive : settings.theme === theme.id
          const isCustomCard = theme.id === CUSTOM_THEME_ID
          return (
            <motion.button
              key={theme.id}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => (isCustomCard ? saveCustom() : editing ? startFrom(theme) : choose(theme))}
              disabled={busy === theme.id}
              className={cn(
                'relative overflow-hidden rounded-lg border p-1.5 text-left transition',
                selected
                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.08)] shadow-md'
                  : 'bg-[rgb(var(--surface)/.45)] hover:border-[rgb(var(--primary)/.4)] hover:bg-[rgb(var(--surface)/.8)]'
              )}
            >
              {selected && <span className="absolute right-1 top-1 z-10 grid h-3.5 w-3.5 place-items-center rounded-full bg-[rgb(var(--primary))] text-white shadow"><Check size={8} strokeWidth={3} /></span>}
              <div
                className="mb-1 flex h-7 items-end gap-0.5 overflow-hidden rounded-md border p-0.5"
                style={{ background: `rgb(${theme.canvas})` }}
              >
                <span className="h-full flex-1 rounded" style={{ background: `rgb(${theme.surface})` }} />
                <span className="h-2/3 w-2 rounded-sm" style={{ background: `rgb(${theme.primary})` }} />
                <span className="h-1/2 w-2 rounded-sm" style={{ background: `rgb(${theme.secondary})` }} />
                <span className="h-1/3 w-2 rounded-sm" style={{ background: `rgb(${theme.accent})` }} />
              </div>
              <div className="flex items-center gap-1">
                <b className="min-w-0 truncate text-[10px]" title={theme.name}>{theme.name}</b>
                <span className="ml-auto shrink-0 text-[rgb(var(--muted))]" title={`${isCustomCard ? 'Custom' : theme.family} · ${theme.mode}`}>
                  {theme.mode === 'dark' ? <Moon size={9} /> : <Sun size={9} />}
                </span>
              </div>
            </motion.button>
          )
        })}
      </div>

      {!visible.length && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-xs text-[rgb(var(--muted))]">
          <Sparkles size={14} />No theme matches these filters.
        </p>
      )}
    </div>
  )
}
