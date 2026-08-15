'use client'

import { useState } from 'react'
import { PlugZap, RotateCcw, Save, Star, Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@/components/ui'
import { getApi } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings.store'
import { DEVICE_TYPES, DEVICE_TYPE_DETAILS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  CONNECTION_METHODS,
  CONNECTION_METHOD_IDS,
  DEFAULT_CONNECTION_METHODS,
  connectionSettingKey,
  resolveConnectionMethods
} from '@/lib/connection-methods'

/**
 * Per-device-type connection methods — master/detail edition (v2.0.13).
 *
 * The device types live in a compact list on the left; picking one opens its
 * connection methods on the right. Each method is one selectable chip:
 *
 *   - click a dim chip       -> enable the method (several can be on)
 *   - click an enabled chip  -> promote it to default (★, moves to the front)
 *   - click its ×            -> remove the method (the last one can never go)
 *
 * Framer Motion animates the selection (spring check/star pops, a pulse on
 * enable), the reorder when a method is promoted, and the swap between
 * device types.
 */

const spring = { type: 'spring', stiffness: 600, damping: 28 }

export default function ConnectionsSettings({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(DEVICE_TYPES.map((type) => [type, resolveConnectionMethods(type, settings)])))
  const [selected, setSelected] = useState(DEVICE_TYPES[0])
  const [saving, setSaving] = useState(false)

  const list = draft[selected] || []

  const toggle = (type, methodId) => {
    setDraft((current) => {
      const methods = current[type] || []
      // Never leave a device type with no way to connect.
      if (methods.includes(methodId)) {
        if (methods.length === 1) {
          toast.error(`${DEVICE_TYPE_DETAILS[type]?.label || type} needs at least one connection method`)
          return current
        }
        return { ...current, [type]: methods.filter((id) => id !== methodId) }
      }
      return { ...current, [type]: [...methods, methodId] }
    })
  }

  const makeDefault = (type, methodId) => {
    setDraft((current) => {
      const methods = current[type] || []
      if (!methods.includes(methodId)) return current
      return { ...current, [type]: [methodId, ...methods.filter((id) => id !== methodId)] }
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

  const detail = DEVICE_TYPE_DETAILS[selected] || {}

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center gap-2 text-sm"><PlugZap size={15} />Connection method per device type</CardTitle>
        <CardDescription className="text-[10.5px]">
          Pick a device type on the left, then choose how it is reached. Click a method to enable it, click an enabled one to make it the default (★), and use its × to remove it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 lg:grid-cols-[15rem_minmax(0,1fr)]">
          {/* Device type list ------------------------------------------------- */}
          <div
            role="tablist"
            aria-label="Device types"
            className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-xl border bg-[rgb(var(--canvas)/.6)] p-1 lg:max-h-none"
          >
            {DEVICE_TYPES.map((type, index) => {
              const methods = draft[type] || []
              const active = selected === type
              const defaultLabel = CONNECTION_METHODS[methods[0]]?.label || 'None'
              return (
                <motion.button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Edit connection methods for ${DEVICE_TYPE_DETAILS[type]?.label || type}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.22, ease: 'easeOut' }}
                  onClick={() => setSelected(type)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150',
                    active
                      ? 'bg-[rgb(var(--primary))] text-white shadow-sm'
                      : 'text-[rgb(var(--text))] hover:bg-[rgb(var(--border)/.5)]'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[11px] leading-tight">{DEVICE_TYPE_DETAILS[type]?.label || type}</b>
                    <span className={cn('block truncate text-[9px] leading-tight', active ? 'text-white/80' : 'text-[rgb(var(--muted))]')}>
                      {defaultLabel}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors',
                      active ? 'border-white/60' : 'border-[rgb(var(--border))]'
                    )}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                </motion.button>
              )
            })}
          </div>

          {/* Methods for the selected type ------------------------------------- */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex min-w-0 flex-col gap-1.5 rounded-xl border bg-[rgb(var(--surface)/.45)] p-2"
            >
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <div className="min-w-0">
                  <b className="text-[12px]">{detail.label || selected}</b>
                  {detail.description && <span className="ml-1.5 hidden text-[9.5px] text-[rgb(var(--muted))] sm:inline">{detail.description}</span>}
                </div>
                <span className="shrink-0 text-[9.5px] font-semibold text-[rgb(var(--muted))]">
                  {list.length} enabled
                </span>
              </div>

              <div className="flex min-h-[2.5rem] flex-wrap items-center gap-1">
                <AnimatePresence initial={false} mode="popLayout">
                  {CONNECTION_METHOD_IDS.map((methodId) => {
                    const enabled = list.includes(methodId)
                    const isDefault = list[0] === methodId
                    const label = CONNECTION_METHODS[methodId].label
                    return (
                      <motion.span
                        key={methodId}
                        layout="position"
                        transition={{ layout: { type: 'spring', stiffness: 500, damping: 35 } }}
                        exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
                        className="group flex items-center"
                      >
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.88 }}
                          aria-pressed={enabled}
                          title={CONNECTION_METHODS[methodId].description}
                          aria-label={
                            enabled
                              ? (isDefault ? `${label} is the default for ${selected}` : `Make ${label} the default for ${selected}`)
                              : `Enable ${label} for ${selected}`
                          }
                          onClick={() => (enabled ? makeDefault(selected, methodId) : toggle(selected, methodId))}
                          className={cn(
                            'relative flex h-6 items-center gap-1 overflow-hidden rounded-md border px-2 text-[10px] font-semibold transition-colors duration-200',
                            isDefault
                              ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.14)] text-[rgb(var(--primary))] shadow-sm'
                              : enabled
                                ? 'border-[rgb(var(--border))] bg-[rgb(var(--border)/.45)] text-[rgb(var(--text))] hover:border-[rgb(var(--primary)/.5)]'
                                : 'border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.4)] hover:text-[rgb(var(--text))]'
                          )}
                        >
                          {/* One-shot pulse when a method is switched on. */}
                          <AnimatePresence>
                            {enabled && (
                              <motion.span
                                key="pulse"
                                aria-hidden="true"
                                initial={{ scale: 0.8, opacity: 0.65 }}
                                animate={{ scale: 1.25, opacity: 0 }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                                className="absolute inset-0 rounded-md bg-[rgb(var(--primary)/.4)]"
                              />
                            )}
                          </AnimatePresence>

                          <span className="relative grid h-3.5 w-3.5 place-items-center">
                            <AnimatePresence initial={false}>
                              {isDefault ? (
                                <motion.span
                                  key="star"
                                  className="absolute inset-0 grid place-items-center"
                                  initial={{ scale: 0, rotate: -135 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0, rotate: 135 }}
                                  transition={spring}
                                >
                                  <Star size={11} fill="currentColor" />
                                </motion.span>
                              ) : enabled ? (
                                <motion.span
                                  key="check"
                                  className="absolute inset-0 grid place-items-center opacity-55"
                                  initial={{ scale: 0, y: 4 }}
                                  animate={{ scale: 1, y: 0 }}
                                  exit={{ scale: 0, y: -4 }}
                                  transition={spring}
                                >
                                  <Check size={10} strokeWidth={3.5} />
                                </motion.span>
                              ) : null}
                            </AnimatePresence>
                          </span>
                          {label}
                        </motion.button>

                        {enabled && list.length > 1 && (
                          <motion.button
                            type="button"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={spring}
                            aria-label={`Remove ${label} from ${selected}`}
                            title={`Remove ${label}`}
                            onClick={() => toggle(selected, methodId)}
                            className="grid h-6 w-5 shrink-0 place-items-center rounded-r-md text-[rgb(var(--muted))] opacity-45 transition hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))] hover:opacity-100"
                          >
                            <X size={10} strokeWidth={3} />
                          </motion.button>
                        )}
                      </motion.span>
                    )
                  })}
                </AnimatePresence>
              </div>

              <p className="px-0.5 text-[9.5px] leading-snug text-[rgb(var(--muted))]">
                The starred method is used when a device is opened without picking one; the rest appear as alternatives in the device menu.
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save connection methods'}</Button>
          <Button size="sm" variant="secondary" onClick={restoreDefaults}><RotateCcw size={14} />Restore defaults</Button>
        </div>
      </CardContent>
    </Card>
  )
}
