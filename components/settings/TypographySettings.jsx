'use client'

import { useEffect, useState } from 'react'
import { RotateCcw, Save, Type } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Select } from '@/components/ui'
import { getApi } from '@/lib/api'
import {
  FONT_GROUPS, MONO_FONTS, SCALE_MAX, SCALE_MIN, SCALE_STEP, UI_FONTS,
  applyTypography, fontStack, normalizeScale, rememberTypography, typographySnapshot
} from '@/lib/typography'
import { useSettingsStore } from '@/stores/settings.store'

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
      toast.success('Typography saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => setForm({ ...DEFAULTS })

  return (
    <div className="space-y-2.5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Type size={15} />Font groups</CardTitle>
          <CardDescription className="text-[11px]">
            Every piece of text belongs to one of these five groups. Changes preview live; press Save to keep them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {FONT_GROUPS.map((group) => {
            const catalogue = group.id === 'mono' ? MONO_FONTS : UI_FONTS
            const familyKey = `font_${group.id}_family`
            const sizeKey = `font_${group.id}_size`
            const size = normalizeScale(form[sizeKey])
            const stack = fontStack(form[familyKey], catalogue)

            return (
              <div key={group.id} className="grid items-center gap-2 rounded-lg border p-1.5 lg:grid-cols-[7rem_minmax(0,1fr)_15rem]">
                <div className="min-w-0">
                  <b className="text-[11px]">{group.label}</b>
                  <span className="block truncate text-[9.5px] leading-snug text-[rgb(var(--muted))]" title={group.description}>{group.description}</span>
                </div>

                <div
                  className="min-w-0 truncate rounded-md bg-[rgb(var(--canvas))] px-2 py-1"
                  style={{ fontFamily: stack || undefined, fontSize: `${(group.id === 'mono' ? 12 : 14) * (size / 100)}px` }}
                  title={group.sample}
                >
                  {group.sample}
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Typeface</span>
                    <Select
                      aria-label={`${group.label} font family`}
                      value={form[familyKey] || ''}
                      onChange={(event) => update(familyKey, event.target.value)}
                      className="h-7 text-[11px]"
                    >
                      {catalogue.map((font) => <option key={font.id || 'default'} value={font.id}>{font.label}</option>)}
                    </Select>
                  </label>
                  <label className="w-[4.5rem]">
                    <span className="sr-only">Size</span>
                    <Select
                      aria-label={`${group.label} font size`}
                      value={String(size)}
                      onChange={(event) => update(sizeKey, Number(event.target.value))}
                      className="h-7 text-[11px]"
                    >
                      {Array.from({ length: (SCALE_MAX - SCALE_MIN) / SCALE_STEP + 1 }, (_, index) => SCALE_MIN + index * SCALE_STEP)
                        .map((value) => <option key={value} value={value}>{value}%</option>)}
                    </Select>
                  </label>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save typography'}</Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={saving}><RotateCcw size={14} />Reset to defaults</Button>
      </div>
    </div>
  )
}
