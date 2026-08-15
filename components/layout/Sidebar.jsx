'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Network, Boxes, TerminalSquare, NotebookPen, Settings, Info, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import BrandMark from './BrandMark'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Branches & devices', icon: Network },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/terminal', label: 'Terminal', icon: TerminalSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/about', label: 'About', icon: Info }
]

export default function Sidebar({ collapsed, setCollapsed, onLogout }) {
  const pathname = usePathname()
  return (
    <>
    <aside className="app-rail glass fixed inset-y-0 left-0 hidden flex-col border-y-0 border-l-0 md:flex">
      <div className={cn('flex h-16 items-center gap-2.5 overflow-hidden border-b px-4', collapsed && 'justify-center px-2.5')}>
        <motion.div whileHover={{ rotate: -5, scale: 1.06 }} transition={{ type: 'spring', stiffness: 350 }}><BrandMark className="h-9 w-9 shrink-0" /></motion.div>
        <AnimatePresence initial={false}>
          {!collapsed && <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="min-w-0"><div className="truncate font-extrabold tracking-[0.025em]">HyperFamily</div><div className="truncate text-[10px] font-bold uppercase tracking-[.18em] text-[rgb(var(--muted))]">Branch Monitor</div></motion.div>}
        </AnimatePresence>
      </div>
      <nav className="flex-1 space-y-1 p-2.5 pt-4">
        {navItems.map((item, index) => {
          const active = pathname.startsWith(item.href)
          return <motion.div key={item.href} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.045 }} whileHover={{ x: collapsed ? 0 : 3 }}>
            <Link href={item.href} title={collapsed ? item.label : undefined} className={cn('group relative flex h-10 items-center gap-2.5 overflow-hidden rounded-xl px-3 text-[13px] font-semibold text-[rgb(var(--muted))] transition-all duration-300 hover:bg-[rgb(var(--border)/.45)] hover:text-[rgb(var(--text))] hover:shadow-sm', active && 'bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]')}>
              {active && <motion.span layoutId="nav-active" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[rgb(var(--primary))]" />}
              <item.icon size={20} className="shrink-0 transition-transform duration-300 group-hover:rotate-[-5deg] group-hover:scale-110" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          </motion.div>
        })}
      </nav>
      <div className="space-y-1 border-t p-3">
        <button onClick={() => setCollapsed(!collapsed)} className="group flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[rgb(var(--muted))] transition-all duration-300 hover:bg-[rgb(var(--border)/.45)] hover:text-[rgb(var(--text))]">{collapsed ? <PanelLeftOpen size={19} className="transition-transform group-hover:translate-x-0.5" /> : <><PanelLeftClose size={19} className="transition-transform group-hover:-translate-x-0.5" /><span>Collapse sidebar</span></>}</button>
        <button onClick={onLogout} className="group flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-nord-11 transition-all duration-300 hover:bg-nord-11/10"><LogOut size={19} className="transition-transform duration-300 group-hover:-translate-x-0.5 group-hover:rotate-[-6deg]" />{!collapsed && <span>Sign out</span>}</button>
      </div>
    </aside>

    <nav aria-label="Mobile navigation" className="glass fixed inset-x-2 bottom-2 z-40 grid grid-cols-6 gap-1 rounded-2xl p-1.5 shadow-xl md:hidden">
      {navItems.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} className={cn('grid h-11 place-items-center rounded-xl text-[rgb(var(--muted))] transition', active && 'bg-[rgb(var(--primary)/.13)] text-[rgb(var(--primary))]')}>
            <item.icon size={19} />
          </Link>
        )
      })}
      <button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out" className="grid h-11 place-items-center rounded-xl text-nord-11 transition hover:bg-nord-11/10"><LogOut size={19} /></button>
    </nav>
    </>
  )
}
