'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Save, Type } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Select } from '@/components/ui'
import { getApi } from '@/lib/api'
import {
  FONT_GROUPS, MONO_FONTS, UI_FONTS,
  applyTypography, fontStack, normalizeScale, pxForScale, pxOptionsFor,
  rememberTypography, scaleForPx, typographySnapshot
} from '@/lib/typography'
import { useSettingsStore } from '@/stores/settings.store'

const DEFAULTS = typographySnapshot({})

export default function TypographySettings({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [form, setForm] = useState(() => typographySnapshot(settings))
  const [saving, setSaving] = useState(false)
  // The typography values this form was last seeded from, kept in a ref so
  // re-seeding never triggers a render of its own.
  const appliedRef = useRef(typographySnapshot(settings))
  const sameSnapshot = (a, b) => Object.keys(a).every((key) => String(a[key] ?? '') === String(b[key] ?? ''))

  /**
   * The settings page replaces its settings object on EVERY save, including the
   * ones made from another tab. Re-seeding the form on each of those replaced
   * the operator's edits with whatever was in flight at that moment — which is
   * exactly the "I change the size, press Save, and it jumps back" fault. The
   * form is therefore only re-seeded when the stored typography itself changed,
   * and nothing is reverted when the tab is left.
   */
  useEffect(() => {
    const stored = typographySnapshot(settings)
    if (sameSnapshot(stored, appliedRef.current)) return
    appliedRef.current = stored
    setForm(stored)
  }, [settings])

  // Preview live: every edit is applied to the document immediately so the
  // operator judges the result on the real interface, not on a sample string.
  useEffect(() => { applyTypography(form) }, [form])

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  // Deliberately NOT memoised: `appliedRef` changes on save without causing a
  // render of its own, so a memo keyed on the form alone would keep reporting
  // "unsaved changes" after a successful save.
  const dirty = !sameSnapshot(typographySnapshot(form), appliedRef.current)

  const save = async () => {
    setSaving(true)
    try {
      const next = await getApi().settings.save(form)
      appliedRef.current = typographySnapshot(next)
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
          <CardDescription className="text-xs">
            Every piece of text belongs to one of these five groups. Changes apply to the whole application immediately; press Save to keep them after a restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {FONT_GROUPS.map((group) => {
            const catalogue = group.id === 'mono' ? MONO_FONTS : UI_FONTS
            const familyKey = `font_${group.id}_family`
            const sizeKey = `font_${group.id}_size`
            const size = normalizeScale(form[sizeKey], group.id)
            const sizePx = pxForScale(group.id, size)
            // The Monospace group always shows its default (System Monospace)
            // in the dropdown, even on installs whose stored settings predate
            // the typography feature and carry an empty value.
            const familyValue = form[familyKey] || (group.id === 'mono' ? 'ui-monospace' : '')
            const stack = fontStack(familyValue, catalogue)
            const stored = typographySnapshot(appliedRef.current)
            const changed = String(form[sizeKey] ?? '') !== String(stored[sizeKey] ?? '')
              || String(form[familyKey] ?? '') !== String(stored[familyKey] ?? '')

            return (
              /* The controls column is deliberately roomy so the default
                 values ("Default Font", "24px (default)") never truncate. */
              <div key={group.id} className={`grid items-center gap-2 rounded-lg border p-1.5 lg:grid-cols-[7rem_minmax(0,1fr)_19rem] ${changed ? 'border-[rgb(var(--primary)/.45)]' : ''}`}>
                <div className="min-w-0">
                  <b className="text-2xs">{group.label}</b>
                  <span className="block truncate text-2xs leading-snug text-[rgb(var(--muted))]" title={group.description}>{group.description}</span>
                </div>

                {/* The sample is sized in raw pixels on purpose: it must show
                    the chosen size itself, not the group scale applied twice. */}
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
                      value={familyValue}
                      onChange={(event) => update(familyKey, event.target.value)}
                      className="h-7 text-2xs"
                    >
                      {catalogue.map((font) => <option key={font.id || 'default'} value={font.id}>{font.label}</option>)}
                    </Select>
                  </label>
                  <label className="w-[8.5rem] shrink-0">
                    <span className="sr-only">Size</span>
                    <Select
                      aria-label={`${group.label} font size`}
                      value={String(sizePx)}
                      onChange={(event) => update(sizeKey, scaleForPx(group.id, Number(event.target.value)))}
                      className="h-7 text-2xs"
                    >
                      {pxOptionsFor(group.id).map((px) => {
                        const isDefault = px === pxForScale(group.id, 100)
                        return <option key={px} value={px}>{isDefault ? `${px}px (default)` : `${px}px`}</option>
                      })}
                    </Select>
                  </label>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || !dirty}><Save size={14} />{saving ? 'Saving…' : 'Save typography'}</Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={saving}><RotateCcw size={14} />Reset to defaults</Button>
        <span className="text-2xs text-[rgb(var(--muted))]">
          {dirty ? 'Unsaved changes are already visible in the application.' : 'Everything shown is saved.'}
        </span>
      </div>
    </div>
  )
}
