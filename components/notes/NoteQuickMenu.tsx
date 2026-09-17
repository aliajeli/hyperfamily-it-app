'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NOTE_COLORS, PRIORITIES } from '@/lib/notes-presentation'

/**
 * Right-click menu: colour + priority for the note under the cursor.
 * Position clamping keeps it inside the viewport.
 */
export default function NoteQuickMenu({ menu, note, onClose, onQuickUpdate }: any) {
  if (!note) return null
  const width = 236
  const height = 268
  const left = Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 12)
  const top = Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - height - 12)
  return (
    <>
      <div
        className="fixed inset-0 z-[70]"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <motion.div
        role="menu"
        aria-label={`Actions for ${note.name}`}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="dialog-content fixed z-[80] rounded-xl border bg-[rgb(var(--surface))] p-2 shadow-2xl"
        style={{ left, top, width }}
      >
        <p className="px-1 text-xs font-extrabold uppercase tracking-wider text-[rgb(var(--muted))]">
          Colour
        </p>
        <div className="mt-1 flex items-center gap-1.5 px-1">
          {NOTE_COLORS.map((entry) => {
            const active = (note.color || 'default') === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                aria-label={`Set ${entry.label} colour`}
                title={entry.label}
                onClick={() => {
                  onClose()
                  onQuickUpdate(note, { color: entry.id }, 'Note colour updated')
                }}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full border-2 transition-all duration-150 hover:scale-110',
                  active ? 'border-[rgb(var(--text))]' : 'border-transparent'
                )}
                style={{ background: entry.swatch }}
              >
                {active && <Check size={10} className="text-[rgb(var(--canvas))]" strokeWidth={3.5} />}
              </button>
            )
          })}
        </div>

        <div className="my-1.5 h-px bg-[rgb(var(--border)/.7)]" />

        <p className="px-1 text-xs font-extrabold uppercase tracking-wider text-[rgb(var(--muted))]">
          Priority
        </p>
        <div className="mt-1 grid gap-0.5 px-0.5">
          {PRIORITIES.map((level) => {
            const Icon = level.icon
            const active = Number(note.priority || 0) === level.id
            return (
              <button
                key={level.id}
                type="button"
                aria-label={`Set ${level.label} priority`}
                onClick={() => {
                  onClose()
                  onQuickUpdate(note, { priority: level.id }, 'Priority updated')
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-bold transition',
                  active ? 'bg-[rgb(var(--border)/.4)]' : 'hover:bg-[rgb(var(--border)/.4)]'
                )}
              >
                <Icon size={11} style={{ color: level.tone }} />
                <span>{level.label}</span>
                {active && <Check size={11} className="ml-auto" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      </motion.div>
    </>
  )
}
