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
 * Per-device-type connection methods — linear edition (v2.0.12).
 *
 * Each device type is a single horizontal card and every method is one
 * chip in its row, so all ten types stay visible without the page growing a
 * scrollbar. Interactions kept from the previous grid:
 *
 *   - click a dim chip       -> enable the method (one or several can be on)
 *   - click an enabled chip  -> promote it to default (★, reorders to the front)
 *   - click its ×            -> remove the method (the last one can never go)
 *
 * Framer Motion animates the selection (spring check/star pops, a pulse on
 * enable) and the reorder when a method is promoted.
 */

const spring = { type: 'spring', stiffness: 600, damping: 28 }

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
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center gap-2 text-sm"><PlugZap size={15} />Connection method per device type</CardTitle>
        <CardDescription className="text-[10.5px]">
          Click a method to enable it, click an enabled one to make it the default (★), and use its × to remove it. Several methods can stay enabled at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-1">
          {DEVICE_TYPES.map((type, index) => {
            const list = draft[type] || []
            const defaultLabel = CONNECTION_METHODS[list[0]]?.label || 'None'
            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02, duration: 0.28, ease: 'easeOut' }}
                className="flex items-center gap-2 rounded-xl border bg-[rgb(var(--surface)/.4)] py-1 pl-2.5 pr-2 transition-colors hover:bg-[rgb(var(--surface)/.7)]"
              >
                <div className="w-32 shrink-0 sm:w-36">
                  <b className="block text-[11px] leading-tight">{DEVICE_TYPE_DETAILS[type]?.label || type}</b>
                  <span className="block truncate text-[9px] leading-tight text-[rgb(var(--muted))]" title={`Default: ${defaultLabel}`}>
                    {defaultLabel}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  <AnimatePresence initial={false} mode="popLayout">
                    {CONNECTION_METHOD_IDS.map((methodId) => {
                      const enabled = list.includes(methodId)
                      const isDefault = list[0] === methodId
                      const label = CONNECTION_METHODS[methodId].label
                      // The chip and its remove control are sibling buttons
                      // inside one animated wrapper (nesting buttons would be
                      // invalid HTML), so the wrapper carries the layout
                      // animation while both controls stay real buttons.
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
                                ? (isDefault ? `${label} is the default for ${type}` : `Make ${label} the default for ${type}`)
                                : `Enable ${label} for ${type}`
                            }
                            onClick={() => (enabled ? makeDefault(type, methodId) : toggle(type, methodId))}
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
                              aria-label={`Remove ${label} from ${type}`}
                              title={`Remove ${label}`}
                              onClick={() => toggle(type, methodId)}
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
              </motion.div>
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
