'use client'

import { useState } from 'react'
import {
  Building2,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** The status dot next to a checkout row — the at-a-glance state. */
function stateDot(version) {
  const state = version?.state || 'unknown'
  if (state === 'ok') return 'bg-nord-14'
  if (state === 'checking') return 'bg-[rgb(var(--primary))] animate-pulse'
  if (state === 'offline' || state === 'error' || state === 'agent-not-running') return 'bg-nord-11'
  if (state === 'no-host') return 'bg-nord-3'
  if (state === 'unknown') return 'bg-[rgb(var(--border))]'
  return 'bg-nord-12'
}

/** Compact Store Commerce version chip for a list row. */
function VersionChip({ version }: any) {
  const state = version?.state || 'unknown'
  if (state === 'unknown') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[rgb(var(--border)/.5)] px-2 py-0.5 text-2xs font-bold text-[rgb(var(--muted))]"
        title="Not checked yet in this session — use Recheck"
      >
        Not checked
      </span>
    )
  }
  if (state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--primary)/.1)] px-2 py-0.5 text-2xs font-bold text-[rgb(var(--primary))]">
        <Loader2 size={10} className="animate-spin" />
        Checking…
      </span>
    )
  }
  if (state === 'ok') {
    const provenance =
      {
        agent: 'Read by the agent from Programs and Features on the checkout',
        wmi: 'Read from the live uninstall registry via WMI (Programs and Features version)',
        file: 'Read from the executable — this is the file version, not the Control Panel entry'
      }[version.source] || 'Installed version'
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-nord-14/12 px-2 py-0.5 font-mono text-2xs font-bold text-nord-14"
        title={[
          provenance,
          version.pingTime != null ? `Responded in ${version.pingTime} ms` : null,
          version.icmp === false ? 'Ping is filtered on this host; reached over SMB' : null
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        v{version.version}
        {version.stale && (
          <span
            className="font-sans font-bold text-[#8b6e1c]"
            title="A newer Store Commerce was detected elsewhere — this checkout is behind"
          >
            ~
          </span>
        )}
      </span>
    )
  }
  const looks = {
    offline: { className: 'bg-nord-11/12 text-nord-11', label: 'Offline' },
    'agent-not-running': { className: 'bg-nord-11/12 text-nord-11', label: 'Agent not running' },
    'not-found': { className: 'bg-[#8b6e1c]/12 text-[#8b6e1c]', label: 'Not installed' },
    'no-host': { className: 'bg-[rgb(var(--border)/.7)] text-[rgb(var(--muted))]', label: 'No host' },
    error: { className: 'bg-nord-11/12 text-nord-11', label: 'Error' }
  }
  const look = looks[state] || looks.error
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold', look.className)}
      title={version?.error || version?.detail || undefined}
    >
      {look.label}
    </span>
  )
}

/** Hyper.Commerce extension chip, shown once the checkout answered. */
function ExtensionChip({ version }: any) {
  const state = version?.state || 'checking'
  if (state !== 'ok' && state !== 'not-found') return null
  if (!version.extension) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[rgb(var(--border)/.6)] px-2 py-0.5 text-2xs font-bold text-[rgb(var(--muted))]"
        title="The Hyper.Commerce extension was not found in its manifest, Programs and Features or its installation folder on this checkout"
      >
        No extension
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--primary)/.1)] px-2 py-0.5 text-2xs font-bold text-[rgb(var(--primary))]"
      title={`${version.extension.name} v${version.extension.version} — ${version.extension.source === 'manifest' ? 'read from POS/manifest.json on this checkout' : version.extension.source === 'file' ? 'file version of the deployed extension on this checkout' : 'Programs and Features on this checkout'}`}
    >
      {version.extension.name} <b>v{version.extension.version}</b>
    </span>
  )
}

function RowAction({ onClick, disabled, label, title, children, danger }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={cn(
        'grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-transparent text-[rgb(var(--muted))] transition',
        'hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--surface)/.8)] hover:text-[rgb(var(--text))]',
        'disabled:pointer-events-none disabled:opacity-40',
        danger && 'hover:text-nord-11'
      )}
    >
      {children}
    </button>
  )
}

/**
 * One card per branch with its checkouts as a compact list — the redesign
 * replaces the old card grid so a store's whole estate fits on one screen
 * and branch-level actions (select, recheck, update) live in the card head.
 */
export default function BranchCheckoutsCard({
  group,
  versions,
  selected,
  onSelectMany,
  onToggleSelect,
  onRecheckBranch,
  onUpdateBranch,
  onRecheck,
  onImportAgent,
  onDeploy,
  onInspect,
  onUpdateStore,
  onShowInstallResult,
  installResults,
  agentBusyIds,
  anyDeployRunning,
  hasFile
}: any) {
  const [collapsed, setCollapsed] = useState(false)
  const { branch, checkouts } = group
  const states = checkouts.map((checkout) => versions[checkout.id]?.state || 'unknown')
  const okCount = states.filter((state) => state === 'ok').length
  const offlineCount = states.filter(
    (state) => state === 'offline' || state === 'error' || state === 'agent-not-running'
  ).length
  const checkingCount = states.filter((state) => state === 'checking').length
  const unknownCount = states.filter((state) => state === 'unknown').length
  const allSelected = checkouts.length > 0 && checkouts.every((checkout) => selected.has(checkout.id))

  return (
    <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border)/.7)] bg-[rgb(var(--surface)/.5)] shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--border)/.55)] bg-[rgb(var(--surface)/.75)] px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand branch' : 'Collapse branch'}
          className="grid h-7 w-7 place-items-center rounded-lg text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]"
        >
          <ChevronDown size={15} className={cn('transition-transform', collapsed && '-rotate-90')} />
        </button>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]">
          <Building2 size={14} />
        </span>
        <h2 className="truncate text-sm font-bold text-[rgb(var(--text))]">{branch.name}</h2>
        <span className="rounded-full bg-[rgb(var(--border)/.6)] px-2 py-0.5 font-mono text-2xs font-bold text-[rgb(var(--muted))]">
          {branch.code}
        </span>
        <span className="text-2xs font-semibold text-[rgb(var(--muted))]">
          {checkouts.length} checkout{checkouts.length !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5 text-2xs font-bold">
          {checkingCount > 0 && (
            <span className="rounded-full bg-[rgb(var(--primary)/.1)] px-1.5 py-0.5 text-[rgb(var(--primary))]">
              {checkingCount} checking
            </span>
          )}
          {okCount > 0 && (
            <span className="rounded-full bg-nord-14/12 px-1.5 py-0.5 text-nord-14">{okCount} ok</span>
          )}
          {offlineCount > 0 && (
            <span className="rounded-full bg-nord-11/12 px-1.5 py-0.5 text-nord-11">
              {offlineCount} offline
            </span>
          )}
          {unknownCount > 0 && (
            <span className="rounded-full bg-[rgb(var(--border)/.6)] px-1.5 py-0.5 text-[rgb(var(--muted))]">
              {unknownCount} not checked
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg px-1.5 py-1 text-2xs font-bold text-[rgb(var(--muted))] transition hover:text-[rgb(var(--text))]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[rgb(var(--primary))]"
              checked={allSelected}
              onChange={() =>
                onSelectMany(
                  checkouts.map((checkout) => checkout.id),
                  !allSelected
                )
              }
            />
            Select all
          </label>
          <button
            type="button"
            onClick={() => onRecheckBranch(checkouts)}
            disabled={anyDeployRunning || checkingCount > 0}
            className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border)/.7)] px-2 py-1 text-2xs font-bold text-[rgb(var(--muted))] transition hover:text-[rgb(var(--text))] disabled:pointer-events-none disabled:opacity-40"
          >
            <RefreshCw size={11} /> Recheck
          </button>
          <button
            type="button"
            onClick={() => onUpdateBranch(checkouts)}
            disabled={anyDeployRunning}
            className="flex items-center gap-1 rounded-lg bg-[rgb(var(--primary-strong))] px-2 py-1 text-2xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            <Wrench size={11} /> Update branch
          </button>
        </div>
      </header>

      {!collapsed && (
        <ul className="divide-y divide-[rgb(var(--border)/.4)]">
          {checkouts.map((checkout) => {
            const version = versions[checkout.id] || { state: 'unknown' }
            const installResult = installResults[checkout.id]
            const agentBusy = agentBusyIds.has(checkout.id)
            const busy = version?.state === 'checking' || agentBusy
            return (
              <li
                key={checkout.id}
                className="flex flex-wrap items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[rgb(var(--surface)/.7)]"
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${checkout.name}`}
                  className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--primary))]"
                  checked={selected.has(checkout.id)}
                  onChange={() => onToggleSelect(checkout)}
                />
                <span className={cn('h-2 w-2 shrink-0 rounded-full', stateDot(version))} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-[rgb(var(--text))]">
                  {checkout.name}
                  {checkout.checkout_number ? (
                    <span className="ml-1.5 font-mono text-2xs font-semibold text-[rgb(var(--muted))]">
                      #{checkout.checkout_number}
                    </span>
                  ) : null}
                  <span className="ml-1.5 font-mono text-2xs font-semibold text-[rgb(var(--muted))]">
                    {checkout.ip}
                  </span>
                </span>
                <VersionChip version={version} />
                <ExtensionChip version={version} />
                {agentBusy && (
                  <Loader2 size={13} className="shrink-0 animate-spin text-[rgb(var(--primary))]" />
                )}
                {installResult && (
                  <button
                    type="button"
                    onClick={() => onShowInstallResult(checkout)}
                    title={
                      installResult.ok
                        ? `Updated to v${installResult.version || '?'}`
                        : installResult.cancelled
                          ? 'Update stopped'
                          : installResult.error || 'Update failed'
                    }
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[rgb(var(--surface))]',
                      installResult.ok ? 'bg-nord-14' : 'bg-nord-11'
                    )}
                    aria-label="Show the last update result"
                  />
                )}
                <span className="ml-auto flex items-center gap-0.5">
                  <RowAction
                    onClick={() => onRecheck(checkout)}
                    disabled={busy}
                    label="Recheck version"
                    title="Recheck Store Commerce version"
                  >
                    <RefreshCw size={13} className={version?.state === 'checking' ? 'animate-spin' : ''} />
                  </RowAction>
                  <RowAction
                    onClick={() => onImportAgent(checkout)}
                    disabled={anyDeployRunning || agentBusy}
                    label="Import agent"
                    title="Install or update the HyperFamily agent on this checkout"
                  >
                    <ShieldCheck size={13} />
                  </RowAction>
                  <RowAction
                    onClick={() => onDeploy(checkout)}
                    disabled={anyDeployRunning || agentBusy || !hasFile}
                    label="Deploy update file"
                    title={
                      hasFile
                        ? 'Copy the selected update file to this checkout'
                        : 'Select an update file first'
                    }
                  >
                    <CloudUpload size={13} />
                  </RowAction>
                  <RowAction
                    onClick={() => onInspect(checkout)}
                    disabled={busy}
                    label="Inspect installed programs"
                    title="List everything installed on this checkout"
                  >
                    <ClipboardList size={13} />
                  </RowAction>
                  <RowAction
                    onClick={() => onUpdateStore(checkout)}
                    disabled={anyDeployRunning || agentBusy}
                    label="Update Store Commerce"
                    title="Run the Store Commerce update pipeline on this checkout"
                  >
                    <Wrench size={13} />
                  </RowAction>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
