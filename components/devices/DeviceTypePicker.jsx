'use client'

import { motion } from 'framer-motion'
import { CreditCard, HardDrive, Monitor, Network, Router, Scale, Server, ShoppingCart, Video, Wifi } from 'lucide-react'
import { DEVICE_TYPES, DEVICE_TYPE_DETAILS } from '@/lib/constants'

const icons = {
  Router,
  Switch: Network,
  iLO: HardDrive,
  Server,
  NVR: Video,
  AccessPoint: Wifi,
  Scale,
  Client: Monitor,
  Checkout: ShoppingCart,
  POS: CreditCard
}

const tones = {
  Router: 'bg-nord-8/16 text-nord-10',
  Switch: 'bg-nord-9/16 text-nord-10',
  iLO: 'bg-nord-15/15 text-nord-15',
  Server: 'bg-nord-10/14 text-nord-10',
  NVR: 'bg-nord-11/12 text-nord-11',
  AccessPoint: 'bg-nord-14/16 status-online-text',
  Scale: 'bg-nord-13/18 status-warning-text',
  Client: 'bg-nord-7/18 text-nord-10',
  Checkout: 'bg-nord-12/15 text-nord-12',
  POS: 'bg-[rgb(var(--primary)/.13)] text-[rgb(var(--primary))]'
}

export default function DeviceTypePicker({ branch, onSelect }) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border bg-[rgb(var(--canvas)/.55)] p-4">
        <div className="min-w-0">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[rgb(var(--muted))]">Add equipment to</p>
          <p className="mt-1 truncate text-sm font-black">{branch.name} <span className="font-mono text-[10px] text-[rgb(var(--muted))]">· {branch.code}</span></p>
        </div>
        <span className="rounded-full border bg-[rgb(var(--surface)/.72)] px-3 py-1.5 text-[9px] font-extrabold text-[rgb(var(--muted))]">Choose one type</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEVICE_TYPES.map((type, index) => {
          const Icon = icons[type]
          const detail = DEVICE_TYPE_DETAILS[type]
          return (
            <motion.button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.025 }}
              whileHover={{ y: -4, scale: 1.012 }}
              whileTap={{ scale: 0.98 }}
              className="device-type-option group relative overflow-hidden rounded-2xl border bg-[rgb(var(--surface)/.7)] p-4 text-left shadow-sm transition-colors hover:border-[rgb(var(--primary)/.34)] hover:bg-[rgb(var(--surface))]"
            >
              <span aria-hidden="true" className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[rgb(var(--primary)/.07)] blur-2xl transition-transform duration-500 group-hover:scale-150" />
              <span className={`relative grid h-11 w-11 place-items-center rounded-2xl ${tones[type]}`}><Icon size={20} /></span>
              <span className="relative mt-3 block text-sm font-black tracking-[0.025em]">{detail.label}</span>
              <span className="relative mt-1 block min-h-8 text-[10px] leading-4 text-[rgb(var(--muted))]">{detail.description}</span>
              <span className="relative mt-3 inline-flex text-[9px] font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--primary))] transition-transform group-hover:translate-x-1">Select device →</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
