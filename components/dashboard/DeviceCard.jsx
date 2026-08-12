'use client'

import { Server, ShoppingCart, ShieldCheck, MoreHorizontal } from 'lucide-react'
import DeviceActionsMenu from './DeviceActionsMenu'
import DeviceStatusBadge from './DeviceStatusBadge'

const iconMap = {
  iLO: ShieldCheck,
  Server,
  Checkout: ShoppingCart
}

const treatment = {
  online: 'border-nord-14/45 bg-gradient-to-r from-nord-14/12 via-[rgb(var(--surface))] to-[rgb(var(--surface))]',
  warning: 'border-nord-13/55 bg-gradient-to-r from-nord-13/16 via-[rgb(var(--surface))] to-[rgb(var(--surface))]',
  offline: 'border-nord-11/45 bg-gradient-to-r from-nord-11/12 via-[rgb(var(--surface))] to-[rgb(var(--surface))]',
  unknown: 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
}

const accent = {
  online: 'bg-nord-14',
  warning: 'bg-nord-13',
  offline: 'bg-nord-11',
  unknown: 'bg-nord-3/40'
}

export default function DeviceCard({ device, label }) {
  const Icon = iconMap[device.device_type] || MoreHorizontal
  const state = device.status || 'unknown'
  const lastPing = device.last_ping_ms ?? device.ping_time
  const address = device.ip_address || device.ip
  const ping = Number.isFinite(lastPing) ? `${lastPing} ms` : 'No reply'

  return (
    <article className={`relative min-w-0 overflow-hidden rounded-xl border p-2 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${treatment[state] || treatment.unknown}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accent[state] || accent.unknown}`} />
      <div className="flex min-w-0 items-start gap-2 pl-1">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--canvas))] text-[rgb(var(--primary))]">
          <Icon size={15} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-extrabold leading-4" title={device.name}>{label || device.name}</p>
          <p className="truncate font-mono text-[8px] leading-3 text-[rgb(var(--muted))]" title={address}>{address}</p>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <DeviceStatusBadge status={state} compact />
            <span className="truncate text-[8px] font-bold tabular-nums text-[rgb(var(--muted))]">{ping}</span>
          </div>
        </div>

        <DeviceActionsMenu device={device} />
      </div>
    </article>
  )
}
