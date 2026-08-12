'use client'

import { motion } from 'framer-motion'
import { CreditCard, Eye, EyeOff, HardDrive, Monitor, Network, Pencil, Plus, Router, Scale, Server, ShoppingCart, Trash2, Video, Wifi } from 'lucide-react'
import { Badge, Button, EmptyState } from '@/components/ui'
import { DEVICE_TYPE_DETAILS } from '@/lib/constants'

const icons = { Router, Switch: Network, iLO: HardDrive, Server, NVR: Video, AccessPoint: Wifi, Scale, Client: Monitor, Checkout: ShoppingCart, POS: CreditCard }

function titleFor(device) {
  if (device.name) return device.name
  if (device.device_type === 'Checkout' && device.checkout_number) return `Checkout ${device.checkout_number}`
  if (device.device_type === 'POS' && device.checkout_number) return `POS · Checkout ${device.checkout_number}`
  if (device.hostname) return device.hostname
  if (device.model) return device.model
  return DEVICE_TYPE_DETAILS[device.device_type]?.label || device.device_type
}

function detailsFor(device) {
  const candidates = {
    Router: [device.model, device.asset_code],
    Switch: [device.model, device.location, device.connection_port && `Connection ${device.connection_port}`],
    iLO: [device.esxi_version && `ESXi ${device.esxi_version}`, device.model],
    Server: [device.hostname],
    NVR: [device.model, device.asset_code],
    AccessPoint: [device.model, device.location, device.port && `Port ${device.port}`],
    Scale: [device.model, device.location, device.serial_number && `S/N ${device.serial_number}`],
    Client: [device.user, device.domain],
    Checkout: [device.hostname],
    POS: [device.brand, device.model, device.terminal_id && `Terminal ${device.terminal_id}`]
  }
  return (candidates[device.device_type] || []).filter(Boolean).slice(0, 3)
}

export default function DeviceList({ devices, branch, onEdit, onDelete, onAdd }) {
  if (!devices.length) {
    return (
      <EmptyState
        icon={<Network />}
        title={`No devices in ${branch.name}`}
        description="Select Add device, choose an equipment card, and enter only the information required for that device type."
        action={<Button onClick={onAdd}><Plus size={15} />Add first device</Button>}
      />
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {devices.map((device, index) => {
        const Icon = icons[device.device_type] || Network
        const details = detailsFor(device)
        const ports = Array.isArray(device.switch_ports) ? device.switch_ports.length : 0
        return (
          <motion.article
            key={device.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.025 }}
            whileHover={{ y: -3 }}
            className="directory-device-card group relative overflow-hidden rounded-2xl border bg-[rgb(var(--surface)/.7)] p-4 shadow-sm"
          >
            <span aria-hidden="true" className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[rgb(var(--primary)/.07)] blur-3xl transition-transform duration-500 group-hover:scale-150" />
            <div className="relative flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--primary)/.11)] text-[rgb(var(--primary))] ring-1 ring-[rgb(var(--primary)/.12)]"><Icon size={19} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-[rgb(var(--muted))]">{DEVICE_TYPE_DETAILS[device.device_type]?.label || device.device_type}</p>
                    <h3 className="mt-0.5 truncate text-sm font-black tracking-[0.025em]" title={titleFor(device)}>{titleFor(device)}</h3>
                  </div>
                  <Badge status={device.status || 'unknown'} className="shrink-0 px-2 py-0.5 text-[9px] capitalize">{device.status || 'unknown'}</Badge>
                </div>
                <p className="mt-1 font-mono text-[10px] font-bold text-[rgb(var(--primary))]">{device.ip}{device.port ? `:${device.port}` : ''}</p>
              </div>
            </div>

            <div className="relative mt-3 flex min-h-7 flex-wrap gap-1.5">
              {details.map((detail) => <span key={detail} className="max-w-full truncate rounded-lg bg-[rgb(var(--canvas)/.8)] px-2 py-1 text-[8px] font-semibold text-[rgb(var(--muted))]">{detail}</span>)}
              {device.device_type === 'Switch' && <span className="rounded-lg bg-nord-8/12 px-2 py-1 text-[8px] font-extrabold text-nord-10">{ports} managed {ports === 1 ? 'port' : 'ports'}</span>}
              {!details.length && device.device_type !== 'Switch' && <span className="text-[9px] text-[rgb(var(--muted))]">No optional details</span>}
            </div>

            <div className="relative mt-3 flex items-center justify-between border-t pt-3">
              <span className={`flex items-center gap-1.5 text-[9px] font-bold ${device.is_dashboard_visible ? 'status-online-text' : 'text-[rgb(var(--muted))]'}`}>
                {device.is_dashboard_visible ? <Eye size={13} /> : <EyeOff size={13} />}{device.is_dashboard_visible ? 'Shown on Dashboard' : 'Hidden from Dashboard'}
              </span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(device)} aria-label={`Edit ${titleFor(device)}`} title="Edit device"><Pencil size={14} /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-nord-11" onClick={() => onDelete(device)} aria-label={`Delete ${titleFor(device)}`} title="Delete device"><Trash2 size={14} /></Button>
              </div>
            </div>
          </motion.article>
        )
      })}
    </div>
  )
}
