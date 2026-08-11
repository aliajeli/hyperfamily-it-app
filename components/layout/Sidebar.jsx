'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Network, Boxes, Settings, Info, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import BrandMark from './BrandMark'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Branches & devices', icon: Network },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/about', label: 'About', icon: Info }
]

export default function Sidebar({ collapsed, setCollapsed, onLogout }) {
  const pathname = usePathname()
  return (
    <motion.aside animate={{ width: collapsed ? 84 : 256 }} transition={{ duration: 0.25, ease: 'easeInOut' }} className="glass fixed inset-y-0 left-0 z-30 hidden flex-col border-y-0 border-l-0 md:flex">
      <div className={cn('flex h-20 items-center gap-3 border-b px-5', collapsed && 'justify-center px-3')}>
        <BrandMark className="h-11 w-11 shrink-0" />
        {!collapsed && <div className="min-w-0"><div className="truncate font-extrabold tracking-tight">HyperFamily</div><div className="truncate text-[10px] font-bold uppercase tracking-[.18em] text-[rgb(var(--muted))]">Branch Monitor</div></div>}
      </div>
      <nav className="flex-1 space-y-1.5 p-3 pt-6">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={cn('relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.45)] hover:text-[rgb(var(--text))]', active && 'bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]')}>
            {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[rgb(var(--primary))]" />}
            <item.icon size={20} className="shrink-0" />{!collapsed && <span>{item.label}</span>}
          </Link>
        })}
      </nav>
      <div className="space-y-1 border-t p-3">
        <button onClick={() => setCollapsed(!collapsed)} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.45)]">{collapsed ? <PanelLeftOpen size={19} /> : <><PanelLeftClose size={19} /><span>Collapse sidebar</span></>}</button>
        <button onClick={onLogout} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-nord-11 hover:bg-nord-11/10"><LogOut size={19} />{!collapsed && <span>Sign out</span>}</button>
      </div>
    </motion.aside>
  )
}
