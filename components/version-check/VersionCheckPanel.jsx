'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppWindow, Check, ClipboardCopy, FileSearch, Loader2, PackageSearch, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Tabs, TabsContent } from '@/components/ui'
import { getApi } from '@/lib/api'
import { cn, formatBytes, formatDate } from '@/lib/utils'

/** One labelled fact in a result grid; long paths wrap instead of stretching the card. */
function Fact({ label, value, mono = false }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[rgb(var(--muted))]">{label}</div>
      <div className={cn('break-all text-[13px] font-semibold text-[rgb(var(--text))]', mono && 'font-mono')}>{value}</div>
    </div>
  )
}

function CopyVersionButton({ version }) {
  const [copied, setCopied] = useState(false)
  if (!version) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(version))
      setCopied(true)
      toast.success(`Version ${version} copied to the clipboard`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copying to the clipboard failed')
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? <Check size={14} className="text-nord-14" /> : <ClipboardCopy size={14} />}
      {copied ? 'Copied' : 'Copy version'}
    </Button>
  )
}

/**
 * Looks up the installed version of a program on this Windows system — either
 * by its registered (uninstall) name or by pointing at an executable file.
 */
export default function VersionCheckPanel() {
  const [tab, setTab] = useState('installed')
  const [query, setQuery] = useState('')
  // null = never scanned; [] = scanned, nothing found
  const [programs, setPrograms] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState(null)

  const [filePath, setFilePath] = useState('')
  const [checking, setChecking] = useState(false)
  const [fileResult, setFileResult] = useState(null)

  const filtered = useMemo(() => {
    if (!programs) return []
    const needle = query.trim().toLowerCase()
    const list = needle ? programs.filter((program) => program.name.toLowerCase().includes(needle)) : programs
    return list.slice(0, 60)
  }, [programs, query])

  const scan = async (force = false) => {
    setScanning(true)
    try {
      const list = await getApi().software.listInstalled(force)
      setPrograms(list)
      setSelected(null)
      if (!force) toast.success(`${list.length} installed programs found on this system`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setScanning(false)
    }
  }

  const browseFile = async () => {
    try {
      const picked = await getApi().dialog.selectFile({
        title: 'Choose an executable',
        filters: [{ name: 'Programs', extensions: ['exe', 'msi', 'dll', 'com'] }]
      })
      if (picked) setFilePath(picked)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const checkFile = async () => {
    if (!filePath.trim()) {
      toast.error('Choose an executable file first')
      return
    }
    setChecking(true)
    setFileResult(null)
    try {
      const result = await getApi().software.checkVersion({ path: filePath.trim() })
      setFileResult(result)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgb(var(--primary)/.14)] text-[rgb(var(--primary))]"><PackageSearch size={16} /></span>
          Program version check
        </CardTitle>
        <CardDescription>Check the version of a program installed on this system — by its registered name or by any executable file.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'installed', label: 'Installed program', icon: <AppWindow size={14} /> },
            { value: 'file', label: 'Executable file', icon: <FileSearch size={14} /> }
          ]}
          listClassName="w-fit"
        >
          <TabsContent value="installed" className="space-y-3 pt-1">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name — e.g. FortiClient, TeamViewer…"
                aria-label="Program name"
              />
              {programs === null ? (
                <Button onClick={() => scan(false)} disabled={scanning} className="shrink-0">
                  {scanning ? <Loader2 size={15} className="animate-spin" /> : <PackageSearch size={15} />}
                  Scan installed
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => scan(true)} disabled={scanning} className="shrink-0" title="Rescan the installed-program registry">
                  <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
                  Rescan
                </Button>
              )}
            </div>

            {programs !== null && (
              <p className="text-xs text-[rgb(var(--muted))]">
                {filtered.length} of {programs.length} installed programs{query.trim() ? ` matching “${query.trim()}”` : ''}
              </p>
            )}

            {/* The registry list stays inside a fixed-height scroll area so the
                page layout does not grow with the number of matches. */}
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {filtered.map((program) => {
                const active = selected?.name === program.name
                return (
                  <button
                    key={program.name}
                    type="button"
                    onClick={() => setSelected(active ? null : program)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-200 hover:border-[rgb(var(--primary)/.45)] hover:bg-[rgb(var(--surface)/.85)]',
                      active ? 'border-[rgb(var(--primary)/.55)] bg-[rgb(var(--primary)/.08)]' : 'border-[rgb(var(--border)/.6)] bg-[rgb(var(--surface)/.55)]'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[rgb(var(--text))]">{program.name}</span>
                    {program.version && (
                      <span className="shrink-0 rounded-full bg-[rgb(var(--primary)/.13)] px-2 py-0.5 font-mono text-[11px] font-bold text-[rgb(var(--primary))]">v{program.version}</span>
                    )}
                    {program.publisher && <span className="hidden shrink-0 truncate text-[11px] text-[rgb(var(--muted))] lg:inline">{program.publisher}</span>}
                  </button>
                )
              })}
              {programs !== null && filtered.length === 0 && (
                <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-6 text-center text-xs text-[rgb(var(--muted))]">
                  No installed program matches that name.
                </div>
              )}
            </div>

            <AnimatePresence initial={false}>
              {selected && (
                <motion.div
                  key={selected.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 rounded-xl border border-[rgb(var(--primary)/.35)] bg-[rgb(var(--primary)/.06)] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-bold text-[rgb(var(--text))]">{selected.name}</span>
                    <CopyVersionButton version={selected.version} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Fact label="Version" value={selected.version || 'Not registered'} mono />
                    <Fact label="Publisher" value={selected.publisher} />
                    <Fact label="Install location" value={selected.installLocation} />
                    <Fact label="Executable" value={selected.displayIcon} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="file" className="space-y-3 pt-1">
            <div className="flex gap-2">
              <Input
                value={filePath}
                onChange={(event) => setFilePath(event.target.value)}
                placeholder="C:\Program Files\App\app.exe"
                aria-label="Executable path"
                className="font-mono text-[12.5px]"
              />
              <Button variant="secondary" onClick={browseFile} className="shrink-0">Browse…</Button>
              <Button onClick={checkFile} disabled={checking} className="shrink-0">
                {checking ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
                Check
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {fileResult && (
                <motion.div
                  key={fileResult.path}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 rounded-xl border border-[rgb(var(--primary)/.35)] bg-[rgb(var(--primary)/.06)] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[13px] font-bold text-[rgb(var(--text))]">{fileResult.fileName}</span>
                    <CopyVersionButton version={fileResult.fileVersion || fileResult.productVersion} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Fact label="File version" value={fileResult.fileVersion || 'Not embedded'} mono />
                    <Fact label="Product version" value={fileResult.productVersion} mono />
                    <Fact label="Product name" value={fileResult.productName} />
                    <Fact label="Company" value={fileResult.companyName} />
                    <Fact label="Size" value={formatBytes(fileResult.sizeBytes)} />
                    <Fact label="Last modified" value={formatDate(fileResult.modifiedAt, true)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
