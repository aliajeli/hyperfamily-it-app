'use client'

import { Settings2 } from 'lucide-react'

/** How the run proceeds — shown up front so the operator knows the plan. */
export default function HowItWorks({ settings }: any) {
  if (!settings) return null
  return (
    <p className="rounded-xl border border-[rgb(var(--border)/.55)] bg-[rgb(var(--surface)/.45)] px-3 py-2 text-2xs leading-relaxed text-[rgb(var(--muted))]">
      <Settings2 size={12} className="mr-1 inline-block" />
      The local Agent reads the Store Commerce version from Programs and Features. Import installs it in
      C:\Agent as an automatic Windows Service. Missing/stopped agents show “Agent is not running”. Update
      files land in <b className="font-mono">{settings.store_update_path}</b> (changeable in Settings → Store
      App). Checkouts in another domain are reached with the account from Settings → Store App → Target
      access. Per checkout: connection check → dated backup of the existing file (
      <b className="font-mono">14050617-name</b>) → copy → SHA-256 proof, with delete-and-retry on mismatch.
    </p>
  )
}
