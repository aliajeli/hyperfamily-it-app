'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Link as LinkIcon, MapPin, Phone, Plus, RefreshCw, Route, Server } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import BranchForm from '@/components/devices/BranchForm'
import BranchList from '@/components/devices/BranchList'
import DeviceForm from '@/components/devices/DeviceForm'
import DeviceList from '@/components/devices/DeviceList'
import DeviceTypePicker from '@/components/devices/DeviceTypePicker'
import { Button, Card, Dialog, Skeleton } from '@/components/ui'
import { getApi } from '@/lib/api'

export default function DevicesPage() {
  const [branches, setBranches] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async (preferredBranchId = null) => {
    try {
      const [branchRows, deviceRows] = await Promise.all([getApi().branches.list(), getApi().devices.list()])
      setBranches(branchRows)
      setDevices(deviceRows)
      setSelectedBranchId((current) => {
        const desired = preferredBranchId || current
        if (desired && branchRows.some((branch) => branch.id === desired)) return desired
        return branchRows[0]?.id || null
      })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || null
  const branchDevices = useMemo(() => devices.filter((device) => device.branch_id === selectedBranchId), [devices, selectedBranchId])
  const deviceCounts = useMemo(() => devices.reduce((counts, device) => ({ ...counts, [device.branch_id]: (counts[device.branch_id] || 0) + 1 }), {}), [devices])
  const monitoredCount = branchDevices.filter((device) => device.is_dashboard_visible).length

  const save = async (data) => {
    if (!dialog) return
    setSaving(true)
    try {
      if (dialog.kind === 'branch') {
        const result = await getApi().branches.save({ ...data, id: dialog.value?.id })
        toast.success(dialog.value ? 'Branch changes saved' : 'Branch created')
        setDialog(null)
        await load(result.id)
      } else if (dialog.kind === 'device' && selectedBranch) {
        const payload = {
          ...data,
          id: dialog.value?.id,
          branch_id: selectedBranch.id,
          device_type: dialog.type || dialog.value?.device_type
        }
        await getApi().devices.save(payload)
        toast.success(dialog.value ? 'Device changes saved' : `${dialog.type} added to ${selectedBranch.name}`)
        setDialog(null)
        await load(selectedBranch.id)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const removeBranch = async (branch) => {
    if (!window.confirm(`Delete ${branch.name} and all of its devices?`)) return
    try {
      await getApi().branches.remove(branch.id)
      toast.success('Branch deleted')
      await load()
    } catch (error) { toast.error(error.message) }
  }

  const removeDevice = async (device) => {
    if (!window.confirm(`Delete ${device.name || device.hostname || device.device_type} (${device.ip})?`)) return
    try {
      await getApi().devices.remove(device.id)
      toast.success('Device deleted')
      await load(selectedBranchId)
    } catch (error) { toast.error(error.message) }
  }

  const openAddDevice = () => {
    if (!selectedBranch) return
    setDialog({ kind: 'device', step: 'type', type: null, value: null })
  }

  const openEditDevice = (device) => {
    setSelectedBranchId(device.branch_id)
    setDialog({ kind: 'device', step: 'form', type: device.device_type, value: device })
  }

  const dialogTitle = dialog?.kind === 'branch'
    ? `${dialog.value ? 'Edit' : 'Add'} branch`
    : dialog?.step === 'type'
      ? 'Choose a device type'
      : `${dialog?.value ? 'Edit' : 'Add'} ${dialog?.type || 'device'}`

  const dialogDescription = dialog?.kind === 'branch'
    ? 'Define branch identity, network links, and responsible contacts.'
    : dialog?.step === 'type'
      ? 'Device cards reveal a form containing only the fields relevant to that equipment.'
      : 'Review the equipment information and save it to the selected branch.'

  return (
    <AppShell>
      <div className="mx-auto max-w-[1700px] space-y-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="page-title">Branches &amp; Devices</h1>
            <p className="page-subtitle">Select or create a branch first, then add equipment with a device-specific form.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => load(selectedBranchId)} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
            <Button onClick={() => setDialog({ kind: 'branch', value: null })}><Plus size={16} />Add branch</Button>
          </div>
        </div>

        <Card className="overflow-hidden p-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className={`directory-step flex items-center gap-3 rounded-2xl border px-4 py-3 ${selectedBranch ? 'border-nord-14/35 bg-nord-14/9' : 'border-[rgb(var(--primary)/.3)] bg-[rgb(var(--primary)/.08)]'}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${selectedBranch ? 'bg-nord-14/18 status-online-text' : 'bg-[rgb(var(--primary))] text-white'}`}>1</span>
              <span><b className="block text-xs">Choose a branch</b><small className="text-[9px] text-[rgb(var(--muted))]">Create a new location or select an existing one</small></span>
            </div>
            <div className={`directory-step flex items-center gap-3 rounded-2xl border px-4 py-3 ${selectedBranch ? 'border-[rgb(var(--primary)/.3)] bg-[rgb(var(--primary)/.08)]' : 'bg-[rgb(var(--canvas)/.45)] opacity-60'}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${selectedBranch ? 'bg-[rgb(var(--primary))] text-white' : 'bg-[rgb(var(--border))] text-[rgb(var(--muted))]'}`}>2</span>
              <span><b className="block text-xs">Manage devices</b><small className="text-[9px] text-[rgb(var(--muted))]">Choose a device card and enter its relevant details</small></span>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"><Skeleton className="h-[620px]" /><Skeleton className="h-[620px]" /></div>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Card className="overflow-hidden xl:sticky xl:top-24">
              <div className="flex items-center justify-between border-b px-4 py-3.5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-black"><Building2 size={16} className="text-[rgb(var(--primary))]" />Branches</h2>
                  <p className="mt-0.5 text-[9px] text-[rgb(var(--muted))]">{branches.length} configured locations</p>
                </div>
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => setDialog({ kind: 'branch', value: null })} aria-label="Add branch"><Plus size={14} /></Button>
              </div>
              <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-3">
                <BranchList
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  deviceCounts={deviceCounts}
                  onSelect={(branch) => setSelectedBranchId(branch.id)}
                  onEdit={(branch) => setDialog({ kind: 'branch', value: branch })}
                  onDelete={removeBranch}
                  onAdd={() => setDialog({ kind: 'branch', value: null })}
                />
              </div>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              {selectedBranch ? (
                <>
                  <div className="relative overflow-hidden border-b bg-gradient-to-br from-[rgb(var(--primary)/.1)] via-[rgb(var(--surface)/.64)] to-[rgb(var(--secondary)/.08)] p-5">
                    <span aria-hidden="true" className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[rgb(var(--primary)/.1)] blur-3xl" />
                    <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--primary))] text-white shadow-lg shadow-black/10"><MapPin size={21} /></div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Selected branch</p>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                            <h2 className="truncate text-xl font-black tracking-[0.025em]">{selectedBranch.name}</h2>
                            <span className="rounded-lg bg-[rgb(var(--surface)/.75)] px-2 py-1 font-mono text-[9px] font-black shadow-sm">{selectedBranch.code}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 text-[9px] sm:grid-cols-2 lg:min-w-[420px]">
                        <div className="rounded-xl border bg-[rgb(var(--surface)/.65)] p-2.5"><p className="flex items-center gap-1.5 font-extrabold"><LinkIcon size={11} className="text-nord-10" />Network links</p><p className="mt-1 truncate text-[rgb(var(--muted))]">{selectedBranch.link1 || 'No primary link'}{selectedBranch.ip_link1 ? ` · ${selectedBranch.ip_link1}` : ''}</p>{selectedBranch.link2 && <p className="mt-0.5 truncate text-[rgb(var(--muted))]">{selectedBranch.link2}{selectedBranch.ip_link2 ? ` · ${selectedBranch.ip_link2}` : ''}</p>}</div>
                        <div className="rounded-xl border bg-[rgb(var(--surface)/.65)] p-2.5"><p className="flex items-center gap-1.5 font-extrabold"><Phone size={11} className="text-nord-15" />Branch contacts</p><p className="mt-1 truncate text-[rgb(var(--muted))]">{selectedBranch.manager_name || 'No manager'}{selectedBranch.manager_tell ? ` · ${selectedBranch.manager_tell}` : ''}</p>{selectedBranch.deputy_name && <p className="mt-0.5 truncate text-[rgb(var(--muted))]">{selectedBranch.deputy_name}{selectedBranch.deputy_tell ? ` · ${selectedBranch.deputy_tell}` : ''}</p>}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-black"><Server size={16} className="text-[rgb(var(--primary))]" />Branch equipment</h2>
                      <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">{branchDevices.length} devices · {monitoredCount} shown on Dashboard</p>
                    </div>
                    <Button onClick={openAddDevice}><Plus size={16} />Add device</Button>
                  </div>

                  <div className="p-4 sm:p-5">
                    <DeviceList devices={branchDevices} branch={selectedBranch} onEdit={openEditDevice} onDelete={removeDevice} onAdd={openAddDevice} />
                  </div>
                </>
              ) : (
                <div className="grid min-h-[520px] place-items-center p-8 text-center">
                  <div>
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]"><Route size={27} /></div>
                    <h2 className="mt-4 text-lg font-black">Start with a branch</h2>
                    <p className="mx-auto mt-1 max-w-md text-sm text-[rgb(var(--muted))]">Create the first branch before adding Router, Switch, server, checkout, or other equipment.</p>
                    <Button className="mt-5" onClick={() => setDialog({ kind: 'branch', value: null })}><Plus size={16} />Create first branch</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        <Dialog
          open={Boolean(dialog)}
          onOpenChange={(open) => { if (!open && !saving) setDialog(null) }}
          title={dialogTitle}
          description={dialogDescription}
          className={dialog?.kind === 'device' ? 'max-w-6xl' : 'max-w-2xl'}
        >
          {dialog?.kind === 'branch' ? (
            <BranchForm value={dialog.value} onSubmit={save} saving={saving} />
          ) : dialog?.kind === 'device' && selectedBranch && dialog.step === 'type' ? (
            <DeviceTypePicker branch={selectedBranch} onSelect={(type) => setDialog({ ...dialog, step: 'form', type })} />
          ) : dialog?.kind === 'device' && selectedBranch ? (
            <DeviceForm
              key={`${dialog.value?.id || 'new'}-${dialog.type}`}
              value={dialog.value}
              branch={selectedBranch}
              deviceType={dialog.type}
              onSubmit={save}
              onBack={dialog.value ? null : () => setDialog({ ...dialog, step: 'type', type: null })}
              saving={saving}
            />
          ) : null}
        </Dialog>
      </div>
    </AppShell>
  )
}
