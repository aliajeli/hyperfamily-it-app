'use client'

import { motion } from 'framer-motion'
import GlobalSearch from './GlobalSearch'
import VPNButton from './VPNButton'
import NotificationCenter from './NotificationCenter'

// The header no longer repeats the page title — every page renders its own
// compact heading, so the strip is purely global tools (search, VPN state,
// notifications, account). This frees a full title row on every screen.
export default function Header({ user }) {
  return (
    <header className="app-header drag-region fixed right-0 top-0 flex h-14 items-center justify-end border-b bg-[rgb(var(--canvas)/.76)] px-3.5 backdrop-blur-xl md:px-5">
      <div className="no-drag flex items-center gap-2.5">
        <GlobalSearch />
        <VPNButton />
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
