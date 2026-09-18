'use client'

import { useEffect, useState } from 'react'
import { Folder, File, ArrowUp, Loader2, HardDrive, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { getApi } from '@/lib/api'

function formatSize(bytes: any) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ServerFileBrowser({ open, onOpenChange, onSelect }: any) {
  const [dir, setDir] = useState<any>(null)
  const [listing, setListing] = useState<any>({ directory: '', parent: null, files: [] })
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const load = async (path: any) => {
    setLoading(true)
    try {
      const api = getApi()
      const fn = (api.storeUpdate as any)?.listServerFiles || (api.app as any)?.listServerFiles
      if (!fn) throw new Error('Server file listing not available on this platform')
      const result = await fn(path || undefined)
      setListing(result)
      setDir(result.directory)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load(dir || undefined)
  }, [open])

  const filtered = listing.files.filter((f: any) => {
    if (!filter.trim()) return true
    return f.name.toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(720px,calc(100vw-1rem))] flex-col p-0">
        <DialogHeader className="shrink-0 border-b p-4 pb-3">
          <DialogTitle className="flex items-center gap-2"><HardDrive size={16} /> Choose file from server</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs"> {listing.directory || 'Loading...'} </DialogDescription>
          <div className="mt-3 flex gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name..." className="h-9 flex-1 rounded-lg border bg-[rgb(var(--surface))] px-3 text-sm outline-none focus:border-[rgb(var(--primary))]" />
            <Button variant="secondary" size="sm" onClick={() => load(dir)} disabled={loading}>{loading && <Loader2 size={14} className="animate-spin" />} Refresh</Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ? (
            <div className="grid place-items-center py-16 text-sm text-[rgb(var(--muted))]"><Loader2 className="animate-spin" /> Loading...</div>
          ) : (
            <ul className="space-y-0.5">
              {listing.parent && (
                <li>
                  <button type="button" onClick={() => load(listing.parent)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold hover:bg-[rgb(var(--border)/.4)]">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[rgb(var(--border)/.5)]"><ArrowUp size={14} /></span> ..
                  </button>
                </li>
              )}
              {filtered.map((f: any) => (
                <li key={f.path}>
                  {f.isDirectory ? (
                    <button type="button" onClick={() => load(f.path)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[rgb(var(--border)/.4)]">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 text-amber-600"><Folder size={16} /></span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => { onSelect(f.path); onOpenChange(false) }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[rgb(var(--primary)/.08)] hover:text-[rgb(var(--primary))]">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgb(var(--primary)/.1)] text-[rgb(var(--primary))]"><File size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{f.name}</span>
                        <span className="text-2xs text-[rgb(var(--muted))]">{formatSize(f.size)} • {new Date(f.modified).toLocaleString()}</span>
                      </span>
                    </button>
                  )}
                </li>
              ))}
              {filtered.length === 0 && <li className="py-10 text-center text-sm text-[rgb(var(--muted))]">No files match filter</li>}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
