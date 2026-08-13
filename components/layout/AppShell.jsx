'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { getApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useDevicesStore } from '@/stores/devices.store'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppShell({ children, compact = false }) {
  const router = useRouter()
  const { user, hydrated, logout } = useAuthStore()
  const setSnapshot = useDevicesStore((s) => s.setSnapshot)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (hydrated && !user) router.replace('/login')
    if (hydrated && user) {
      getApi().auth.status().then(({ authenticated }) => {
        if (!authenticated) { logout(); router.replace('/login') }
      }).catch(() => { logout(); router.replace('/login') })
    }
  }, [hydrated, user, logout, router])

  useEffect(() => {
    if (!user) return
    let unsubscribe = () => {}
    getApi().monitor.snapshot().then(setSnapshot).catch(() => {})
    unsubscribe = getApi().monitor.subscribe(setSnapshot)
    return () => unsubscribe?.()
  }, [user, setSnapshot])

  const onLogout = async () => {
    await getApi().auth.logout().catch(() => {})
    logout()
    router.replace('/login')
  }

  if (!hydrated || !user) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[rgb(var(--primary)/.25)] border-t-[rgb(var(--primary))]" /></div>

  return <div className="min-h-[100dvh]">
    <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} onLogout={onLogout} />
    <Header collapsed={collapsed} user={user} />
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`min-h-[100dvh] transition-[margin] ${compact ? 'px-3 pb-20 pt-[68px] md:px-4 md:pb-4' : 'px-3 pb-20 pt-[72px] md:px-5 md:pb-6'} ${collapsed ? 'md:ml-[72px]' : 'md:ml-56'}`}>{children}</motion.main>
  </div>
}
