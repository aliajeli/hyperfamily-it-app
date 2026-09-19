'use client'

import { useState } from 'react'
import { Building2, ChevronDown, ClipboardList, CloudUpload, Loader2, RefreshCw, ShieldCheck, Wrench, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

function stateDot(version: any) {
  const state = version?.state || 'unknown'
  if (state === 'ok') return 'bg-nord-14'
  if (state === 'checking') return 'bg-[rgb(var(--primary))] animate-pulse'
  if (state === 'offline' || state === 'error' || state === 'agent-not-running') return 'bg-nord-11'
  if (state === 'no-host') return 'bg-nord-3'
  if (state === 'unknown') return 'bg-[rgb(var(--border))]'
  return 'bg-nord-12'
}

function VersionChip({ version }: any) {
  const state = version?.state || 'unknown'
  if (state === 'unknown') {
    return <span className="inline-flex items-center rounded-full bg-[rgb(var(--border)/.5)] px-2 py-1 text-2xs font-bold text-[rgb(var(--muted))]">Not checked</span>
  }
  if (state === 'checking') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--primary)/.1)] px-2 py-1 text-2xs font-bold text-[rgb(var(--primary))]"><Loader2 size={10} className="animate-spin" />Checking…</span>
  }
  if (state === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-nord-14/15 px-2.5 py-1 font-mono text-xs font-bold text-nord-14" title={`v${version.version}`}>
        v{version.version}
      </span>
    )
  }
  const looks: any = {
    offline: { className: 'bg-nord-11/15 text-nord-11', label: 'Offline' },
    'agent-not-running': { className: 'bg-nord-11/15 text-nord-11', label: 'Agent not running' },
    'not-found': { className: 'bg-amber-500/15 text-amber-700', label: 'Not installed' },
    'no-host': { className: 'bg-[rgb(var(--border)/.7)] text-[rgb(var(--muted))]', label: 'No host' },
    error: { className: 'bg-nord-11/15 text-nord-11', label: 'Error' }
  }
  const look = looks[state] || looks.error
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold', look.className)} title={version?.error || version?.detail || undefined}>{look.label}</span>
}

function ExtensionChip({ version }: any) {
  const state = version?.state || 'checking'
  if (state !== 'ok' && state !== 'not-found') return null
  if (!version.extension) {
    return <span className="inline-flex items-center rounded-full bg-[rgb(var(--border)/.6)] px-2 py-1 text-2xs font-bold text-[rgb(var(--muted))]">No ext</span>
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--primary)/.12)] px-2 py-1 text-2xs font-bold text-[rgb(var(--primary))]" title={`${version.extension.name} v${version.extension.version}`}>
      {version.extension.name} <b>v{version.extension.version}</b>
    </span>
  )
}

function RowAction({ onClick, disabled, label, title, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-[rgb(var(--surface))] text-[rgb(var(--muted))] shadow-sm transition md:h-7 md:w-7 md:rounded-lg md:shadow-none',
        'hover:border-[rgb(var(--primary)/.3)] hover:bg-[rgb(var(--primary)/.08)] hover:text-[rgb(var(--primary))]',
        'disabled:pointer-events-none disabled:opacity-40'
      )}
    >
      {children}
    </button>
  )
}

export default function BranchCheckoutsCard({ group, versions, selected, onSelectMany, onToggleSelect, onRecheckBranch, onUpdateBranch, onRecheck, onImportAgent, onDeploy, onInspect, onUpdateStore, onShowInstallResult, installResults, agentBusyIds, anyDeployRunning, hasFile }: any) {
  const [collapsed, setCollapsed] = useState(false)
  const { branch, checkouts } = group
  const states = checkouts.map((checkout: any) => versions[checkout.id]?.state || 'unknown')
  const okCount = states.filter((state: any) => state === 'ok').length
  const offlineCount = states.filter((state: any) => state === 'offline' || state === 'error' || state === 'agent-not-running').length
  const checkingCount = states.filter((state: any) => state === 'checking').length
  const unknownCount = states.filter((state: any) => state === 'unknown').length
  const allSelected = checkouts.length > 0 && checkouts.every((checkout: any) => selected.has(checkout.id))

  return (
    <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border)/.7)] bg-[rgb(var(--surface)/.6)] shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--border)/.55)] bg-[rgb(var(--surface)/.8)] px-3 py-2.5">
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand' : 'Collapse'} className="grid h-8 w-8 place-items-center rounded-lg text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.5)]">
          <ChevronDown size={16} className={cn('transition-transform', collapsed && '-rotate-90')} />
        </button>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]"><Building2 size={14} /></span>
        <div className="min-w-0 flex-1 md:flex-none">
          <h2 className="truncate text-sm font-black">{branch.name}</h2>
          <p className="flex items-center gap-1 text-2xs text-[rgb(var(--muted))]">
            <span className="font-mono font-bold">{branch.code}</span>
            <span>• {checkouts.length} checkout{checkouts.length !== 1 ? 's' : ''}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-2xs font-bold md:ml-2">
          {checkingCount > 0 && <span className="rounded-full bg-[rgb(var(--primary)/.12)] px-2 py-1 text-[rgb(var(--primary))]">{checkingCount} checking</span>}
          {okCount > 0 && <span className="rounded-full bg-nord-14/15 px-2 py-1 text-nord-14">{okCount} ok</span>}
          {offlineCount > 0 && <span className="rounded-full bg-nord-11/15 px-2 py-1 text-nord-11">{offlineCount} offline</span>}
          {unknownCount > 0 && <span className="rounded-full bg-[rgb(var(--border)/.6)] px-2 py-1 text-[rgb(var(--muted))]">{unknownCount} new</span>}
        </div>
        <div className="ml-auto flex w-full items-center gap-1.5 md:ml-auto md:w-auto">
          <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-bold md:border-0 md:bg-transparent md:px-1.5 md:py-1">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={allSelected} onChange={() => onSelectMany(checkouts.map((c: any) => c.id), !allSelected)} />
            <span className="hidden md:inline">Select all</span>
            <span className="md:hidden">All</span>
          </label>
          <button type="button" onClick={() => onRecheckBranch(checkouts)} disabled={anyDeployRunning || checkingCount > 0} className="flex flex-1 items-center justify-center gap-1 rounded-lg border bg-[rgb(var(--surface))] px-2.5 py-2 text-xs font-bold shadow-sm disabled:opacity-40 md:flex-none md:px-2 md:py-1 md:text-2xs">
            <RefreshCw size={13} /> Recheck
          </button>
          <button type="button" onClick={() => onUpdateBranch(checkouts)} disabled={anyDeployRunning} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-2.5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-40 md:flex-none md:px-2 md:py-1 md:text-2xs">
            <Wrench size={13} /> Update
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <div className="grid gap-2 p-2 md:hidden">
            {checkouts.map((checkout: any) => {
              const version = versions[checkout.id] || { state: 'unknown' }
              const installResult = installResults[checkout.id]
              const agentBusy = agentBusyIds.has(checkout.id)
              const busy = version?.state === 'checking' || agentBusy
              return (
                <div key={checkout.id} className="rounded-xl border bg-[rgb(var(--surface))] p-3 shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" checked={selected.has(checkout.id)} onChange={() => onToggleSelect(checkout)} />
                    <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', stateDot(version))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{checkout.name} {checkout.checkout_number ? <span className="font-mono text-xs text-[rgb(var(--muted))]">#{checkout.checkout_number}</span> : null}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-2xs text-[rgb(var(--muted))]">
                        <Monitor size={10} /> {checkout.ip} {checkout.hostname ? `• ${checkout.hostname}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <VersionChip version={version} />
                        <ExtensionChip version={version} />
                        {installResult && <button type="button" onClick={() => onShowInstallResult(checkout)} className={cn('h-3 w-3 rounded-full ring-2', installResult.ok ? 'bg-nord-14' : 'bg-nord-11')} />}
                      </div>
                      {(version.detail || version.error) && <p className="mt-1.5 text-2xs leading-snug text-[rgb(var(--muted))]">{version.detail || version.error}</p>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    <RowAction onClick={() => onRecheck(checkout)} disabled={busy} label="Recheck" title="Recheck version"><RefreshCw size={16} className={version?.state === 'checking' ? 'animate-spin' : ''} /></RowAction>
                    <RowAction onClick={() => onImportAgent(checkout)} disabled={anyDeployRunning || agentBusy} label="Import agent" title="Import agent"><ShieldCheck size={16} /></RowAction>
                    <RowAction onClick={() => onDeploy(checkout)} disabled={anyDeployRunning || agentBusy || !hasFile} label="Deploy" title={hasFile ? 'Deploy file' : 'Select file first'}><CloudUpload size={16} /></RowAction>
                    <RowAction onClick={() => onInspect(checkout)} disabled={busy} label="Inspect" title="Installed programs"><ClipboardList size={16} /></RowAction>
                    <RowAction onClick={() => onUpdateStore(checkout)} disabled={anyDeployRunning || agentBusy} label="Update" title="Update Store Commerce"><Wrench size={16} /></RowAction>
                  </div>
                </div>
              )
            })}
          </div>

          <ul className="hidden divide-y divide-[rgb(var(--border)/.4)] md:block">
            {checkouts.map((checkout: any) => {
              const version = versions[checkout.id] || { state: 'unknown' }
              const installResult = installResults[checkout.id]
              const agentBusy = agentBusyIds.has(checkout.id)
              const busy = version?.state === 'checking' || agentBusy
              return (
                <li key={checkout.id} className="flex flex-wrap items-center gap-2 px-3 py-2 transition-colors hover:bg-[rgb(var(--surface)/.7)]">
                  <input type="checkbox" aria-label={`Select ${checkout.name}`} className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--primary))]" checked={selected.has(checkout.id)} onChange={() => onToggleSelect(checkout)} />
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', stateDot(version))} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">
                    {checkout.name}
                    {checkout.checkout_number ? <span className="ml-1.5 font-mono text-2xs text-[rgb(var(--muted))]">#{checkout.checkout_number}</span> : null}
                    <span className="ml-1.5 font-mono text-2xs text-[rgb(var(--muted))]">{checkout.ip}</span>
                  </span>
                  <VersionChip version={version} />
                  <ExtensionChip version={version} />
                  {agentBusy && <Loader2 size={13} className="shrink-0 animate-spin text-[rgb(var(--primary))]" />}
                  {installResult && <button type="button" onClick={() => onShowInstallResult(checkout)} title={installResult.ok ? `Updated to v${installResult.version || '?'}` : installResult.error} className={cn('h-2.5 w-2.5 shrink-0 rounded-full ring-2', installResult.ok ? 'bg-nord-14' : 'bg-nord-11')} />}
                  <span className="ml-auto flex items-center gap-0.5">
                    <button type="button" onClick={() => onRecheck(checkout)} disabled={busy} className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--text))] disabled:opacity-40" title="Recheck"><RefreshCw size={13} className={version?.state === 'checking' ? 'animate-spin' : ''} /></button>
                    <button type="button" onClick={() => onImportAgent(checkout)} disabled={anyDeployRunning || agentBusy} className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--text))] disabled:opacity-40" title="Import agent"><ShieldCheck size={13} /></button>
                    <button type="button" onClick={() => onDeploy(checkout)} disabled={anyDeployRunning || agentBusy || !hasFile} className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--text))] disabled:opacity-40" title={hasFile ? 'Deploy' : 'Select file first'}><CloudUpload size={13} /></button>
                    <button type="button" onClick={() => onInspect(checkout)} disabled={busy} className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--text))] disabled:opacity-40" title="Inspect"><ClipboardList size={13} /></button>
                    <button type="button" onClick={() => onUpdateStore(checkout)} disabled={anyDeployRunning || agentBusy} className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--text))] disabled:opacity-40" title="Update Store Commerce"><Wrench size={13} /></button>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
