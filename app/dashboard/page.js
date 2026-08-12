'use client'

import { useState } from 'react'
import { Building2, CircleCheck, TriangleAlert, CircleX, Clock3, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import BranchCard from '@/components/dashboard/BranchCard'
import { Skeleton, EmptyState } from '@/components/ui'
import { useDevicesStore } from '@/stores/devices.store'

const BRANCHES_PER_PAGE = 4

const statMeta = [
  { key: 'offline', title: 'Offline', icon: CircleX, color: 'from-nord-11 to-[#944b54]' },
  { key: 'warning', title: 'Warnings', icon: TriangleAlert, color: 'from-nord-13 to-nord-12' },
  { key: 'online', title: 'Online devices', icon: CircleCheck, color: 'from-nord-14 to-[#7fa46a]' },
  { key: 'branches', title: 'Total branches', icon: Building2, color: 'from-nord-8 to-nord-10' }
]

export default function DashboardPage() {
  const { branches, devices, generatedAt } = useDevicesStore()
  const [page, setPage] = useState(1)
  const visible = devices.filter((device) => device.is_dashboard_visible)
  const stats = {
    branches: branches.length,
    online: visible.filter((device) => device.status === 'online').length,
    warning: visible.filter((device) => device.status === 'warning').length,
    offline: visible.filter((device) => device.status === 'offline').length
  }
  const pageCount = Math.max(1, Math.ceil(branches.length / BRANCHES_PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const pageBranches = branches.slice((currentPage - 1) * BRANCHES_PER_PAGE, currentPage * BRANCHES_PER_PAGE)

  return (
    <AppShell compact>
      <div className="mx-auto max-w-[1920px] space-y-3 text-[13px]">
        <div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="mr-1 text-xl font-extrabold tracking-tight">Network at a glance</h1>

            <div className="flex flex-wrap items-center gap-1.5" aria-label="Network summary">
              {statMeta.map((stat, index) => {
                const Icon = stat.icon
                return (
                  <motion.div
                    key={stat.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.035 }}
                    whileHover={{ y: -1 }}
                    className="relative flex h-8 min-w-[88px] items-center gap-1.5 overflow-hidden rounded-xl border bg-[rgb(var(--surface)/.78)] py-1 pl-2 pr-2.5 shadow-sm"
                  >
                    <span className={`absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b ${stat.color}`} />
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md bg-gradient-to-br ${stat.color} text-white`}>
                      <Icon size={11} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[7px] font-extrabold uppercase leading-2.5 tracking-[0.08em] text-[rgb(var(--muted))]">{stat.title}</span>
                      <span className="block text-[13px] font-black leading-3.5 tabular-nums">{branches.length ? stats[stat.key] : '—'}</span>
                    </span>
                  </motion.div>
                )
              })}
            </div>

            <div className="ml-auto flex items-center gap-1.5 text-[9px] font-semibold text-[rgb(var(--muted))]">
              <Clock3 size={11} />
              {generatedAt ? `Updated ${new Date(generatedAt).toLocaleTimeString()}` : 'Connecting to monitor…'}
            </div>
          </div>
          <p className="mt-1 text-[10px] text-[rgb(var(--muted))]">Live health, gateway latency, and priority systems across every store.</p>
        </div>

        {!generatedAt ? (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-[620px]" />)}
          </div>
        ) : branches.length ? (
          <>
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid items-start gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
            >
              {pageBranches.map((branch) => <BranchCard key={branch.id} branch={branch} devices={devices} />)}
            </motion.div>

            {pageCount > 1 && (
              <nav className="flex items-center justify-center gap-2 pt-1" aria-label="Dashboard branch pages">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="grid h-7 w-7 place-items-center rounded-lg border bg-[rgb(var(--surface)/.55)] text-[rgb(var(--muted))] transition hover:text-[rgb(var(--text))] disabled:pointer-events-none disabled:opacity-35"
                  aria-label="Previous four branches"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="min-w-20 text-center text-[9px] font-semibold text-[rgb(var(--muted))]">Page {currentPage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage === pageCount}
                  className="grid h-7 w-7 place-items-center rounded-lg border bg-[rgb(var(--surface)/.55)] text-[rgb(var(--muted))] transition hover:text-[rgb(var(--text))] disabled:pointer-events-none disabled:opacity-35"
                  aria-label="Next four branches"
                >
                  <ChevronRight size={14} />
                </button>
              </nav>
            )}
          </>
        ) : (
          <EmptyState icon={<Building2 />} title="No branches yet" description="Create the first branch, then add its network devices." />
        )}
      </div>
    </AppShell>
  )
}
