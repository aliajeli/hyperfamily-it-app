'use client'

import { Building2, CircleCheck, TriangleAlert, CircleX, Clock3 } from 'lucide-react'
import { motion } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import BranchCard from '@/components/dashboard/BranchCard'
import { Skeleton, EmptyState } from '@/components/ui'
import { useDevicesStore } from '@/stores/devices.store'

const statMeta = [
  { key: 'branches', title: 'Total branches', icon: Building2, color: 'from-nord-8 to-nord-10' },
  { key: 'online', title: 'Online devices', icon: CircleCheck, color: 'from-nord-14 to-[#7fa46a]' },
  { key: 'warning', title: 'Warnings', icon: TriangleAlert, color: 'from-nord-13 to-nord-12' },
  { key: 'offline', title: 'Offline', icon: CircleX, color: 'from-nord-11 to-[#944b54]' }
]

export default function DashboardPage() {
  const { branches, devices, generatedAt } = useDevicesStore()
  const visible = devices.filter((d) => d.is_dashboard_visible)
  const stats = { branches: branches.length, online: visible.filter((d) => d.status === 'online').length, warning: visible.filter((d) => d.status === 'warning').length, offline: visible.filter((d) => d.status === 'offline').length }

  return <AppShell><div className="mx-auto max-w-[1800px] space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="page-title">Network at a glance</h1><p className="page-subtitle">Live health, gateway latency, and priority systems across every store.</p></div><div className="flex items-center gap-2 text-[10px] font-semibold text-[rgb(var(--muted))]"><Clock3 size={13} /> {generatedAt ? `Updated ${new Date(generatedAt).toLocaleTimeString()}` : 'Connecting to monitor…'}</div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statMeta.map((stat, index) => { const Icon = stat.icon; return <motion.div key={stat.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} whileHover={{ y: -3 }} className="panel relative overflow-hidden p-4"><div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${stat.color}`} /><div className="flex items-center"><div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-lg`}><Icon size={20} /></div><div className="ml-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">{stat.title}</p><p className="mt-0.5 text-2xl font-black">{branches.length ? stats[stat.key] : '—'}</p></div><div className="ml-auto text-[9px] font-bold text-[rgb(var(--muted))]">LIVE</div></div></motion.div> })}</div>
    {!generatedAt ? <div className="space-y-4"><Skeleton className="h-80" /><Skeleton className="h-80" /></div> : branches.length ? <div className="space-y-5">{branches.map((branch) => <BranchCard key={branch.id} branch={branch} devices={devices} />)}</div> : <EmptyState icon={<Building2 />} title="No branches yet" description="Create the first branch, then add its network devices." />}
  </div></AppShell>
}
