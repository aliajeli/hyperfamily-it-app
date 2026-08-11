'use client'

import { motion } from 'framer-motion'
import { Router, Network, Server, Video, Wifi, Scale, Monitor, ShoppingCart, CreditCard, Cpu, MoreVertical } from 'lucide-react'
import { Badge } from '@/components/ui'
import DeviceContextMenu from './DeviceContextMenu'

const icons = { Router, Switch: Network, iLO: Cpu, Server, NVR: Video, AccessPoint: Wifi, Scale, Client: Monitor, Checkout: ShoppingCart, POS: CreditCard }

export default function DeviceCard({ device }) {
  const Icon = icons[device.device_type] || Cpu
  return <DeviceContextMenu device={device}><motion.div whileHover={{ y: -3, scale: 1.015 }} transition={{ duration: .18 }} className="group flex h-[104px] cursor-context-menu items-center gap-3 rounded-xl border bg-[rgb(var(--surface)/.58)] p-3 shadow-sm transition-shadow hover:shadow-lg">
    <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--primary)/.11)] text-[rgb(var(--primary))]"><Icon size={21} /><span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[rgb(var(--surface))] ${device.status === 'online' ? 'bg-nord-14' : device.status === 'warning' ? 'bg-nord-13' : 'bg-nord-11'} ${device.status === 'online' ? 'animate-pulse-ring' : ''}`} /></div>
    <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-1"><p className="truncate text-xs font-extrabold" title={device.name}>{device.name || device.device_type}</p><MoreVertical size={14} className="shrink-0 text-[rgb(var(--muted)/.5)]" /></div><p className="mt-1 truncate font-mono text-[10px] text-[rgb(var(--muted))]">{device.ip}{device.port ? `:${device.port}` : ''}</p><div className="mt-2 flex items-center justify-between"><Badge status={device.status}>{device.status}</Badge><span className="text-[10px] font-bold text-[rgb(var(--muted))]">{device.ping_time == null ? 'No reply' : `${device.ping_time} ms`}</span></div></div>
  </motion.div></DeviceContextMenu>
}
