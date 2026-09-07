'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Copy, FolderOpen, FolderSync, Loader2, ShieldCheck, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch } from '@/components/ui'
import { getApi } from '@/lib/api'
import { cn, formatBytes, formatDuration } from '@/lib/utils'

/** One row in the batch: tracks its own progress from the IPC events. */
function CopyRow({ item }) {
  const states = {
    pending: { icon: <Copy size={13} />, label: 'Waiting', className: 'text-[rgb(var(--muted))]' },
    copying: { icon: <Loader2 size={13} className="animate-spin" />, label: `${item.percent}%`, className: 'text-[rgb(var(--primary))]' },
    verifying: { icon: <ShieldCheck size={13} />, label: 'Verifying…', className: 'text-nord-13' },
    copied: { icon: <CheckCircle2 size={13} />, label: item.verified === false ? 'Copied (unverified)' : 'Done', className: 'text-nord-14' },
    skipped: { icon: <XCircle size={13} />, label: 'Skipped — exists', className: 'text-nord-13' },
    error: { icon: <XCircle size={13} />, label: item.error || 'Failed', className: 'text-nord-11' }
  }
  const current = states[item.state] || states.pending
  return (
    <div className="rounded-xl border border-[rgb(var(--border)/.6)] bg-[rgb(var(--surface)/.55)] px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex shrink-0 items-center gap-1.5 text-[11px] font-bold', current.className)}>{current.icon}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[rgb(var(--text))]" title={item.source}>{item.source}</span>
        <span className={cn('shrink-0 text-[11px] font-bold', current.className)} title={item.error}>{current.label}</span>
      </div>
      {(item.state === 'copying' || item.state === 'verifying') && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border)/.7)]">
          <motion.div
            className="h-full rounded-full bg-[rgb(var(--primary))]"
            initial={false}
            animate={{ width: `${item.percent}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Verified batch file copy: pick files, pick a destination folder, and every
 * file streams across with live progress, optional overwrite and an optional
 * SHA-256 comparison proving each copy arrived intact.
 */
export default function FileCopyPanel() {
  // items: [{ source, state, percent, error?, verified? }]
  const [items, setItems] = useState([])
  const [destination, setDestination] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [verify, setVerify] = useState(true)
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState(null)

  // The main process narrates the run; individual rows pick up their updates
  // by index, and the final event carries the whole summary.
  useEffect(() => {
    const unsubscribe = getApi().software.onCopyProgress((event) => {
      if (event.state === 'finished') return
      setItems((previous) =>
        previous.map((item, index) => {
          if (index !== event.index) return item
          if (event.state === 'started') return { ...item, state: 'copying', percent: 0, error: undefined }
          if (event.state === 'progress') return { ...item, state: 'copying', percent: event.percent }
          if (event.state === 'verifying') return { ...item, state: 'verifying', percent: 100 }
          if (event.state === 'copied') return { ...item, state: 'copied', percent: 100, verified: event.verified }
          if (event.state === 'skipped') return { ...item, state: 'skipped', percent: 100 }
          if (event.state === 'error') return { ...item, state: 'error', error: event.error }
          return item
        })
      )
    })
    return () => unsubscribe?.()
  }, [])

  const addFiles = async () => {
    try {
      const picked = await getApi().dialog.selectFiles({ title: 'Choose files to copy' })
      if (!picked?.length) return
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.source))
        const fresh = picked.filter((source) => !known.has(source)).map((source) => ({ source, state: 'pending', percent: 0 }))
        return [...previous, ...fresh]
      })
      setSummary(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const pickDestination = async () => {
    try {
      const picked = await getApi().dialog.selectDirectory({ title: 'Choose the destination folder' })
      if (picked) setDestination(picked)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const startCopy = async () => {
    if (items.length === 0) {
      toast.error('Add at least one file to copy')
      return
    }
    if (!destination.trim()) {
      toast.error('Choose a destination folder')
      return
    }
    setRunning(true)
    setSummary(null)
    try {
      const result = await getApi().software.copyFiles({ sources: items.map((item) => item.source), destination: destination.trim(), overwrite, verify })
      setSummary(result)
      if (result.failed > 0) toast.error(`${result.failed} of ${result.results.length} file(s) could not be copied`)
      else toast.success(`${result.copied} file(s) copied${result.skipped ? `, ${result.skipped} skipped` : ''} in ${formatDuration(result.durationMs)}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgb(var(--primary)/.14)] text-[rgb(var(--primary))]"><FolderSync size={16} /></span>
          Verified file copy
        </CardTitle>
        <CardDescription>Copy files to any folder with live progress and SHA-256 verification that every byte arrived intact.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={addFiles} disabled={running} className="shrink-0">
            <Copy size={15} />
            Add files…
          </Button>
          <div className="flex min-w-0 flex-1 gap-2">
            <Input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Destination folder — e.g. D:\Deploy\branch-01"
              aria-label="Destination folder"
              className="font-mono text-[12.5px]"
            />
            <Button variant="secondary" onClick={pickDestination} disabled={running} className="shrink-0" title="Browse for the destination folder">
              <FolderOpen size={15} />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Label className="flex items-center gap-2 text-xs font-semibold text-[rgb(var(--muted))]">
            <Switch checked={overwrite} onCheckedChange={setOverwrite} disabled={running} compact />
            Overwrite existing files
          </Label>
          <Label className="flex items-center gap-2 text-xs font-semibold text-[rgb(var(--muted))]">
            <Switch checked={verify} onCheckedChange={setVerify} disabled={running} compact />
            Verify with SHA-256
          </Label>
        </div>

        <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {items.map((item, index) => (
              <motion.div key={item.source} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} className="relative">
                <CopyRow item={item} />
                {!running && (
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={() => { setItems((previous) => previous.filter((_, i) => i !== index)); setSummary(null) }}
                    className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full border bg-[rgb(var(--surface))] text-[rgb(var(--muted))] shadow-sm transition hover:text-nord-11"
                  >
                    <X size={11} />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-6 text-center text-xs text-[rgb(var(--muted))]">
              No files selected yet — use “Add files…” to build the copy batch.
            </div>
          )}
        </div>

        <Button onClick={startCopy} disabled={running || items.length === 0} className="w-full">
          {running ? <Loader2 size={15} className="animate-spin" /> : <FolderSync size={15} />}
          {running ? 'Copying…' : `Copy ${items.length > 0 ? `${items.length} file${items.length > 1 ? 's' : ''}` : 'files'}`}
        </Button>

        <AnimatePresence initial={false}>
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                'flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold',
                summary.failed > 0
                  ? 'border-nord-11/40 bg-nord-11/8 text-nord-11'
                  : 'border-nord-14/40 bg-nord-14/10 text-[rgb(var(--text))]'
              )}
            >
              <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-nord-14" />{summary.copied} copied</span>
              {summary.skipped > 0 && <span className="flex items-center gap-1.5"><XCircle size={14} className="text-nord-13" />{summary.skipped} skipped</span>}
              {summary.failed > 0 && <span className="flex items-center gap-1.5"><XCircle size={14} />{summary.failed} failed</span>}
              <span className="ml-auto text-[rgb(var(--muted))]">{formatBytes(summary.totalBytes)} in {formatDuration(summary.durationMs)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
