'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { NotebookPen, Pin, PinOff, Plus, Save, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import { Button, EmptyState, Input, Skeleton, Textarea } from '@/components/ui'
import { getApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const blankNote = { id: null, name: '', body: '', pinned: 0 }

const preview = (body) => (body || '').replace(/\s+/g, ' ').trim().slice(0, 72) || 'Empty note'

const when = (value) => {
  if (!value) return ''
  const date = new Date(String(value).includes('T') ? value : `${value}Z`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotesPage() {
  // Undefined during the static prerender; populated from the first client render.
  const api = getApi()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  const load = useCallback(async (selectId = null) => {
    if (!api) return
    try {
      const rows = await api.notes.list()
      setNotes(rows)
      setDraft((current) => {
        if (selectId) return rows.find((note) => note.id === selectId) || current
        if (current) return current
        return rows[0] || null
      })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return notes
    return notes.filter((note) => `${note.name} ${note.body || ''}`.toLowerCase().includes(needle))
  }, [notes, query])

  const dirty = useMemo(() => {
    if (!draft) return false
    if (!draft.id) return Boolean(draft.name.trim() || draft.body.trim())
    const original = notes.find((note) => note.id === draft.id)
    if (!original) return true
    return original.name !== draft.name || (original.body || '') !== (draft.body || '') || Boolean(original.pinned) !== Boolean(draft.pinned)
  }, [draft, notes])

  const startNew = () => {
    setDraft({ ...blankNote })
    setTimeout(() => nameRef.current?.focus(), 40)
  }

  const select = (note) => {
    if (dirty && !confirm('Discard the unsaved changes to this note?')) return
    setDraft({ ...note, body: note.body || '' })
  }

  const save = async (override = {}) => {
    const payload = { ...draft, ...override }
    if (!payload.name.trim()) { toast.error('Give the note a name first'); nameRef.current?.focus(); return }
    setSaving(true)
    try {
      const saved = await api.notes.save({
        id: payload.id || undefined,
        name: payload.name.trim(),
        body: payload.body || '',
        pinned: payload.pinned ? 1 : 0
      })
      await load(saved?.id || payload.id)
      if (saved?.id && !payload.id) setDraft({ ...saved, body: saved.body || '' })
      toast.success(payload.id ? 'Note saved' : 'Note created')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (note) => {
    if (!confirm(`Delete “${note.name}”? This cannot be undone.`)) return
    try {
      await api.notes.remove(note.id)
      const rows = await api.notes.list()
      setNotes(rows)
      setDraft((current) => (current?.id === note.id ? rows[0] || null : current))
      toast.success('Note deleted')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const onKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-3" onKeyDown={onKeyDown}>
        <header className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]"><NotebookPen size={20} /></span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">Notes</h1>
            <p className="text-[11px] text-[rgb(var(--muted))]">Runbooks, VLAN plans and anything else worth keeping</p>
          </div>
          <Button className="ml-auto" size="sm" onClick={startNew}><Plus size={14} /> New note</Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-2 rounded-2xl border bg-[rgb(var(--surface))] p-3">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" className="pl-8 text-[12px]" aria-label="Search notes" />
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {loading && [0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-16 w-full" />)}
              <AnimatePresence initial={false}>
                {filtered.map((note) => (
                  <motion.button
                    key={note.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    type="button"
                    onClick={() => select(note)}
                    className={cn(
                      'group w-full rounded-xl border bg-[rgb(var(--canvas))] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-[rgb(var(--primary)/.55)] hover:shadow-sm',
                      draft?.id === note.id && 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.08)]'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {Boolean(note.pinned) && <Pin size={11} className="shrink-0 text-[rgb(var(--primary))]" />}
                      <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold">{note.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Delete ${note.name}`}
                        onClick={(event) => { event.stopPropagation(); remove(note) }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); remove(note) } }}
                        className="shrink-0 rounded-md p-1 text-[rgb(var(--muted))] opacity-0 transition hover:bg-[rgb(var(--danger)/.15)] hover:text-[rgb(var(--danger))] group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-[rgb(var(--muted))]">{preview(note.body)}</p>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">{when(note.updated_at)}</p>
                  </motion.button>
                ))}
              </AnimatePresence>

              {!loading && !filtered.length && (
                <p className="rounded-xl border border-dashed p-6 text-center text-[11px] text-[rgb(var(--muted))]">
                  {notes.length ? 'No note matches that search.' : 'No notes yet.'}
                </p>
              )}
            </div>
          </aside>

          {draft ? (
            <section className="flex min-h-0 flex-col gap-2 rounded-2xl border bg-[rgb(var(--surface))] p-3">
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
                  onClick={() => (draft.id ? save({ pinned: draft.pinned ? 0 : 1 }) : setDraft({ ...draft, pinned: draft.pinned ? 0 : 1 }))}
                >
                  {draft.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </Button>
                <Button size="sm" onClick={() => save()} disabled={saving || !dirty}>
                  <Save size={14} /> {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>

              <Textarea
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                placeholder="Write anything — steps, IP plans, passwords you rotate, reminders…"
                aria-label="Note body"
                className="min-h-0 flex-1 resize-none font-mono text-[12px] leading-relaxed"
              />

              <div className="flex items-center gap-2 px-1 text-[10px] text-[rgb(var(--muted))]">
                <span>{(draft.body || '').length} characters</span>
                {draft.updated_at && <span>· Updated {when(draft.updated_at)}</span>}
                <span className="ml-auto">{dirty ? 'Unsaved changes — Ctrl+S to save' : 'All changes saved'}</span>
              </div>
            </section>
          ) : (
            <section className="grid place-items-center rounded-2xl border border-dashed bg-[rgb(var(--surface)/.5)]">
              <EmptyState
                icon={<NotebookPen size={26} />}
                title="No note selected"
                description="Pick a note on the left, or create a new one to start writing."
                action={<Button size="sm" onClick={startNew}><Plus size={14} /> New note</Button>}
              />
            </section>
          )}
        </div>
      </div>
    </AppShell>
  )
}
