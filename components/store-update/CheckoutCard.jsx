'use client'

import { motion } from 'framer-motion'
import { Check, CircleCheck, CircleX, CloudUpload, Info, PackageSearch, RefreshCw, ShieldCheck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Three bouncing dots — the wait indicator inside the “Checking…” pill. */
function CheckingDots() {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-[5px] w-[5px] rounded-full bg-[rgb(var(--primary))]"
          animate={{ y: [0, -3, 0], opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.13, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

/** The status dot next to the name — the card's at-a-glance state. */
function stateDot(version) {
  const state = version?.state || 'checking'
  if (state === 'ok') return 'bg-nord-14'
  if (state === 'checking') return 'bg-[rgb(var(--primary))] animate-pulse'
  if (state === 'offline' || state === 'error') return 'bg-nord-11'
  if (state === 'no-host') return 'bg-nord-3'
  return 'bg-nord-13' // agent-not-running / not-found
}

/** Version pill in every state, including the animated “Checking…” wait. */
function VersionPill({ version }) {
  const state = version?.state || 'checking'
  if (state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary)/.12)] px-2 py-0.5 text-2xs font-bold text-[rgb(var(--primary))]">
        Checking
        <CheckingDots />
      </span>
    )
  }
  if (state === 'ok') {
    // Where the number came from matters: only the Control Panel entry is
    // authoritative, the other two routes can lag behind an update.
    const provenance = {
      agent: 'Read locally by the running HyperFamily Agent (Programs and Features)',
      'control-panel': 'Read from Programs and Features',
      wmi: 'Read from the live uninstall registry via WMI (Programs and Features version)',
      'registry-backup': 'Read from the registry backup — Remote Registry was stopped, so this may be slightly out of date',
      file: 'Read from the executable — this is the file version, not the Control Panel entry'
    }[version.source] || 'Installed version'
    const hint = [
      provenance,
      version.pingTime != null ? `Responded in ${version.pingTime} ms` : null,
      version.icmp === false ? 'Ping is filtered on this host; reached over SMB' : null
    ].filter(Boolean).join('\n')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-nord-14/20 px-2 py-0.5 font-mono text-2xs font-bold text-[#5c7a46]" title={hint}>
        <span className="h-1.5 w-1.5 rounded-full bg-nord-14" />
        v{version.version}
        {version.stale && <span className="font-sans text-xs font-bold text-[#8b6e1c]" title={provenance}>~</span>}
      </span>
    )
  }
  const looks = {
    'agent-not-running': { className: 'bg-nord-13/20 text-[#8b6e1c]', dot: 'bg-nord-13', label: 'Agent is not running' },
    offline: { className: 'bg-nord-11/15 text-nord-11', dot: 'bg-nord-11', label: 'Offline' },
    'not-found': { className: 'bg-nord-13/20 text-[#8b6e1c]', dot: 'bg-nord-13', label: 'Not installed' },
    'no-host': { className: 'bg-nord-3/15 text-[rgb(var(--muted))]', dot: 'bg-nord-3', label: 'No address' },
    error: { className: 'bg-nord-11/15 text-nord-11', dot: 'bg-nord-11', label: 'Check failed' }
  }
  const look = looks[state] || looks.error
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-bold', look.className)} title={version?.error || version?.detail || undefined}>
      <span className={cn('h-1.5 w-1.5 rounded-full', look.dot)} />
      {look.label}
    </span>
  )
}

/** Compact square icon button — every card action goes through this. */
function IconAction({ onClick, disabled, label, title, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={cn(
        'grid h-6 w-6 shrink-0 place-items-center rounded-md transition disabled:opacity-40',
        className || 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.55)] hover:text-[rgb(var(--text))]'
      )}
    >
      {children}
    </button>
  )
}

/**
 * One checkout in two compact rows so at least four fit per line:
 * row 1 = selection, status dot, name, address and the look-only actions;
 * row 2 = the version answer and the three actions. `deployBusy`/`agentBusy`
 * disable actions while that checkout is working, `anyDeployRunning` freezes
 * the whole grid.
 */
export default function CheckoutCard({ checkout, version, onRecheck, onDeploy, onInspect, onImportAgent, onUpdateStore, installResult, onShowInstallResult, selected = false, onSelect, agentBusy = false, deployBusy = false, anyDeployRunning = false }) {
  const address = checkout.ip || checkout.hostname || null
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-[rgb(var(--border)/.65)] bg-[rgb(var(--surface)/.6)] px-2.5 py-2 transition-colors hover:border-[rgb(var(--primary)/.35)]"
    >
      <div className="flex items-center gap-1.5">
        {onSelect && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${checkout.name}`}
            onClick={() => onSelect(checkout)}
            disabled={anyDeployRunning}
            className={cn(
              'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition disabled:opacity-40',
              selected ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white' : 'border-[rgb(var(--border))] bg-transparent text-transparent hover:border-[rgb(var(--primary)/.6)]'
            )}
          >
            <Check size={10} />
          </button>
        )}
        <span className={cn('h-2 w-2 shrink-0 rounded-full', stateDot(version))} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[rgb(var(--text))]" title={checkout.name}>{checkout.name}</span>
        {/* The IP is what the app connects to, so it is what we display. */}
        <span className="shrink-0 font-mono text-2xs text-[rgb(var(--muted))]" title={[checkout.hostname, checkout.ip].filter(Boolean).join(' · ')}>{address || 'no address'}</span>
        {onInspect && (
          <IconAction
            onClick={() => onInspect(checkout)}
            disabled={deployBusy || agentBusy}
            label="List installed programs"
            title="Show everything installed on this checkout — use it to find the exact product name"
          >
            <PackageSearch size={12} />
          </IconAction>
        )}
        <IconAction
          onClick={() => onRecheck(checkout)}
          disabled={deployBusy || agentBusy || version?.state === 'checking'}
          label="Recheck version"
          title="Recheck Store Commerce version"
        >
          <RefreshCw size={12} className={version?.state === 'checking' ? 'animate-spin' : ''} />
        </IconAction>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1.5">
        <VersionPill version={version} />
        <div className="flex shrink-0 items-center gap-1">
          <IconAction
            onClick={() => onImportAgent(checkout)}
            disabled={anyDeployRunning}
            label="Import Agent"
            title={agentBusy ? 'Importing the agent…' : 'Compare SHA-256, import the agent and configure automatic startup'}
            className={cn('bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)/.22)]', agentBusy && 'animate-pulse')}
          >
            <ShieldCheck size={12} />
          </IconAction>
          <IconAction
            onClick={() => onDeploy(checkout)}
            disabled={anyDeployRunning}
            label="Deploy"
            title="Deploy the selected file to this checkout"
            className="bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)/.22)]"
          >
            <CloudUpload size={12} />
          </IconAction>
          {onUpdateStore && (
            <IconAction
              onClick={() => onUpdateStore(checkout)}
              disabled={anyDeployRunning}
              label="Update Store Commerce"
              title="Close Store Commerce and run the deployed installer with its install argument"
              className="bg-nord-14/15 text-[#4c6a3a] hover:bg-nord-14/25"
            >
              <Wrench size={12} />
            </IconAction>
          )}
        </div>
      </div>
      {installResult && onShowInstallResult && (
        <button
          type="button"
          onClick={() => onShowInstallResult(checkout)}
          className={cn(
            'mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-2xs font-bold transition',
            installResult.ok ? 'bg-nord-14/12 text-[#4c6a3a] hover:bg-nord-14/20'
              : installResult.cancelled ? 'bg-nord-13/15 text-[#8b6e1c] hover:bg-nord-13/25'
              : 'bg-nord-11/12 text-nord-11 hover:bg-nord-11/20'
          )}
          title="Show the answer of the last Store Commerce update"
        >
          {installResult.ok ? <CircleCheck size={12} className="shrink-0" /> : <CircleX size={12} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">
            {installResult.ok ? `Updated to v${installResult.version || '?'}` : installResult.cancelled ? 'Update stopped' : (installResult.error || 'Update failed')}
          </span>
          <Info size={11} className="shrink-0 opacity-70" />
        </button>
      )}
    </motion.div>
  )
}
