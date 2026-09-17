'use client'

import { CircleDot, ExternalLink, Github, Mail, ShieldCheck } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { DEVELOPER_EMAIL, REPO } from '@/lib/about-presentation'

/** Support & source card: developer email, issue tracker and repository. */
export default function SupportCard({ onEmail, onExternal }: any) {
  return (
    <Card className="relative flex h-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-nord-14/6 via-transparent to-[rgb(var(--primary)/.04)]"
      />
      <CardHeader className="relative p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck size={15} className="text-nord-14" />
          Support &amp; source
        </CardTitle>
        <CardDescription className="mt-0 text-xs leading-snug">
          Report a reproducible issue, browse the repository, or reach the developer directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative flex h-full flex-col gap-1.5 p-3 pt-1">
        <button
          type="button"
          onClick={onEmail}
          className="contact-card group flex w-full items-center gap-2.5 rounded-xl border bg-[rgb(var(--surface)/.45)] px-2.5 py-2.5 text-left transition hover:border-[rgb(var(--primary)/.4)]"
          aria-label={`Send an email to ${DEVELOPER_EMAIL}`}
        >
          <span className="contact-card-icon grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))] transition">
            <Mail size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-2xs">Developer contact · Ali Ajeli Lahiji</b>
            <span className="block truncate font-mono text-xs text-[rgb(var(--primary))] underline-offset-2 group-hover:underline">
              {DEVELOPER_EMAIL}
            </span>
          </span>
          <ExternalLink
            size={14}
            className="shrink-0 text-[rgb(var(--muted))] transition group-hover:text-[rgb(var(--primary))]"
          />
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="justify-start"
            onClick={() => onExternal(`${REPO}/issues/new`)}
          >
            <CircleDot size={14} />
            Report an issue
          </Button>
          <Button size="sm" className="justify-start" onClick={() => onExternal(REPO)}>
            <Github size={14} />
            Repository
          </Button>
        </div>
        <p className="mt-auto rounded-xl border border-dashed bg-[rgb(var(--surface)/.35)] px-2.5 py-2 text-2xs leading-relaxed text-[rgb(var(--muted))]">
          Issues are triaged against the audit log and the version shown above — include both when reporting
          so a fix can be reproduced exactly.
        </p>
      </CardContent>
    </Card>
  )
}
