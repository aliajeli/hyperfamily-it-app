'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Search, SlidersHorizontal, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import InventoryTable from '@/components/inventory/InventoryTable'
import { Button, Card, Input, Select, Skeleton } from '@/components/ui'
import { DEVICE_TYPES } from '@/lib/constants'
import { getApi } from '@/lib/api'

export default function InventoryPage() {
  const [devices, setDevices] = useState([])
  const [branches, setBranches] = useState([])
  const [filters, setFilters] = useState({ branch: 'all', type: 'all', query: '' })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { Promise.all([getApi().inventory.list(), getApi().branches.list()]).then(([d, b]) => { setDevices(d); setBranches(b) }).catch((e) => toast.error(e.message)).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => devices.filter((d) => (filters.branch === 'all' || String(d.branch_id) === filters.branch) && (filters.type === 'all' || d.device_type === filters.type) && (!filters.query || [d.name, d.ip, d.model, d.asset_code, d.hostname].some((v) => String(v || '').toLowerCase().includes(filters.query.toLowerCase())))), [devices, filters])
  const exportExcel = async () => { setExporting(true); try { const result = await getApi().inventory.export({ branch: filters.branch, type: filters.type, query: filters.query }); if (result?.path) toast.success(`Export saved to ${result.path}`) } catch (error) { toast.error(error.message) } finally { setExporting(false) } }

  return <AppShell><div className="mx-auto max-w-[1700px] space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="page-title">Asset inventory</h1><p className="page-subtitle">Filter hardware across stores and export an Excel-ready operational snapshot.</p></div><Button onClick={exportExcel} disabled={!filtered.length || exporting}><Download size={16} />{exporting ? 'Exporting…' : `Export ${filtered.length} to Excel`}</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-nord-8/15 text-nord-10"><Boxes size={19} /></div><div><p className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Total assets</p><b className="text-xl">{devices.length}</b></div></Card><Card className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-nord-14/15 text-[#66834e]"><SlidersHorizontal size={19} /></div><div><p className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Filtered results</p><b className="text-xl">{filtered.length}</b></div></Card><Card className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-nord-15/15 text-nord-15"><Download size={19} /></div><div><p className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Export format</p><b className="text-sm">Microsoft Excel .xlsx</b></div></Card></div>
    <Card className="overflow-hidden"><div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_220px]"><label className="relative"><Search size={16} className="absolute left-3.5 top-3.5 text-[rgb(var(--muted))]" /><Input className="pl-10" placeholder="Search IP, hostname, model, asset code…" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} /></label><Select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}><option value="all">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select><Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="all">All device types</option>{DEVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</Select></div>{loading ? <div className="space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div> : <InventoryTable devices={filtered} />}</Card>
  </div></AppShell>
}
