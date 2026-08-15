'use client'

import { useState } from 'react'
import { PlugZap, RotateCcw, Save, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@/components/ui'
import { getApi } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings.store'
import { DEVICE_TYPES, DEVICE_TYPE_DETAILS } from '@/lib/constants'
import {
  CONNECTION_METHODS,
  CONNECTION_METHOD_IDS,
  DEFAULT_CONNECTION_METHODS,
  connectionSettingKey,
  resolveConnectionMethods
} from '@/lib/connection-methods'

/**
 * Per-device-type connection methods.
 *
 * Moved out of Device tools, which was carrying two unrelated jobs: where the
 * TeamViewer and Winbox executables live, and how each kind of equipment should
 * be reached. The second one is the one operators actually revisit, so it gets
 * its own tab and enough room to show all ten types at once.
 *
 * Several methods can be enabled for one type; the first enabled one is that
 * type's default and the rest appear as alternatives in the device menu.
 * Clicking an enabled method promotes it to default, which is why order is
 * preserved rather than recomputed from the checkbox order.
 */
export default function ConnectionsSettings({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(DEVICE_TYPES.map((type) => [type, resolveConnectionMethods(type, settings)])))
  const [saving, setSaving] = useState(false)

  const toggle = (type, methodId) => {
    setDraft((current) => {
      const list = current[type] || []
      // Never leave a device type with no way to connect.
      if (list.includes(methodId)) {
        if (list.length === 1) {
          toast.error(`${DEVICE_TYPE_DETAILS[type]?.label || type} needs at least one connection method`)
          return current
        }
        return { ...current, [type]: list.filter((id) => id !== methodId) }
      }
      return { ...current, [type]: [...list, methodId] }
    })
  }

  const makeDefault = (type, methodId) => {
    setDraft((current) => {
      const list = current[type] || []
      if (!list.includes(methodId)) return current
      return { ...current, [type]: [methodId, ...list.filter((id) => id !== methodId)] }
    })
  }

  const restoreDefaults = () => {
    setDraft(Object.fromEntries(DEVICE_TYPES.map((type) => [type, [...(DEFAULT_CONNECTION_METHODS[type] || ['browser'])]])))
    toast.info('Factory connection methods restored — save to apply')
  }

  const save = async () => {
    setSaving(true)
    try {
      const patch = Object.fromEntries(DEVICE_TYPES.map((type) => [connectionSettingKey(type), draft[type]]))
      const next = await getApi().settings.save(patch)
      onSaved(next)
      setGlobalSettings(next)
      toast.success('Connection methods saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><PlugZap size={15} />Connection method per device type</CardTitle>
        <CardDescription className="text-[10.5px]">
          Click a method to enable it, click an enabled one to make it the default (★), and use its × to remove it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {DEVICE_TYPES.map((type) => {
            const list = draft[type] || []
            return (
              <div key={type} className="rounded-lg border border-[rgb(var(--border))] p-1.5">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <b className="text-[11px]">{DEVICE_TYPE_DETAILS[type]?.label || type}</b>
                  <span className="truncate text-[9px] text-[rgb(var(--muted))]">
                    {CONNECTION_METHODS[list[0]]?.label || 'None'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CONNECTION_METHOD_IDS.map((methodId) => {
                    const enabled = list.includes(methodId)
                    const isDefault = list[0] === methodId
                    const label = CONNECTION_METHODS[methodId].label
                    // The chip is a wrapper, not a button, so the label and the
                    // remove control can be two real sibling buttons. Nesting a
                    // button inside a button is invalid HTML and breaks clicks.
                    return (
                      <span
                        key={methodId}
                        title={CONNECTION_METHODS[methodId].description}
                        className={`flex items-center rounded-lg border text-[9.5px] font-semibold transition ${
                          isDefault
                            ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.14)] text-[rgb(var(--primary))]'
                            : enabled
                              ? 'border-[rgb(var(--border))] bg-[rgb(var(--border)/.4)] text-[rgb(var(--text))]'
                              : 'border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.35)]'
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={enabled}
                          aria-label={
                            enabled
                              ? (isDefault ? `${label} is the default for ${type}` : `Make ${label} the default for ${type}`)
                              : `Enable ${label} for ${type}`
                          }
                          onClick={() => (enabled ? makeDefault(type, methodId) : toggle(type, methodId))}
                          className="flex items-center gap-1 py-0.5 pl-1.5 pr-1.5"
                        >
                          {isDefault && <Star size={9} fill="currentColor" />}
                          {label}
                        </button>
                        {enabled && list.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remove ${label} from ${type}`}
                            title={`Remove ${label}`}
                            onClick={() => toggle(type, methodId)}
                            className="py-0.5 pl-0 pr-1.5 opacity-55 transition hover:opacity-100"
                          >
                            <X size={9} strokeWidth={3} />
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save connection methods'}</Button>
          <Button size="sm" variant="secondary" onClick={restoreDefaults}><RotateCcw size={14} />Restore defaults</Button>
        </div>
      </CardContent>
    </Card>
  )
}
