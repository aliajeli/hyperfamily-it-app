'use client'

import { motion } from 'framer-motion'
import { Router, Network, Server, Video, Wifi, Scale, Monitor, ShoppingCart, CreditCard, Cpu } from 'lucide-react'
import DeviceActionsMenu from './DeviceActionsMenu'

const icons = { Router, Switch: Network, iLO: Cpu, Server, NVR: Video, AccessPoint: Wifi, Scale, Client: Monitor, Checkout: ShoppingCart, POS: CreditCard }
const statusClass = {
  online: 'bg-nord-14',
  warning: 'bg-nord-13',
  offline: 'bg-nord-11',
  unknown: 'bg-nord-3'
}

export default function DeviceCard({ device }) {
  const Icon = icons[device.device_type] || Cpu
  const ping = device.ping_time == null ? 'No reply' : `${device.ping_time} ms`

  return (
    <motion.div
      whileHover={{ y: -1, scale: 1.01 }}
      transition={{ duration: 0.15 }}
      className="group flex h-10 min-w-0 items-center gap-1 rounded-md border bg-[rgb(var(--surface)/.58)] px-1.5 shadow-sm transition-colors hover:border-[rgb(var(--primary)/.35)] hover:bg-[rgb(var(--surface)/.82)]"
      title={`${device.name || device.device_type} • ${device.ip}${device.port ? `:${device.port}` : ''} • ${device.status} • ${ping}`}
    >
      <div className="relative grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[rgb(var(--primary)/.1)] text-[rgb(var(--primary))]">
        <Icon size={11} strokeWidth={2.1} />
        <span className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-[rgb(var(--surface))] ${statusClass[device.status] || statusClass.unknown}`} />
      </div>

      <div className="min-w-0 flex-1 leading-none">
        <p className="truncate text-[8.5px] font-extrabold" title={device.name || device.device_type}>{device.name || device.device_type}</p>
        <p className="mt-1 truncate text-[7.5px] font-semibold text-[rgb(var(--muted))]">{ping}</p>
      </div>

      <DeviceActionsMenu device={device} />
    </motion.div>
  )
}
