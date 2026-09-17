'use client'

import { motion } from 'framer-motion'
import { Pin, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { colorOf, displayTag, noteTags, preview, priorityOf, when } from '@/lib/notes-presentation'

/**
 * One row of the notes list. Purely presentational: the page owns selection,
 * pinning and deletion; the card only reports intent.
 */
export default function NoteCard({
  note,
  active,
  onSelect,
  onContextMenu,
  onTogglePin,
  onRemove,
  onFilterTag
}: any) {
  const tags = noteTags(note)
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, scale: active ? 1.015 : 1 }}
      exit={{ opacity: 0, height: 0 }}
      whileHover={{ y: -2 }}
      transition={{ layout: { type: 'spring', stiffness: 400, damping: 32 } }}
      type="button"
      onClick={() => onSelect(note)}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu(event, note)
      }}
      style={
        note.color && note.color !== 'default' && !active
          ? { background: colorOf(note.color).tint, borderColor: colorOf(note.color).edge }
          : undefined
      }
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border bg-[rgb(var(--canvas))] p-2 text-left transition-all duration-200 hover:border-[rgb(var(--primary)/.55)] hover:shadow-md hover:shadow-black/5',
        active &&
          'border-[rgb(var(--primary)/.65)] bg-[rgb(var(--primary)/.08)] shadow-[0_0_0_1px_rgb(var(--primary)/.28),0_10px_30px_-14px_rgb(var(--primary)/.5)]',
        Boolean(note.pinned) && !active && 'shadow-sm'
      )}
    >
      {/* A colour is only useful if it can be spotted without reading. */}
      {note.color && note.color !== 'default' && !active && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: colorOf(note.color).swatch }}
        />
      )}
      {/* The open note carries the same spring-animated indicator
          bar as the sidebar's active page (v2.0.16). */}
      {active && (
        <motion.span
          layoutId="note-active-bar"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-[rgb(var(--primary))] shadow-[0_0_12px_rgb(var(--primary)/.75)]"
        />
      )}
      <div className="flex items-center gap-1.5">
        {/* Pin lives on the LEFT, vertically centered in the
            card — one click pins/unpins right from the list. */}
        <span
          role="button"
          tabIndex={0}
          aria-label={note.pinned ? `Unpin ${note.name}` : `Pin ${note.name}`}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
          onClick={(event) => {
            event.stopPropagation()
            onTogglePin(note)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.stopPropagation()
              onTogglePin(note)
            }
          }}
          className={cn(
            'grid h-7 w-6 shrink-0 place-items-center self-center rounded-md transition',
            note.pinned
              ? 'text-[rgb(var(--primary))]'
              : 'text-[rgb(var(--muted))] opacity-40 hover:opacity-100 group-hover:opacity-100'
          )}
        >
          <Pin size={13} fill={note.pinned ? 'currentColor' : 'none'} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {Number(note.priority) > 0 &&
              (() => {
                const level = priorityOf(note.priority)
                const Icon = level.icon
                return (
                  <span
                    className="flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5 text-xs font-extrabold uppercase"
                    style={{ color: level.tone, background: 'rgb(var(--surface)/.85)' }}
                  >
                    <Icon size={9} /> {level.short}
                  </span>
                )
              })()}
            <span className="min-w-0 flex-1 truncate text-xs font-extrabold">{note.name}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Delete ${note.name}`}
              onClick={(event) => {
                event.stopPropagation()
                onRemove(note)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.stopPropagation()
                  onRemove(note)
                }
              }}
              className="shrink-0 rounded-md p-1 text-[rgb(var(--muted))] opacity-0 transition hover:bg-nord-11/15 hover:text-nord-11 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-[rgb(var(--muted))]">{preview(note.body)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                role="button"
                tabIndex={0}
                aria-label={`Filter by ${displayTag(tag)}`}
                title={`Filter by ${displayTag(tag)}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onFilterTag(tag)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.stopPropagation()
                    onFilterTag(tag)
                  }
                }}
                className="rounded-full bg-[rgb(var(--primary)/.1)] px-1.5 py-0.5 text-xs font-bold text-[rgb(var(--primary))] transition hover:bg-[rgb(var(--primary)/.2)]"
              >
                {displayTag(tag)}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-xs font-bold text-[rgb(var(--muted))]">+{tags.length - 3}</span>
            )}
            <span className="ml-auto flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
              <span className="h-1 w-1 rounded-full bg-[rgb(var(--border))]" />
              {when(note.updated_at)}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}
