'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Command, CornerDownLeft, Server, Building2, Compass, LoaderCircle } from 'lucide-react'
import { getApi } from '@/lib/api'

const PAGES = [
  { id: 'page-dashboard', kind: 'page', label: 'Operations overview', hint: 'Dashboard', href: '/dashboard' },
  {
    id: 'page-gateway',
    kind: 'page',
    label: 'Gateway monitor',
    hint: 'Dashboard',
    href: '/dashboard/gateway'
  },
  { id: 'page-devices', kind: 'page', label: 'Branches & devices', hint: 'Manage', href: '/devices' },
  { id: 'page-inventory', kind: 'page', label: 'Asset inventory', hint: 'Manage', href: '/inventory' },
  { id: 'page-store-update', kind: 'page', label: 'Update Store App', hint: 'Tools', href: '/store-update' },
  { id: 'page-settings', kind: 'page', label: 'Application settings', hint: 'Configure', href: '/settings' },
  { id: 'page-about', kind: 'page', label: 'About & updates', hint: 'Help', href: '/about' }
]

const ICONS: any = { device: Server, branch: Building2, page: Compass }

export default function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>({ devices: [], branches: [] })
  const inputRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    setLoading(true)
    try {
      const api = getApi()
      const [devices, branches] = await Promise.all([api.devices.list(), api.branches.list()])
      setData({ devices: devices || [], branches: branches || [] })
      loadedRef.current = true
    } catch {
      setData({ devices: [], branches: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    setActive(0)
    const timer = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(timer)
  }, [open, load])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const branchName = (id: any) => data.branches.find((branch: any) => branch.id === id)?.name || ''

    const devices = data.devices.map((device: any) => ({
      id: `device-${device.id}`,
      kind: 'device',
      label: device.name || device.hostname || `${device.device_type} ${device.ip}`,
      hint: [device.device_type, device.ip, branchName(device.branch_id)].filter(Boolean).join(' · '),
      href: `/devices?device=${device.id}`,
      haystack: [
        device.name,
        device.hostname,
        device.ip,
        device.device_type,
        device.asset_code,
        device.serial_number,
        branchName(device.branch_id)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    }))

    const branches = data.branches.map((branch: any) => ({
      id: `branch-${branch.id}`,
      kind: 'branch',
      label: branch.name,
      hint: [branch.code, branch.warehouse_code ? `WH ${branch.warehouse_code}` : null]
        .filter(Boolean)
        .join(' · '),
      href: `/devices?branch=${branch.id}`,
      haystack: [branch.name, branch.code, branch.warehouse_code].filter(Boolean).join(' ').toLowerCase()
    }))

    const pages = PAGES.map((page) => ({ ...page, haystack: `${page.label} ${page.hint}`.toLowerCase() }))
    const all = [...pages, ...branches, ...devices]
    if (!needle) return all.filter((item) => item.kind === 'page')
    return all.filter((item) => item.haystack.includes(needle)).slice(0, 24)
  }, [query, data])

  const go = (item: any) => {
    if (!item) return
    setOpen(false)
    setQuery('')
    router.push(item.href)
  }

  const onKeyDown = (event: any) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % Math.max(results.length, 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + results.length) % Math.max(results.length, 1))
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      go(results[active])
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
        className="group hidden h-9 w-56 items-center gap-2 rounded-xl border bg-[rgb(var(--surface)/.58)] px-3 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgb(var(--primary)/.35)] hover:bg-[rgb(var(--surface)/.8)] hover:shadow-md xl:flex"
      >
        <Search
          size={16}
          className="text-[rgb(var(--muted))] transition-transform duration-300 group-hover:scale-110 group-hover:text-[rgb(var(--primary))]"
        />
        <span className="w-full text-xs text-[rgb(var(--muted))]">Search devices…</span>
        <span className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-[rgb(var(--muted))]">
          <Command size={9} />K
        </span>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
        className="grid h-10 w-10 place-items-center rounded-xl border bg-[rgb(var(--surface)/.7)] text-[rgb(var(--muted))] shadow-sm transition hover:text-[rgb(var(--text))] md:h-9 md:w-9 xl:hidden"
      >
        <Search size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="global-search-overlay no-drag fixed inset-0 z-[100] flex items-start justify-center bg-black/55 p-2 pt-[calc(4rem+env(safe-area-inset-top))] backdrop-blur-md md:p-4 md:pt-[12vh]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false)
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex max-h-[85vh] w-[calc(100%-0.5rem)] flex-col overflow-hidden rounded-2xl border bg-[rgb(var(--surface))] shadow-2xl md:w-full md:max-w-xl"
            >
              <div className="flex items-center gap-2.5 border-b px-3.5">
                <Search size={18} className="shrink-0 text-[rgb(var(--muted))]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setActive(0)
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Search devices, branches, or pages…"
                  className="h-14 w-full bg-transparent text-[15px] font-medium outline-none placeholder:text-[rgb(var(--muted))] md:h-12 md:text-sm"
                  enterKeyHint="search"
                />
                {loading && (
                  <LoaderCircle size={16} className="shrink-0 animate-spin text-[rgb(var(--muted))]" />
                )}
                <kbd className="hidden shrink-0 rounded-md border px-1.5 py-0.5 text-xs text-[rgb(var(--muted))] md:block">
                  ESC
                </kbd>
              </div>

              <div className="max-h-[60vh] flex-1 overflow-y-auto p-2 md:max-h-80 md:p-1.5">
                {results.length ? (
                  results.map((item: any, index: number) => {
                    const Icon = ICONS[item.kind] || Compass
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition md:gap-2.5 md:px-3 md:py-2 ${index === active ? 'bg-[rgb(var(--primary)/.14)] text-[rgb(var(--text))]' : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.4)]'}`}
                      >
                        <Icon
                          size={18}
                          className={`shrink-0 ${index === active ? 'text-[rgb(var(--primary))]' : ''} md:size-[15px]`}
                        />
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm text-[rgb(var(--text))] md:text-xs">
                            {item.label}
                          </b>
                          {item.hint && (
                            <span className="block truncate text-xs md:text-xs">{item.hint}</span>
                          )}
                        </span>
                        {index === active && <CornerDownLeft size={14} className="shrink-0" />}
                      </button>
                    )
                  })
                ) : (
                  <p className="px-3 py-10 text-center text-sm text-[rgb(var(--muted))]">
                    No matches for &quot;{query}&quot;.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t bg-[rgb(var(--canvas)/.4)] px-3.5 py-2.5 text-2xs uppercase tracking-wider text-[rgb(var(--muted))] md:py-2">
                <span>↑ ↓ to navigate · ⏎ to open</span>
                <span>
                  {results.length} result{results.length === 1 ? '' : 's'}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
