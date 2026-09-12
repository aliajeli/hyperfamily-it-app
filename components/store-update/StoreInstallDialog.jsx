'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Info, Loader2, Square, Terminal, XCircle } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'
import { cn, collapseSteps, formatDuration } from '@/lib/utils'

const STEP_LABELS = {
  reachability: 'Connection check',
  agent: 'Agent check',
  'running-check': 'Store Commerce running?',
  close: 'Close Store Commerce',
  'verify-closed': 'Closed verification',
  'file-check': 'Installer file check',
  install: 'Run installer /install',
  version: 'Store Commerce version',
  cancelled: 'Stopped',
  error: 'Error'
}

function StepIcon({ status }) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin text-[rgb(var(--primary))]" />
  if (status === 'done') return <CheckCircle2 size={13} className="text-nord-14" />
  if (status === 'failed') return <XCircle size={13} className="text-nord-11" />
  if (status === 'skipped') return <ChevronRight size={13} className="text-nord-13" />
  return <CircleDashed size={13} className="text-[rgb(var(--muted)/.55)]" />
}

function StepRow({ entry }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center"><StepIcon status={entry.status} /></span>
      <span className={cn('w-[150px] shrink-0 text-2xs font-bold', entry.status === 'failed' ? 'text-nord-11' : entry.status === 'running' ? 'text-[rgb(var(--primary))]' : 'text-[rgb(var(--text))]')}>
        {STEP_LABELS[entry.step] || entry.step}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-[rgb(var(--muted))]" title={entry.detail}>{entry.detail}</span>
    </div>
  )
}

/**
 * The green/red info chip of ONE checkout. Clicking it expands the full
 * answer of the install command: exit code, everything the installer
 * printed, and the Store Commerce version before → after.
 */
function ResultInfo({ result }) {
  const [open, setOpen] = useState(false)
  const ok = Boolean(result?.ok)
  const label = ok
    ? `Installed${result.version ? ` — v${result.version}` : ''}`
    : result?.cancelled ? 'Stopped' : result?.error || 'Failed'
  return (
    <div className="mt-2 border-t border-[rgb(var(--border)/.45)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold transition',
          ok ? 'bg-nord-14/12 text-[#4c6a3a] hover:bg-nord-14/20'
            : result?.cancelled ? 'bg-nord-13/15 text-[#8b6e1c] hover:bg-nord-13/25'
            : 'bg-nord-11/12 text-nord-11 hover:bg-nord-11/20'
        )}
        title="Show the answer of the install command"
      >
        <Info size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {open ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 rounded-lg border border-[rgb(var(--border)/.5)] bg-[rgb(var(--surface)/.6)] p-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs font-bold text-[rgb(var(--muted))]">
            <span>Exit code: <b className={cn('font-mono', ok ? 'text-nord-14' : 'text-nord-11')}>{result.exitCode ?? '—'}</b></span>
            <span>Version: <b className="font-mono text-[rgb(var(--text))]">{result.versionBefore || '?'} → {result.version || '?'}</b></span>
            {result.timedOut && <span className="text-nord-13">Timed out</span>}
            <span className="ml-auto font-semibold">{formatDuration(result.durationMs || 0)}</span>
          </div>
          {result.output ? (
            <div className="max-h-40 overflow-y-auto rounded-md bg-[#1d2129] p-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#7b8496]"><Terminal size={10} /> Installer output</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#c8d0dc]">{result.output}</pre>
            </div>
          ) : (
            <p className="text-2xs text-[rgb(var(--muted))]">The installer produced no output.</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The Update Store Commerce popup: while the run is live it narrates every
 * step of every checkout exactly like the Deploy dialog; when it settles it
 * shows the green/red info per checkout with the full command answer.
 */
export default function StoreInstallDialog({ open, onOpenChange, run, running, onClose, onCancel }) {
  if (!run) return null
  const done = Boolean(run.summary) && !running
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!running) onOpenChange(next) }}
      title={done ? 'Store Commerce update summary' : 'Updating Store Commerce'}
      description={
        done
          ? `${run.summary.ok} of ${run.summary.total} checkout(s) updated successfully in ${formatDuration(run.summary.durationMs)}.`
          : `Close → verify → Hyper.StoreCommerce.Installer.exe /install → version, on every selected checkout`
      }
      className="max-w-3xl"
    >
      <div className="space-y-3">
        {done && (
          <div className={cn(
            'flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold',
            run.summary.failed > 0 ? 'border-nord-11/40 bg-nord-11/8 text-nord-11' : 'border-nord-14/40 bg-nord-14/10 text-[rgb(var(--text))]'
          )}>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-nord-14" />{run.summary.ok} succeeded</span>
            {run.summary.failed > 0 && <span className="flex items-center gap-1.5"><XCircle size={14} />{run.summary.failed} failed</span>}
            {run.summary.skipped > 0 && <span className="flex items-center gap-1.5 text-nord-13">{run.summary.skipped} skipped</span>}
            <span className="ml-auto font-semibold text-[rgb(var(--muted))]">{formatDuration(run.summary.durationMs)}</span>
          </div>
        )}

        <div className="max-h-[55dvh] space-y-2.5 overflow-y-auto pr-1">
          {run.checkouts.map((checkout) => {
            const steps = run.steps[checkout.id] || []
            const result = run.summary?.results?.find((row) => row.checkoutId === checkout.id)
            const isActive = running && run.activeId === checkout.id
            const state = result ? (result.ok ? 'done' : 'failed') : isActive ? 'running' : steps.length ? 'running' : 'pending'
            return (
              <motion.section
                key={checkout.id}
                layout
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  state === 'running' && 'border-[rgb(var(--primary)/.5)] bg-[rgb(var(--primary)/.05)]',
                  state === 'done' && 'border-nord-14/45 bg-nord-14/6',
                  state === 'failed' && 'border-nord-11/45 bg-nord-11/7',
                  state === 'pending' && 'border-[rgb(var(--border)/.6)] bg-[rgb(var(--surface)/.45)] opacity-75'
                )}
              >
                <header className="flex items-center gap-2">
                  {state === 'running' ? <Loader2 size={15} className="animate-spin text-[rgb(var(--primary))]" />
                    : state === 'done' ? <CheckCircle2 size={15} className="text-nord-14" />
                    : state === 'failed' ? <XCircle size={15} className="text-nord-11" />
                    : <CircleDashed size={15} className="text-[rgb(var(--muted))]}" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[rgb(var(--text))]">{checkout.name}</span>
                  <span className="truncate font-mono text-xs text-[rgb(var(--muted))]" title={[checkout.hostname, checkout.ip].filter(Boolean).join(' · ')}>{checkout.ip || checkout.hostname}</span>
                  {result?.ok && <span className="shrink-0 rounded-full bg-nord-14/20 px-2 py-0.5 text-xs font-bold text-[#5c7a46]">v{result.version || '?'} · exit {result.exitCode ?? 0}</span>}
                  {result && !result.ok && <span className="shrink-0 rounded-full bg-nord-11/15 px-2 py-0.5 text-xs font-bold text-nord-11" title={result.error}>{result.error || 'Failed'}</span>}
                </header>
                {steps.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-[rgb(var(--border)/.45)] pt-2">
                    {collapseSteps(steps, Boolean(result)).map((entry) => (
                      <StepRow key={`${checkout.id}-${entry.step}`} entry={entry} />
                    ))}
                  </div>
                )}
                {result && <ResultInfo result={result} />}
              </motion.section>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-[rgb(var(--muted))]">
            {running
              ? 'Checkouts are updated strictly one after another — the installer runs with system rights through the agent.'
              : 'Click the green or red info of a checkout to see the installer output and the resulting version.'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {running && onCancel && (
              <Button variant="destructive" size="sm" onClick={onCancel} disabled={run.cancelling}>
                <Square size={13} />{run.cancelling ? 'Stopping…' : 'Stop'}
              </Button>
            )}
            <Button variant={done ? 'primary' : 'secondary'} size="sm" onClick={onClose} disabled={running}>
              {done ? 'Close' : 'Minimize (keeps running)'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
