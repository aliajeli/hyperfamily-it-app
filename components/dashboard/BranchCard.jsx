'use client'

import { motion } from 'framer-motion'
import { MapPin, Router, Activity, Users } from 'lucide-react'
import { Badge, EmptyState } from '@/components/ui'
import PingChart from './PingChart'
import DeviceCard from './DeviceCard'

export default function BranchCard({ branch, devices }) {
  const visible = devices.filter((d) => d.branch_id === branch.id && d.is_dashboard_visible)
  const router = visible.find((d) => d.device_type === 'Router')
  const online = visible.filter((d) => d.status === 'online').length
  return <motion.section layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.002 }} className="panel overflow-hidden">
    <div className="flex flex-col justify-between gap-4 border-b p-5 lg:flex-row lg:items-center">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[rgb(var(--primary)/.11)] text-[rgb(var(--primary))]"><MapPin size={20} /></div><div><div className="flex items-center gap-2"><h2 className="text-lg font-extrabold tracking-tight">{branch.name}</h2><span className="rounded-md bg-[rgb(var(--border)/.6)] px-2 py-0.5 font-mono text-[9px] font-bold">{branch.code}</span></div><p className="mt-0.5 flex items-center gap-3 text-[10px] text-[rgb(var(--muted))]"><span className="flex items-center gap-1"><Activity size={11} /> {online}/{visible.length} healthy</span><span className="flex items-center gap-1"><Users size={11} /> {branch.manager_name || 'No manager assigned'}</span></p></div></div>
      <div className="flex items-center gap-3">{router ? <><Badge status={router.status}>{router.status}</Badge><div className="text-right"><p className="text-[9px] uppercase tracking-wider text-[rgb(var(--muted))]">Gateway latency</p><p className="text-sm font-extrabold">{router.ping_time == null ? 'No reply' : `${router.ping_time} ms`}</p></div></> : <Badge status="unknown">No router</Badge>}</div>
    </div>
    <div className="grid gap-5 p-5 xl:grid-cols-[minmax(280px,1fr)_2fr]">
      <div className="rounded-xl border bg-[rgb(var(--surface)/.35)] p-3"><div className="mb-1 flex items-center gap-2 px-1"><Router size={15} className="text-nord-8" /><p className="text-xs font-bold">Gateway response</p><span className="ml-auto text-[9px] text-[rgb(var(--muted))]">Last {router?.history?.length || 0} checks</span></div>{router ? <PingChart data={router.history} /> : <EmptyState icon={<Router size={18} />} title="Router not visible" description="Add a router to the dashboard to chart gateway latency." />}</div>
      <div>{visible.length ? <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{visible.map((device) => <DeviceCard key={device.id} device={device} />)}</div> : <EmptyState icon={<Activity size={20} />} title="No dashboard devices" description="Enable dashboard visibility for this branch's critical devices." />}</div>
    </div>
  </motion.section>
}
