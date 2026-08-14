'use client'

import { useEffect, useState } from 'react'
import { Maximize, RotateCcw, Save, Type } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { getApi } from '@/lib/api'
import {
  FONT_GROUPS, MONO_FONTS, SCALE_MAX, SCALE_MIN, SCALE_STEP, UI_FONTS,
  applyTypography, fontStack, normalizeScale, rememberTypography, typographySnapshot
} from '@/lib/typography'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

const DEFAULTS = typographySnapshot({})

export default function TypographySettings({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [form, setForm] = useState(() => typographySnapshot(settings))
  const [saving, setSaving] = useState(false)

  // Preview live: every edit is applied to the document immediately so the
  // operator judges the result on the real interface, not on a sample string.
  // Saving persists it; leaving without saving restores what is stored.
  useEffect(() => { applyTypography(form) }, [form])
  useEffect(() => () => { applyTypography(typographySnapshot(settings)) }, [settings])

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      const next = await getApi().settings.save(form)
      onSaved(next)
      setGlobalSettings(next)
      applyTypography(next)
      rememberTypography(next)
      toast.success('Typography and scale saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => setForm({ ...DEFAULTS })
  const scale = normalizeScale(form.ui_scale)

  return (
    <div className="space-y-3.5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Maximize size={17} />Interface scale</CardTitle>
          <CardDescription className="text-xs">
            Scales the whole application — text, spacing and controls together. Useful on high-resolution laptop screens where the default is too small.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 text-right text-[10px] font-bold text-[rgb(var(--muted))]">{SCALE_MIN}%</span>
            <input
              type="range"
              aria-label="Interface scale"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={SCALE_STEP}
              value={scale}
              onChange={(event) => update('ui_scale', Number(event.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[rgb(var(--border))] accent-[rgb(var(--primary))]"
            />
            <span className="w-10 text-[10px] font-bold text-[rgb(var(--muted))]">{SCALE_MAX}%</span>
            <span className="w-16 rounded-lg border bg-[rgb(var(--surface))] py-1 text-center font-mono text-xs font-extrabold text-[rgb(var(--primary))]">{scale}%</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[75, 90, 100, 110, 125, 150].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => update('ui_scale', preset)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-bold transition',
                  scale === preset ? 'bg-[rgb(var(--primary))] text-white' : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]'
                )}
              >{preset}%</button>
            ))}
          </div>
          <p className="rounded-xl border border-dashed p-3 text-[11px] leading-relaxed text-[rgb(var(--muted))]">
            Steps of {SCALE_STEP}%, from {SCALE_MIN}% to {SCALE_MAX}%. Changes preview instantly and are kept for the next launch once saved.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Type size={17} />Font groups</CardTitle>
          <CardDescription className="text-xs">
            Every piece of text in the app belongs to one of these five groups. Set a typeface and a relative size for each one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {FONT_GROUPS.map((group) => {
            const catalogue = group.id === 'mono' ? MONO_FONTS : UI_FONTS
            const familyKey = `font_${group.id}_family`
            const sizeKey = `font_${group.id}_size`
            const size = normalizeScale(form[sizeKey])
            const stack = fontStack(form[familyKey], catalogue)

            return (
              <div key={group.id} className="grid items-center gap-3 rounded-xl border p-3 lg:grid-cols-[8rem_minmax(0,1fr)_13rem]">
                <div>
                  <b className="text-xs">{group.label}</b>
                  <span className="mt-0.5 block text-[10px] leading-snug text-[rgb(var(--muted))]">{group.description}</span>
                </div>

                <div
                  className="min-w-0 truncate rounded-lg bg-[rgb(var(--canvas))] px-3 py-2"
                  style={{ fontFamily: stack || undefined, fontSize: `${(group.id === 'mono' ? 12 : 14) * (size / 100)}px` }}
                  title={group.sample}
                >
                  {group.sample}
                </div>

                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">Typeface</span>
                    <select
                      aria-label={`${group.label} font family`}
                      value={form[familyKey] || ''}
                      onChange={(event) => update(familyKey, event.target.value)}
                      className="h-8 w-full rounded-lg border bg-[rgb(var(--surface))] px-2 text-[11px] font-bold outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--focus))]"
                    >
                      {catalogue.map((font) => <option key={font.id || 'default'} value={font.id}>{font.label}</option>)}
                    </select>
                  </label>
                  <label className="w-20">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">Size</span>
                    <select
                      aria-label={`${group.label} font size`}
                      value={size}
                      onChange={(event) => update(sizeKey, Number(event.target.value))}
                      className="h-8 w-full rounded-lg border bg-[rgb(var(--surface))] px-2 text-[11px] font-bold outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--focus))]"
                    >
                      {Array.from({ length: (SCALE_MAX - SCALE_MIN) / SCALE_STEP + 1 }, (_, index) => SCALE_MIN + index * SCALE_STEP)
                        .map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </label>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save typography and scale'}</Button>
        <Button variant="ghost" onClick={reset} disabled={saving}><RotateCcw size={15} />Reset to defaults</Button>
      </div>
    </div>
  )
}
