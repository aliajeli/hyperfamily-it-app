'use client'

import { motion } from 'framer-motion'
import { Check, Hash, Palette, Pin, PinOff, Plus, Save, X } from 'lucide-react'
import { Button, Input, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { colorOf, displayTag, NOTE_COLORS, PRIORITIES, when } from '@/lib/notes-presentation'

/**
 * The editing surface of the open note. The page owns the draft and the save
 * pipeline; this component is the colour/tag/priority toolbar plus the body.
 */
export default function NoteEditor({
  draft,
  setDraft,
  saving,
  dirty,
  nameRef,
  tagInput,
  setTagInput,
  onSave,
  onPin,
  onAddTag,
  onRemoveTag,
  onFilterTag
}: any) {
  return (
    <motion.section
      key={draft.id || 'new'}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative flex min-h-0 flex-col gap-2 overflow-hidden rounded-2xl border bg-[rgb(var(--surface))] p-3"
    >
      {/* The note's colour as a soft banner, so the editor matches the card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, ${colorOf(draft.color || 'default').swatch}, transparent 80%)`,
          opacity: draft.color && draft.color !== 'default' ? 1 : 0.35
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[rgb(var(--primary)/.07)] blur-2xl"
      />

      <div className="flex items-center gap-2">
        <Input
          ref={nameRef}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="Note name"
          aria-label="Note name"
          className="flex-1 border-0 bg-transparent px-0 text-base font-extrabold shadow-none focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="sm"
          title={draft.pinned ? 'Unpin note' : 'Pin note'}
          aria-label={draft.pinned ? 'Unpin note' : 'Pin note'}
          aria-pressed={Boolean(draft.pinned)}
          className={cn(draft.pinned && 'text-[rgb(var(--primary))]')}
          onClick={onPin}
        >
          {draft.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </Button>
        <Button size="sm" onClick={() => onSave()} disabled={saving || !dirty}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* Colour, tags and priority sit above the body: all describe the
        whole note, and each is one click rather than a buried menu. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-[rgb(var(--canvas))] px-2.5 py-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Note colour">
          <Palette size={13} className="text-[rgb(var(--muted))]" />
          {NOTE_COLORS.map((entry) => {
            const active = (draft.color || 'default') === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                aria-label={`${entry.label} colour`}
                aria-pressed={active}
                title={entry.label}
                onClick={() => setDraft({ ...draft, color: entry.id })}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full border-2 transition-all duration-200 hover:scale-110',
                  active ? 'border-[rgb(var(--text))] scale-110' : 'border-transparent'
                )}
                style={{ background: entry.swatch }}
              >
                {active && <Check size={11} className="text-[rgb(var(--canvas))]" strokeWidth={3.5} />}
              </button>
            )
          })}
        </div>

        {/* Tags: their own list beside the colours — adding or removing
          one never touches the note body (v2.0.16). */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" aria-label="Note tags">
          <Hash size={11} className="shrink-0 text-[rgb(var(--muted))]" />
          {(draft.tags || []).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-0.5 rounded-full bg-[rgb(var(--primary)/.12)] pl-1.5 pr-0.5 text-xs font-bold text-[rgb(var(--primary))]"
            >
              <button
                type="button"
                title={`Filter by ${displayTag(tag)}`}
                onClick={() => onFilterTag(tag)}
                className="py-0.5 transition hover:opacity-70"
              >
                {displayTag(tag)}
              </button>
              <button
                type="button"
                aria-label={`Remove tag ${displayTag(tag)}`}
                title={`Remove ${displayTag(tag)}`}
                onClick={() => onRemoveTag(tag)}
                className="grid h-3.5 w-3.5 place-items-center rounded-full opacity-60 transition hover:bg-[rgb(var(--primary)/.25)] hover:opacity-100"
              >
                <X size={8} strokeWidth={3} />
              </button>
            </span>
          ))}
          <span className="flex items-center gap-0.5 rounded-full border border-dashed bg-[rgb(var(--canvas)/.6)] py-0.5 pl-2 pr-0.5">
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onAddTag()
                }
              }}
              placeholder="Add #tag"
              aria-label="New tag"
              className="w-16 bg-transparent text-xs font-bold text-[rgb(var(--text))] outline-none placeholder:text-[rgb(var(--muted)/.7)]"
            />
            <button
              type="button"
              aria-label="Add tag"
              title="Add tag"
              onClick={onAddTag}
              disabled={!tagInput.trim()}
              className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[rgb(var(--primary)/.2)] text-[rgb(var(--primary))] transition enabled:hover:bg-[rgb(var(--primary)/.35)] disabled:opacity-40"
            >
              <Plus size={8} strokeWidth={3.5} />
            </button>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Note priority">
          {PRIORITIES.map((level) => {
            const Icon = level.icon
            const active = Number(draft.priority || 0) === level.id
            return (
              <button
                key={level.id}
                type="button"
                aria-pressed={active}
                aria-label={`${level.label} priority`}
                onClick={() => setDraft({ ...draft, priority: level.id })}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-all duration-200',
                  active
                    ? 'border-current'
                    : 'border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.45)]'
                )}
                style={active ? { color: level.tone, background: 'rgb(var(--surface))' } : undefined}
              >
                <Icon size={11} /> {level.short}
              </button>
            )
          })}
        </div>
      </div>

      <Textarea
        value={draft.body}
        onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        placeholder="Write anything — steps, IP plans, #tags, passwords you rotate, reminders…"
        aria-label="Note body"
        className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
      />

      <div className="flex items-center gap-2 px-1 text-xs text-[rgb(var(--muted))]">
        <span className="rounded-full bg-[rgb(var(--border)/.4)] px-2 py-0.5 font-semibold">
          {(draft.body || '').length} characters
        </span>
        {draft.updated_at && <span className="hidden sm:inline">Updated {when(draft.updated_at)}</span>}
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 font-semibold',
            dirty ? 'bg-nord-13/20 text-[#8b6e1c]' : 'bg-nord-14/15 text-[#66834e]'
          )}
        >
          {dirty ? 'Unsaved changes — Ctrl+S to save' : 'All changes saved'}
        </span>
      </div>
    </motion.section>
  )
}
