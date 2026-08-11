'use client'

import { motion } from 'framer-motion'
import { MapPin, Router, Activity } from 'lucide-react'
import PingChart from './PingChart'
import DeviceCard from './DeviceCard'
import DeviceActionsMenu from './DeviceActionsMenu'

const statusClass = {
  online: 'bg-nord-14',
  warning: 'bg-nord-13',
  offline: 'bg-nord-11',
  unknown: 'bg-nord-3'
}

export default function BranchCard({ branch, devices }) {
  const visible = devices.filter((device) => device.branch_id === branch.id && device.is_dashboard_visible)
  const router = visible.find((device) => device.device_type === 'Router')
  const displayDevices = visible.filter((device) => device.device_type !== 'Router')
  const online = displayDevices.filter((device) => device.status === 'online').length
  const routerStatus = router?.status || 'unknown'

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel min-w-0 overflow-hidden"
      aria-label={`${branch.name} branch status`}
    >
      <div className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-2.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[rgb(var(--primary)/.11)] text-[rgb(var(--primary))]">
            <MapPin size={14} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-[12px] font-extrabold tracking-tight" title={branch.name}>{branch.name}</h2>
              <span className="shrink-0 rounded bg-[rgb(var(--border)/.55)] px-1.5 py-0.5 font-mono text-[7px] font-bold">{branch.code}</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[8px] text-[rgb(var(--muted))]" title={branch.manager_name || 'No manager assigned'}>
              <Activity size={9} /> {online}/{displayDevices.length} devices online
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 sm:block">
          <div className="mb-0.5 flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">
            <Router size={9} className="text-nord-8" /> Gateway history
          </div>
          {router ? <PingChart data={router.history} compact /> : <div className="grid h-7 place-items-center rounded-md border border-dashed text-[7px] text-[rgb(var(--muted))]">No router</div>}
        </div>

        <div className="flex min-w-[62px] items-center justify-end gap-1.5 text-right">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusClass[routerStatus]}`} />
          <div>
            <p className="text-[7px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">Gateway</p>
            <p className="text-[10px] font-extrabold leading-3">{router?.ping_time == null ? 'No reply' : `${router.ping_time} ms`}</p>
          </div>
          {router && <DeviceActionsMenu device={router} />}
        </div>
      </div>

      <div className="p-2">
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Monitored devices</p>
          <span className="text-[8px] font-semibold text-[rgb(var(--muted))]">{displayDevices.length} devices</span>
        </div>

        {displayDevices.length ? (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayDevices.map((device) => <DeviceCard key={device.id} device={device} />)}
          </div>
        ) : (
          <div className="grid h-10 place-items-center rounded-lg border border-dashed text-[9px] text-[rgb(var(--muted))]">
            No dashboard devices for this branch
          </div>
        )}
      </div>
    </motion.section>
  )
}
