'use client'

import { useEffect, useState } from 'react'
import { Building2, Cpu, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import BranchForm from '@/components/devices/BranchForm'
import DeviceForm from '@/components/devices/DeviceForm'
import BranchList from '@/components/devices/BranchList'
import DeviceList from '@/components/devices/DeviceList'
import { Button, Card, Dialog, Tabs, TabsContent } from '@/components/ui'
import { getApi } from '@/lib/api'

export default function DevicesPage() {
  const [tab, setTab] = useState('branches')
  const [branches, setBranches] = useState([])
  const [devices, setDevices] = useState([])
  const [dialog, setDialog] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => { try { const [b, d] = await Promise.all([getApi().branches.list(), getApi().devices.list()]); setBranches(b); setDevices(d) } catch (error) { toast.error(error.message) } }
  useEffect(() => { load() }, [])

  const save = async (data) => {
    setSaving(true)
    try {
      if (dialog.type === 'branch') await getApi().branches.save({ ...data, id: dialog.value?.id })
      else await getApi().devices.save({ ...data, id: dialog.value?.id })
      toast.success(dialog.value ? 'Changes saved' : `${dialog.type === 'branch' ? 'Branch' : 'Device'} added`)
      setDialog(null); await load()
    } catch (error) { toast.error(error.message) } finally { setSaving(false) }
  }
  const remove = async (type, value) => {
    const warning = type === 'branch' ? `Delete ${value.name} and all of its devices?` : `Delete ${value.name || value.ip}?`
    if (!window.confirm(warning)) return
    try { await getApi()[type === 'branch' ? 'branches' : 'devices'].remove(value.id); toast.success('Deleted successfully'); await load() } catch (error) { toast.error(error.message) }
  }
  const openAdd = () => setDialog({ type: tab === 'branches' ? 'branch' : 'device', value: null })

  return <AppShell><div className="mx-auto max-w-[1600px] space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="page-title">Infrastructure directory</h1><p className="page-subtitle">Maintain branches, contacts, network endpoints, and dashboard visibility.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={load}><RefreshCw size={16} />Refresh</Button><Button onClick={openAdd}><Plus size={16} />Add {tab === 'branches' ? 'branch' : 'device'}</Button></div></div>
    <Card className="p-5"><Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'branches', label: `Branches (${branches.length})`, icon: <Building2 size={16} /> }, { value: 'devices', label: `Devices (${devices.length})`, icon: <Cpu size={16} /> }]}>
      <TabsContent value="branches"><BranchList branches={branches} onEdit={(value) => setDialog({ type: 'branch', value })} onDelete={(value) => remove('branch', value)} onAdd={() => setDialog({ type: 'branch', value: null })} /></TabsContent>
      <TabsContent value="devices"><DeviceList devices={devices} branches={branches} onEdit={(value) => setDialog({ type: 'device', value })} onDelete={(value) => remove('device', value)} onAdd={() => setDialog({ type: 'device', value: null })} /></TabsContent>
    </Tabs></Card>
    <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)} title={`${dialog?.value ? 'Edit' : 'Add'} ${dialog?.type || ''}`} description={dialog?.type === 'branch' ? 'Branch codes must be unique.' : 'Fields adapt automatically to the selected device type.'}>
      {dialog?.type === 'branch' ? <BranchForm value={dialog.value} onSubmit={save} saving={saving} /> : dialog?.type === 'device' ? <DeviceForm value={dialog.value} branches={branches} onSubmit={save} saving={saving} /> : null}
    </Dialog>
  </div></AppShell>
}
