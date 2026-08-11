'use client'

import { usePathname } from 'next/navigation'
import { Search, Bell, Command } from 'lucide-react'
import VPNButton from './VPNButton'

const titles = { dashboard: 'Operations overview', devices: 'Branches & devices', inventory: 'Asset inventory', settings: 'Application settings', about: 'About this product' }

export default function Header({ collapsed, user }) {
  const pathname = usePathname()
  const key = pathname.split('/')[1] || 'dashboard'
  return <header className={`drag-region fixed right-0 top-0 z-20 flex h-16 items-center justify-between border-b bg-[rgb(var(--canvas)/.76)] px-4 backdrop-blur-xl transition-all md:px-6 ${collapsed ? 'md:left-[84px]' : 'md:left-64'}`}>
    <div><h1 className="text-sm font-bold md:text-base">{titles[key] || 'HyperFamily'}</h1><p className="hidden text-[10px] uppercase tracking-widest text-[rgb(var(--muted))] sm:block">Infrastructure control center</p></div>
    <div className="no-drag flex items-center gap-2.5">
      <div className="hidden h-10 w-64 items-center gap-2 rounded-xl border bg-[rgb(var(--surface)/.58)] px-3 xl:flex"><Search size={16} className="text-[rgb(var(--muted))]" /><input aria-label="Global search" placeholder="Search devices…" className="w-full bg-transparent text-xs outline-none" /><span className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] text-[rgb(var(--muted))]"><Command size={9} />K</span></div>
      <VPNButton />
      <button aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl border bg-[rgb(var(--surface)/.58)] text-[rgb(var(--muted))]"><Bell size={17} /><span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-nord-11" /></button>
      <div className="hidden items-center gap-2 border-l pl-3 sm:flex"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[rgb(var(--primary))] text-xs font-extrabold text-white">{user?.username?.slice(0, 2).toUpperCase() || 'AD'}</div><div className="hidden lg:block"><p className="text-xs font-bold">{user?.username || 'Admin'}</p><p className="text-[9px] uppercase tracking-wider text-[rgb(var(--muted))]">Administrator</p></div></div>
    </div>
  </header>
}
