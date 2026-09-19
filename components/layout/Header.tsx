'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import GlobalSearch from './GlobalSearch'
import VPNButton from './VPNButton'
import NotificationCenter from './NotificationCenter'
import { getApi } from '@/lib/api'
import { usePageHeaderStore } from '@/stores/page-header.store'

export default function Header({ user }: any) {
  const [isElectronEnv, setIsElectronEnv] = useState(true)
  const { title, subtitle, actions } = usePageHeaderStore()
  useEffect(() => {
    try {
      const api = getApi()
      setIsElectronEnv(api?.platform === 'electron')
    } catch {
      setIsElectronEnv(false)
    }
  }, [])

  return (
    <header className="app-header drag-region fixed right-0 top-0 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b bg-[rgb(var(--canvas)/.88)] px-3.5 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-5">
      {/* Left: page header - fixed like main header */}
      <div className="no-drag flex min-w-0 flex-1 items-center gap-3">
        {title ? (
          <div className="min-w-0 flex-1">
            <h1 className="app-header-title truncate text-sm font-black tracking-tight md:text-[15px]">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden truncate text-2xs text-[rgb(var(--muted))] md:block">{subtitle}</p>
            )}
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        {actions && <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div>}
      </div>

      {/* Right: global tools - always on right side */}
      <div className="no-drag flex shrink-0 items-center gap-2.5 pl-3">
        <GlobalSearch />
        {isElectronEnv && <VPNButton />}
        <NotificationCenter />
        <div className="hidden items-center gap-2 border-l pl-3 sm:flex">
          <motion.div
            whileHover={{ y: -2, rotate: -3, scale: 1.04 }}
            className="grid h-9 w-9 place-items-center rounded-xl bg-[rgb(var(--primary-strong))] text-xs font-extrabold text-white shadow-md shadow-black/10"
          >
            {user?.username?.slice(0, 2).toUpperCase() || 'AD'}
          </motion.div>
          <div className="hidden lg:block">
            <p className="text-xs font-bold tracking-[0.025em]">{user?.username || 'Admin'}</p>
            <p className="text-xs uppercase tracking-wider text-[rgb(var(--muted))]">Administrator</p>
          </div>
        </div>
      </div>
    </header>
  )
}
