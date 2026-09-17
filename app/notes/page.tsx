'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { NotebookPen, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import { Button, EmptyState, Input, Skeleton } from '@/components/ui'
import NoteCard from '@/components/notes/NoteCard'
import NoteEditor from '@/components/notes/NoteEditor'
import NoteQuickMenu from '@/components/notes/NoteQuickMenu'
import { getApi } from '@/lib/api'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { blankNote, normalizeTags, noteTags, sanitizeTag } from '@/lib/notes-presentation'

export default function NotesPage() {
  // Undefined during the static prerender; populated from the first client render.
  const api = getApi()
  const confirm = useConfirm()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState<any>(null) // { x, y, noteId } — right-click menu
  const [tagInput, setTagInput] = useState('')
  const nameRef = useRef(null)

  const load = useCallback(
    async (selectId = null) => {
      if (!api) return
      try {
        const rows = (await api.notes.list()).map((note) => ({ ...note, tags: normalizeTags(note.tags) }))
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
    },
    [api]
  )

  useEffect(() => {
    load()
  }, [load])

  // The right-click menu closes on Escape and on window blur.
  useEffect(() => {
    if (!menu) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setMenu(null)
    }
    const onBlur = () => setMenu(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [menu])

  /**
   * Applies a small patch (pin, colour, priority) to a saved note without
   * disturbing the editor: the list is re-read and, when the note is the one
   * currently open, the draft follows along.
   */
  const quickUpdate = async (note, patch, label) => {
    try {
      await api.notes.save({
        id: note.id,
        name: note.name,
        body: note.body || '',
        pinned: note.pinned ? 1 : 0,
        color: note.color || 'default',
        priority: Number(note.priority || 0),
        tags: normalizeTags(note.tags),
        ...patch
      })
      const rows = (await api.notes.list()).map((item) => ({ ...item, tags: normalizeTags(item.tags) }))
      setNotes(rows)
      setDraft((current) => (current?.id === note.id ? { ...current, ...patch } : current))
      toast.success(label)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const togglePin = async (note) => {
    await quickUpdate(note, { pinned: note.pinned ? 0 : 1 }, note.pinned ? 'Note unpinned' : 'Note pinned')
  }

  /**
   * Tag helpers (v2.0.16). Tags live in their own list, completely separate
   * from the note body: adding or removing one never touches the text, and
   * the chips sit next to the colour pickers in the toolbar.
   */
  const addTag = () => {
    const tag = sanitizeTag(tagInput)
    if (!tag) return
    setDraft((current) => {
      const tags = normalizeTags(current.tags).map(sanitizeTag).filter(Boolean)
      if (tags.includes(tag)) return current
      return { ...current, tags: [...tags, tag] }
    })
    setTagInput('')
  }

  const removeTag = (tag) => {
    setDraft((current) => ({ ...current, tags: normalizeTags(current.tags).filter((item) => item !== tag) }))
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = needle
      ? notes.filter((note) =>
          `${note.name} ${note.body || ''} ${noteTags(note).join(' ')}`.toLowerCase().includes(needle)
        )
      : notes
    // Pinned first, then the most urgent, then the most recently touched.
    return [...rows].sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        Number(b.priority || 0) - Number(a.priority || 0) ||
        new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    )
  }, [notes, query])

  const dirty = useMemo(() => {
    if (!draft) return false
    if (!draft.id) return Boolean(draft.name.trim() || draft.body.trim())
    const original = notes.find((note) => note.id === draft.id)
    if (!original) return true
    return (
      original.name !== draft.name ||
      (original.body || '') !== (draft.body || '') ||
      Boolean(original.pinned) !== Boolean(draft.pinned) ||
      (original.color || 'default') !== (draft.color || 'default') ||
      Number(original.priority || 0) !== Number(draft.priority || 0) ||
      JSON.stringify(normalizeTags(original.tags)) !== JSON.stringify(normalizeTags(draft.tags))
    )
  }, [draft, notes])

  const startNew = () => {
    setDraft({ ...blankNote })
    setTimeout(() => nameRef.current?.focus(), 40)
  }

  const select = async (note) => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'The edits to the note you are viewing have not been saved yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing'
      })
      if (!ok) return
    }
    setDraft({
      ...note,
      body: note.body || '',
      color: note.color || 'default',
      priority: Number(note.priority || 0),
      tags: normalizeTags(note.tags)
    })
  }

  const save = async (override = {}) => {
    const payload = { ...draft, ...override }
    if (!payload.name.trim()) {
      toast.error('Give the note a name first')
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const saved = await api.notes.save({
        id: payload.id || undefined,
        name: payload.name.trim(),
        body: payload.body || '',
        pinned: payload.pinned ? 1 : 0,
        color: payload.color || 'default',
        priority: Number(payload.priority || 0),
        tags: normalizeTags(payload.tags)
      })
      await load(saved?.id || payload.id)
      if (saved?.id && !payload.id)
        setDraft({
          ...saved,
          body: saved.body || '',
          color: saved.color || 'default',
          priority: Number(saved.priority || 0),
          tags: normalizeTags(saved.tags)
        })
      toast.success(payload.id ? 'Note saved' : 'Note created')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (note) => {
    const ok = await confirm({
      title: `Delete “${note.name}”?`,
      description: 'The note and everything written in it are permanently removed.',
      confirmLabel: 'Delete note'
    })
    if (!ok) return
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
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      save()
    }
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-3" onKeyDown={onKeyDown}>
        <header className="flex flex-wrap items-center gap-3">
          <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]">
            <NotebookPen size={20} />
            <span
              aria-hidden
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[rgb(var(--primary))] ring-2 ring-[rgb(var(--surface))]"
            />
          </span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">Notes</h1>
            <p className="text-2xs text-[rgb(var(--muted))]">
              Runbooks, VLAN plans and anything else worth keeping
            </p>
          </div>
          <span className="hidden rounded-full border bg-[rgb(var(--surface)/.6)] px-2 py-0.5 text-xs font-bold text-[rgb(var(--muted))] sm:inline">
            {loading ? '…' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
          </span>
          <Button className="ml-auto" size="sm" onClick={startNew}>
            <Plus size={14} /> New note
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-2 rounded-2xl border bg-[rgb(var(--surface))] p-3">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes or #tags"
                className="pl-8 text-xs"
                aria-label="Search notes"
              />
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {loading && [0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-16 w-full" />)}
              <AnimatePresence initial={false}>
                {filtered.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    active={draft?.id === note.id}
                    onSelect={select}
                    onContextMenu={(event, target) =>
                      setMenu({ x: event.clientX, y: event.clientY, noteId: target.id })
                    }
                    onTogglePin={togglePin}
                    onRemove={remove}
                    onFilterTag={setQuery}
                  />
                ))}
              </AnimatePresence>

              {!loading && !filtered.length && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[rgb(var(--border)/.4)] text-[rgb(var(--muted))]">
                    <NotebookPen size={20} />
                  </span>
                  <p className="text-2xs font-bold">
                    {notes.length ? 'No note matches that search' : 'No notes yet'}
                  </p>
                  <p className="text-xs text-[rgb(var(--muted))]">
                    {notes.length
                      ? 'Try a different keyword.'
                      : 'Create the first one to start keeping track.'}
                  </p>
                </div>
              )}
            </div>
          </aside>

          {draft ? (
            <AnimatePresence mode="wait">
              <NoteEditor
                draft={draft}
                setDraft={setDraft}
                saving={saving}
                dirty={dirty}
                nameRef={nameRef}
                tagInput={tagInput}
                setTagInput={setTagInput}
                onSave={save}
                onPin={() =>
                  draft.id
                    ? save({ pinned: draft.pinned ? 0 : 1 })
                    : setDraft({ ...draft, pinned: draft.pinned ? 0 : 1 })
                }
                onAddTag={addTag}
                onRemoveTag={removeTag}
                onFilterTag={setQuery}
              />
            </AnimatePresence>
          ) : (
            <section className="grid place-items-center rounded-2xl border border-dashed bg-[rgb(var(--surface)/.5)]">
              <EmptyState
                icon={<NotebookPen size={26} />}
                title="No note selected"
                description="Pick a note on the left, or create a new one to start writing."
                action={
                  <Button size="sm" onClick={startNew}>
                    <Plus size={14} /> New note
                  </Button>
                }
              />
            </section>
          )}
        </div>

        {/* Right-click menu: colour + priority for the note under the cursor. */}
        {menu && (
          <NoteQuickMenu
            menu={menu}
            note={notes.find((note) => note.id === menu.noteId)}
            onClose={() => setMenu(null)}
            onQuickUpdate={quickUpdate}
          />
        )}
      </div>
    </AppShell>
  )
}
