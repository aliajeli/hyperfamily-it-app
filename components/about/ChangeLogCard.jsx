'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Github, ScrollText, Sparkles, Wrench, Bug, ShieldAlert, Trash2 } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { APP_VERSION } from '@/lib/constants'
import { CHANGELOG_ENTRIES } from '@/lib/changelog'
import { cn } from '@/lib/utils'

const REPO = 'https://github.com/aliajeli/hyperfamily-it-app'

/** Section key → icon, colour and label. Unknown keys render neutrally. */
const SECTIONS = [
  { key: 'added', label: 'Added', icon: Sparkles, className: 'text-nord-14', chip: 'bg-nord-14/14 text-[#5c7a46] dark:text-nord-14' },
  { key: 'improved', label: 'Improved', icon: Wrench, className: 'text-[rgb(var(--primary))]', chip: 'bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]' },
  { key: 'fixed', label: 'Fixed', icon: Bug, className: 'text-nord-12', chip: 'bg-nord-12/14 text-nord-12' },
  { key: 'removed', label: 'Removed', icon: Trash2, className: 'text-[rgb(var(--muted))]', chip: 'bg-[rgb(var(--border)/.6)] text-[rgb(var(--muted))]' },
  { key: 'security', label: 'Security', icon: ShieldAlert, className: 'text-nord-13', chip: 'bg-nord-13/16 status-warning-text' }
]

/** Drops sections a version does not use, in a stable display order. */
function sectionsOf(entry) {
  return SECTIONS
    .map((section) => ({ ...section, items: entry?.changes?.[section.key] || [] }))
    .filter((section) => section.items.length > 0)
}

/**
 * One version's notes: the title, the release date/channel and every change
 * grouped by kind. Shared by the "installed version" block and the history.
 */
function VersionNotes({ entry, compact = false }) {
  if (!entry) {
    return (
      <p className="text-2xs text-[rgb(var(--muted))]">
        No changelog is bundled for this version. The release notes of every published build are on the GitHub releases page.
      </p>
    )
  }
  const sections = sectionsOf(entry)
  return (
    <div className="space-y-2">
      {entry.title && <p className="text-xs font-bold leading-snug text-[rgb(var(--text))]">{entry.title}</p>}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-wider text-[rgb(var(--muted))]">
        <span className="font-mono font-bold text-[rgb(var(--primary))]">v{entry.version}</span>
        {entry.date && <span>{entry.date}</span>}
        {entry.channel && (
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-bold', entry.channel === 'beta' ? 'bg-nord-13/18 status-warning-text' : 'bg-nord-14/14 status-online-text')}>
            {entry.channel === 'beta' ? 'Beta preview' : 'Stable release'}
          </span>
        )}
      </p>
      {sections.length === 0 ? (
        <p className="text-2xs text-[rgb(var(--muted))]">This release carried maintenance changes only.</p>
      ) : (
        <div className="space-y-1.5">
          {sections.map(({ key, label, icon: Icon, className, chip, items }) => (
            <div key={key}>
              <p className={cn('mb-0.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em]', className)}>
                <Icon size={11} />{label}
                <span className={cn('ml-0.5 rounded-full px-1.5 py-px text-xs font-bold normal-case tracking-normal', chip)}>{items.length}</span>
              </p>
              <ul className={cn('space-y-0.5 pl-[17px]', compact ? 'text-xs' : 'text-2xs')}>
                {items.map((item) => (
                  <li key={item} className="relative leading-relaxed text-[rgb(var(--muted))] before:absolute before:-left-3 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-[rgb(var(--muted)/.55)] before:content-['']">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * About → Change log.
 *
 * Every release is written into lib/changelog.json, so this card always knows
 * what the installed build changed — with or without network access — and the
 * same file is what the release workflows publish as the GitHub release notes.
 */
export default function ChangeLogCard({ version = APP_VERSION, onOpenExternal, updateVersion = null, updateNotes = null }) {
  const entries = CHANGELOG_ENTRIES
  const current = useMemo(() => entries.find((entry) => entry.version === version) || null, [entries, version])
  const pending = useMemo(() => entries.find((entry) => entry.version === updateVersion) || null, [entries, updateVersion])
  const [historyOpen, setHistoryOpen] = useState(false)
  // The installed version is already expanded at the top, so the history below
  // it starts from the release before it.
  const history = useMemo(() => {
    const index = entries.findIndex((entry) => entry.version === version)
    return index === -1 ? entries.slice(1) : entries.slice(index + 1)
  }, [entries, version])
  const openExternal = (url) => onOpenExternal?.(url)

  return (
    <Card>
      <CardHeader className="p-2.5 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm"><ScrollText size={15} />Change log</CardTitle>
        <CardDescription className="mt-0 text-xs leading-snug">
          What changed in this build and in every version before it.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-2.5 pt-1">
        {/* A pending update leads when one is known, so the operator reads what
            is about to change before what already changed. */}
        {pending && pending.version !== version && (
          <div className="mb-2 rounded-xl border border-[rgb(var(--primary)/.35)] bg-[rgb(var(--primary)/.06)] p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[rgb(var(--primary))]">
              <Sparkles size={12} />Coming in the available update
            </p>
            {/* The bundled entry wins; a remote note is the fallback for a
                version published after this build. */}
            {pending ? <VersionNotes entry={pending} compact /> : (
              <p className="whitespace-pre-line text-xs leading-relaxed text-[rgb(var(--muted))]">{updateNotes || 'Release notes are published with the update.'}</p>
            )}
          </div>
        )}

        <div className="rounded-xl border bg-[rgb(var(--surface)/.42)] p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">
            <ScrollText size={12} />Installed version
          </p>
          <VersionNotes entry={current} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
            <ChevronDown size={14} className={cn('transition-transform', historyOpen && 'rotate-180')} />
            {historyOpen ? 'Hide previous versions' : `Previous versions (${history.length})`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openExternal(`${REPO}/releases`)}>
            <Github size={14} />All releases on GitHub
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {historyOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="mt-2 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {history.length === 0 && (
                  <p className="text-2xs text-[rgb(var(--muted))]">This is the first recorded version.</p>
                )}
                {history.map((entry) => (
                  <details key={entry.version} className="group rounded-xl border bg-[rgb(var(--surface)/.38)] px-2.5 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-2xs font-bold text-[rgb(var(--text))] marker:content-none">
                      <ChevronDown size={13} className="shrink-0 text-[rgb(var(--muted))] transition-transform group-open:rotate-180" />
                      <span className="font-mono text-[rgb(var(--primary))]">v{entry.version}</span>
                      <span className="min-w-0 flex-1 truncate font-sans font-semibold text-[rgb(var(--muted))]">{entry.title}</span>
                      <span className="shrink-0 font-mono text-xs font-semibold text-[rgb(var(--muted))]">{entry.date}</span>
                    </summary>
                    <div className="mt-2 border-t border-[rgb(var(--border)/.5)] pt-2">
                      <VersionNotes entry={entry} compact />
                    </div>
                  </details>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
