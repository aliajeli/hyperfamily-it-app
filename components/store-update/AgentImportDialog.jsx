'use client'

import { motion } from 'framer-motion'
import { Ban, CheckCircle2, ChevronRight, CircleDashed, CloudUpload, Loader2, OctagonX, ShieldCheck, Square, XCircle } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'
import { cn, collapseSteps, formatDuration } from '@/lib/utils'

/**
 * The agent import pipeline, in the order it runs. The service reports these
 * keys with a status; the labels live here so the dialog can render a
 * pipeline that matches the Deploy dialog exactly.
 */
const STEP_LABELS = {
  source: 'Bundled agent',
  target: 'Target paths',
  lock: 'Import lock',
  compare: 'SHA-256 comparison',
  copy: 'Copying agent',
  service: 'Windows service',
  heartbeat: 'Fresh heartbeat',
  finish: 'Finished',
  rollback: 'Rollback',
  cancelled: 'Cancelled',
  failed: 'Failed',
  import: 'Import result'
}

/** Steps the operator should see even before the checkout reports anything. */
const PIPELINE = ['source', 'target', 'lock', 'compare', 'copy', 'service', 'heartbeat', 'finish']

function StepIcon({ status }) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin text-[rgb(var(--primary))]" />
  if (status === 'done') return <CheckCircle2 size={13} className="text-nord-14" />
  if (status === 'failed') return <XCircle size={13} className="text-nord-11" />
  if (status === 'skipped') return <ChevronRight size={13} className="text-nord-13" />
  if (status === 'cancelled') return <OctagonX size={13} className="text-nord-11" />
  return <CircleDashed size={13} className="text-[rgb(var(--muted)/.55)]" />
}

/**
 * Merges the pipeline the operator expects with the steps the checkout has
 * really reported, so a not-yet-reached phase shows as waiting instead of
 * disappearing — and a phase skipped on purpose (a matching SHA-256 skips the
 * copy) stays visible.
 */
function pipelineSteps(steps, settled) {
  const rows = collapseSteps(steps, settled)
  const byStep = new Map(rows.map((entry) => [entry.step, entry]))
  const merged = PIPELINE.map((step) => byStep.get(step) || { step, status: 'pending', detail: settled ? 'Not reached' : 'Waiting' })
  for (const entry of rows) if (!PIPELINE.includes(entry.step)) merged.push(entry)
  return merged
}

/** One narrated pipeline step, with the byte progress bar while transferring. */
function StepRow({ entry }) {
  const percent = entry.progress && entry.progress.totalBytes > 0 && entry.status === 'running'
    ? Math.min(100, Math.floor(entry.progress.bytes * 100 / entry.progress.totalBytes))
    : null
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center"><StepIcon status={entry.status} /></span>
        <span className={cn(
          'w-[136px] shrink-0 text-2xs font-bold',
          entry.status === 'failed' || entry.status === 'cancelled' ? 'text-nord-11'
            : entry.status === 'running' ? 'text-[rgb(var(--primary))]'
            : entry.status === 'skipped' ? 'status-warning-text'
            : 'text-[rgb(var(--text))]'
        )}
        >
          {STEP_LABELS[entry.step] || entry.step}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[rgb(var(--muted))]" title={entry.detail}>{entry.detail}</span>
        {percent != null && <span className="shrink-0 font-mono text-xs font-bold text-[rgb(var(--primary))]">{percent}%</span>}
      </div>
      {percent != null && (
        <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border)/.7)]">
          <motion.div className="h-full rounded-full bg-[rgb(var(--primary))]" initial={false} animate={{ width: `${percent}%` }} transition={{ duration: 0.12 }} />
        </div>
      )}
    </div>
  )
}

/**
 * The Import Agent popup.
 *
 * It narrates the pipeline the same way the Deploy dialog does — one coloured
 * row per phase, per checkout, with byte progress while the EXE travels — and
 * it can be stopped at any moment: the checkout is rolled back to its previous
 * executable and service, and the run reports what was cancelled.
 *
 * Props:
 *  - run: { open, running, cancelling, cancelled, targets, steps, results, summary }
 *  - onCancel: asks the main process to stop the run
 *  - onClose: hides the dialog (only when nothing is running)
 */
export default function AgentImportDialog({ run, onCancel, onClose }) {
  if (!run) return null
  const running = Boolean(run.running)
  const done = !running && Boolean(run.results?.length)
  const summary = run.summary
  const cancelled = Boolean(run.cancelled || summary?.cancelledByOperator)
  const failed = (summary?.failed ?? run.results?.filter((entry) => !entry.ok && !entry.cancelled).length) || 0
  const succeeded = summary?.ok ?? run.results?.filter((entry) => entry.ok).length ?? 0
  const stoppedCount = summary?.cancelled ?? run.results?.filter((entry) => entry.cancelled && !entry.skipped).length ?? 0
  const skippedCount = summary?.skipped ?? run.results?.filter((entry) => entry.skipped).length ?? 0

  const title = !done ? (running ? 'Importing Agent' : 'Import Agent')
    : cancelled ? 'Import stopped' : failed > 0 ? 'Import finished with errors' : 'Import summary'

  return (
    <Dialog
      open={run.open}
      onOpenChange={(open) => { if (!open && !running) onClose() }}
      title={title}
      description={
        done
          ? `${succeeded} of ${run.targets.length} checkout(s) now run the verified agent${failed ? `, ${failed} failed` : ''}${stoppedCount ? `, ${stoppedCount} stopped` : ''}${skippedCount ? `, ${skippedCount} skipped` : ''}.`
          : `C:\\Agent · automatic Windows Service · SHA-256 verified — ${run.targets.length} checkout(s)`
      }
      className="max-w-3xl"
    >
      <div className="space-y-3">
        {/* Outcome first, so the result is visible without reading every row. */}
        {done && (
          <div className={cn(
            'flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold',
            cancelled && failed === 0 ? 'border-nord-13/45 bg-nord-13/12 status-warning-text'
              : failed > 0 ? 'border-nord-11/40 bg-nord-11/8 text-nord-11'
              : 'border-nord-14/40 bg-nord-14/10 text-[rgb(var(--text))]'
          )}
          >
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-nord-14" />{succeeded} succeeded</span>
            {failed > 0 && <span className="flex items-center gap-1.5"><XCircle size={14} />{failed} failed</span>}
            {stoppedCount > 0 && <span className="flex items-center gap-1.5"><OctagonX size={14} />{stoppedCount} stopped</span>}
            {skippedCount > 0 && <span className="flex items-center gap-1.5"><Ban size={14} />{skippedCount} skipped</span>}
            {summary?.durationMs > 0 && (
              <span className="ml-auto font-semibold text-[rgb(var(--muted))]">{formatDuration(summary.durationMs)}</span>
            )}
          </div>
        )}

        {!done && (
          <p className="text-2xs leading-relaxed text-[rgb(var(--muted))]">
            Identical EXEs are not copied again. Slow branch transfers may continue for up to 30 minutes per file operation while making progress; 2 minutes without I/O progress stops the operation.
            The service starts before Login and must produce a fresh heartbeat before the import succeeds.
          </p>
        )}

        <div className="max-h-[55dvh] space-y-2.5 overflow-y-auto pr-1">
          {run.targets.map((checkout) => {
            const result = run.results?.find((entry) => entry.checkoutId === checkout.id)
            const steps = run.steps?.[checkout.id] || []
            const isActive = running && !result
            const state = result
              ? (result.ok ? 'done' : result.cancelled ? (result.skipped ? 'skipped' : 'cancelled') : 'failed')
              : isActive ? (steps.length ? 'running' : 'pending') : 'pending'
            return (
              <motion.section
                key={checkout.id}
                layout
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  state === 'running' && 'border-[rgb(var(--primary)/.5)] bg-[rgb(var(--primary)/.05)]',
                  state === 'done' && 'border-nord-14/45 bg-nord-14/6',
                  state === 'failed' && 'border-nord-11/45 bg-nord-11/7',
                  state === 'cancelled' && 'border-nord-13/45 bg-nord-13/8',
                  (state === 'pending' || state === 'skipped') && 'border-[rgb(var(--border)/.6)] bg-[rgb(var(--surface)/.45)] opacity-80'
                )}
              >
                <header className="flex items-center gap-2">
                  {state === 'running' ? <Loader2 size={15} className="animate-spin text-[rgb(var(--primary))]" />
                    : state === 'done' ? <CheckCircle2 size={15} className="text-nord-14" />
                    : state === 'failed' ? <XCircle size={15} className="text-nord-11" />
                    : state === 'cancelled' ? <OctagonX size={15} className="status-warning-text" />
                    : state === 'skipped' ? <Ban size={15} className="text-[rgb(var(--muted))]" />
                    : <ShieldCheck size={15} className="text-[rgb(var(--muted))]" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[rgb(var(--text))]">{checkout.name}</span>
                  {/* The address the import really connects to. */}
                  <span className="truncate font-mono text-xs text-[rgb(var(--muted))]" title={[checkout.hostname, checkout.ip].filter(Boolean).join(' · ')}>{checkout.ip || checkout.hostname}</span>
                  {result?.ok && (
                    <span className="shrink-0 rounded-full bg-nord-14/20 px-2 py-0.5 text-xs font-bold text-[#5c7a46] dark:text-nord-14">
                      {result.copied ? 'Copied and verified' : 'SHA-256 matched'}{result.durationMs ? ` · ${formatDuration(result.durationMs)}` : ''}
                    </span>
                  )}
                  {result && !result.ok && (
                    <span
                      className={cn('shrink-0 max-w-[46%] truncate rounded-full px-2 py-0.5 text-xs font-bold', result.cancelled ? 'bg-nord-13/20 status-warning-text' : 'bg-nord-11/15 text-nord-11')}
                      title={result.error}
                    >
                      {result.cancelled ? (result.skipped ? 'Skipped' : 'Stopped') : result.error || 'Failed'}
                    </span>
                  )}
                </header>

                {steps.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-[rgb(var(--border)/.45)] pt-2">
                    {pipelineSteps(steps, !isActive).map((entry) => <StepRow key={`${checkout.id}-${entry.step}`} entry={entry} />)}
                  </div>
                )}
              </motion.section>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-2xs text-[rgb(var(--muted))]">
            {running
              ? <span className="inline-flex items-center gap-1.5"><CloudUpload size={12} /> Checkouts are imported strictly one after another — keep the app open.</span>
              : cancelled
                ? 'Stopped checkouts were rolled back: the previous executable and service were left exactly as they were.'
                : 'Identical binaries are never copied twice, and every copy is proven with a read-back SHA-256.'}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {running && (
              <Button variant="secondary" size="sm" onClick={onCancel} disabled={run.cancelling}>
                {run.cancelling ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                {run.cancelling ? 'Stopping…' : 'Stop import'}
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
