'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Code2, Plus, Search, Send, Trash2, Pencil, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui'

const emptyDraft = { id: null, name: '', command: '', description: '' }

/** Saved command library shown along the right edge of the terminal workspace. */
export default function SnippetPanel({ snippets, onSave, onDelete, onRun, disabled }) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return snippets
    return snippets.filter((item) => `${item.name} ${item.command} ${item.description || ''}`.toLowerCase().includes(needle))
  }, [snippets, query])

  const submit = async (event) => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.command.trim()) { toast.error('A snippet needs a name and a command'); return }
    setSaving(true)
    try {
      await onSave(draft)
      setDraft(null)
    } catch (error) {
      toast.error(error.message || 'Could not save the snippet')
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-2.5 rounded-2xl border bg-[rgb(var(--surface))] p-3">
      <div className="flex items-center gap-2">
        <Code2 size={15} className="text-[rgb(var(--primary))]" />
        <h2 className="text-xs font-extrabold tracking-tight">Snippets</h2>
        <span className="ml-auto rounded-md bg-[rgb(var(--border)/.6)] px-1.5 py-0.5 text-[9px] font-bold">{snippets.length}</span>
      </div>

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter snippets" className="pl-8 text-[11px]" aria-label="Filter snippets" />
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        <AnimatePresence initial={false}>
          {filtered.map((snippet) => (
            <motion.div
              key={snippet.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group rounded-xl border bg-[rgb(var(--canvas))] p-2 transition hover:border-[rgb(var(--primary)/.55)]"
            >
              <div className="flex items-start gap-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRun(snippet)}
                  title={disabled ? 'Connect to a switch first' : `Run: ${snippet.command}`}
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                >
                  <div className="truncate text-[11px] font-extrabold">{snippet.name}</div>
                  <div className="truncate font-mono text-[10px] text-[rgb(var(--primary))]">{snippet.command}</div>
                  {snippet.description && <div className="truncate text-[9px] text-[rgb(var(--muted))]">{snippet.description}</div>}
                </button>
                <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" onClick={() => onRun(snippet)} disabled={disabled} aria-label={`Run ${snippet.name}`} className="rounded-md p-1 text-[rgb(var(--muted))] hover:bg-[rgb(var(--primary)/.15)] hover:text-[rgb(var(--primary))] disabled:opacity-40"><Send size={12} /></button>
                  <button type="button" onClick={() => setDraft({ ...snippet, description: snippet.description || '' })} aria-label={`Edit ${snippet.name}`} className="rounded-md p-1 text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--text))]"><Pencil size={12} /></button>
                  <button type="button" onClick={() => onDelete(snippet)} aria-label={`Delete ${snippet.name}`} className="rounded-md p-1 text-[rgb(var(--muted))] hover:bg-[rgb(var(--danger)/.15)] hover:text-[rgb(var(--danger))]"><Trash2 size={12} /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {!filtered.length && (
          <div className="rounded-xl border border-dashed p-5 text-center text-[10px] leading-relaxed text-[rgb(var(--muted))]">
            {snippets.length ? 'No snippet matches that filter.' : 'No snippets yet. Save the commands you type most often.'}
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {draft ? (
          <motion.form
            key="draft"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={submit}
            className="space-y-2 overflow-hidden rounded-xl border bg-[rgb(var(--canvas))] p-2.5"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[rgb(var(--muted))]">{draft.id ? 'Edit snippet' : 'New snippet'}</p>
              <button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="rounded-md p-0.5 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"><X size={13} /></button>
            </div>
            <div>
              <Label htmlFor="snippet-name">Name</Label>
              <Input id="snippet-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Show interfaces" className="text-[11px]" autoFocus />
            </div>
            <div>
              <Label htmlFor="snippet-command">Command</Label>
              <Input id="snippet-command" value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} placeholder="show interfaces status" className="font-mono text-[11px]" />
            </div>
            <div>
              <Label htmlFor="snippet-description">Description</Label>
              <Input id="snippet-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional note" className="text-[11px]" />
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={saving}><Check size={13} /> {saving ? 'Saving…' : 'Save snippet'}</Button>
          </motion.form>
        ) : (
          <Button key="add" type="button" variant="secondary" size="sm" className="w-full" onClick={() => setDraft(emptyDraft)}>
            <Plus size={13} /> Add snippet
          </Button>
        )}
      </AnimatePresence>
    </aside>
  )
}
