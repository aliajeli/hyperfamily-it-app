'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, FileDown, FileUp, Plus, RefreshCw, Route, Server, Warehouse } from 'lucide-react'
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
  const [importing, setImporting] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)

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
  const hasRouter = branchDevices.some((device) => device.device_type === 'Router')

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
        const result = await getApi().devices.save(payload)
        toast.success(dialog.value ? `${result.name} changes saved` : `${result.name} added to ${selectedBranch.name}`)
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

  const importExcel = async () => {
    setImporting(true)
    try {
      const result = await getApi().inventory.importExcel()
      if (!result || result.canceled) return
      const branchChanges = result.branches_added + result.branches_updated
      const deviceChanges = result.devices_added + result.devices_updated
      toast.success(`Import complete: ${branchChanges} branches, ${deviceChanges} devices, and ${result.switch_ports_imported} switch ports processed`)
      await load(selectedBranchId)
    } catch (error) {
      toast.error(error.message, { duration: 9000 })
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = async () => {
    setDownloadingTemplate(true)
    try {
      const result = await getApi().inventory.downloadTemplate()
      if (result?.path) toast.success(`Import template saved to ${result.path}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setDownloadingTemplate(false)
    }
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
    ? 'Define branch identity, Warehouse Code, network links, and responsible contacts.'
    : dialog?.step === 'type'
      ? 'Choose the equipment type. A branch can contain only one Router.'
      : 'Every saved device needs a Device Name. Review the information and save your changes.'

  return (
    <AppShell>
      <div className="mx-auto max-w-[1700px] space-y-3 text-[13px]">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-xl font-black tracking-tight">Branches &amp; Devices</h1>
            <p className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Manage compact branch and equipment records or import the complete directory from Excel.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={downloadTemplate} disabled={downloadingTemplate || importing}><FileDown size={14} />{downloadingTemplate ? 'Preparing…' : 'Download Import Template'}</Button>
            <Button size="sm" variant="secondary" onClick={importExcel} disabled={importing || downloadingTemplate}><FileUp size={14} />{importing ? 'Importing…' : 'Import Excel'}</Button>
            <Button size="sm" variant="secondary" onClick={() => load(selectedBranchId)} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</Button>
            <Button size="sm" onClick={() => setDialog({ kind: 'branch', value: null })}><Plus size={14} />Add branch</Button>
          </div>
        </div>

        {loading ? (
          <><Skeleton className="h-20" /><Skeleton className="h-[560px]" /></>
        ) : (
          <>
            <Card className="overflow-hidden p-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex shrink-0 items-center gap-2 border-r pr-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]"><Building2 size={14} /></span>
                  <span><b className="block text-[11px]">Branches</b><small className="block text-[8px] text-[rgb(var(--muted))]">{branches.length} locations</small></span>
                </div>
                <BranchList
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  deviceCounts={deviceCounts}
                  onSelect={(branch) => setSelectedBranchId(branch.id)}
                  onEdit={(branch) => setDialog({ kind: 'branch', value: branch })}
                  onDelete={removeBranch}
                  onAdd={() => setDialog({ kind: 'branch', value: null })}
                />
                <Button variant="secondary" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDialog({ kind: 'branch', value: null })} aria-label="Add branch"><Plus size={13} /></Button>
              </div>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              {selectedBranch ? (
                <>
                  <div className="flex flex-col justify-between gap-2 border-b bg-gradient-to-r from-[rgb(var(--primary)/.09)] via-[rgb(var(--surface)/.68)] to-[rgb(var(--secondary)/.07)] px-3.5 py-2.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[rgb(var(--primary))] text-white"><Server size={14} /></span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <h2 className="truncate text-xs font-black tracking-[0.025em]">{selectedBranch.name}</h2>
                          <span className="rounded-md bg-[rgb(var(--surface)/.78)] px-1.5 py-0.5 font-mono text-[8px] font-bold">{selectedBranch.code}</span>
                          <span className="flex items-center gap-1 rounded-md bg-[rgb(var(--surface)/.78)] px-1.5 py-0.5 font-mono text-[8px] font-bold"><Warehouse size={8} />{selectedBranch.warehouse_code || 'Warehouse code not set'}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[8px] text-[rgb(var(--muted))]">{branchDevices.length} devices · {monitoredCount} on Dashboard · {selectedBranch.link1 || 'No primary link'}{selectedBranch.manager_name ? ` · ${selectedBranch.manager_name}` : ''}</p>
                      </div>
                    </div>
                    <Button size="sm" onClick={openAddDevice}><Plus size={14} />Add device</Button>
                  </div>

                  <div className="p-2.5 sm:p-3">
                    <DeviceList devices={branchDevices} branch={selectedBranch} onEdit={openEditDevice} onDelete={removeDevice} onAdd={openAddDevice} />
                  </div>
                </>
              ) : (
                <div className="grid min-h-[400px] place-items-center p-8 text-center">
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]"><Route size={23} /></div>
                    <h2 className="mt-3 text-base font-black">Start with a branch</h2>
                    <p className="mx-auto mt-1 max-w-md text-xs text-[rgb(var(--muted))]">Create the first branch before adding equipment.</p>
                    <Button size="sm" className="mt-4" onClick={() => setDialog({ kind: 'branch', value: null })}><Plus size={14} />Create first branch</Button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        <Dialog
          open={Boolean(dialog)}
          onOpenChange={(open) => { if (!open && !saving) setDialog(null) }}
          title={dialogTitle}
          description={dialogDescription}
          className={dialog?.kind === 'device' ? 'max-w-6xl' : 'max-w-3xl'}
        >
          {dialog?.kind === 'branch' ? (
            <BranchForm value={dialog.value} onSubmit={save} saving={saving} />
          ) : dialog?.kind === 'device' && selectedBranch && dialog.step === 'type' ? (
            <DeviceTypePicker branch={selectedBranch} unavailableTypes={hasRouter ? ['Router'] : []} onSelect={(type) => setDialog({ ...dialog, step: 'form', type })} />
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
