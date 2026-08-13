'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, Trash2, Plus, Link2, Save, Search, Layers, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, EmptyState, Select } from '@/components/ui'
import { DEVICE_TYPES } from '@/lib/constants'
import { getApi } from '@/lib/api'

const emptyMap = { types: {}, devices: {} }

export default function CredentialsSettings() {
  const [credentials, setCredentials] = useState([])
  const [devices, setDevices] = useState([])
  const [branches, setBranches] = useState([])
  const [mappings, setMappings] = useState(emptyMap)
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [revealed, setRevealed] = useState({})
  const [selected, setSelected] = useState(null)
  const [branchFilter, setBranchFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [savingMap, setSavingMap] = useState(false)

  const load = async () => {
    try {
      const api = getApi()
      const [credentialList, deviceList, branchList, map] = await Promise.all([
        api.credentials.list(),
        api.devices.list(),
        api.branches.list(),
        api.credentials.mappings()
      ])
      setCredentials(credentialList)
      setDevices(deviceList)
      setBranches(branchList)
      setMappings({ types: map?.types || {}, devices: map?.devices || {} })
      setSelected((current) => current && credentialList.some((item) => item.id === current) ? current : credentialList[0]?.id ?? null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(() => { load() }, [])

  const add = async (event) => {
    event.preventDefault()
    try {
      await getApi().credentials.save(form)
      setForm({ name: '', username: '', password: '' })
      await load()
      toast.success('Credential encrypted and saved')
    } catch (error) { toast.error(error.message) }
  }

  const remove = async (credential) => {
    if (!window.confirm(`Delete credential “${credential.name}”? Any device or type assigned to it loses that assignment.`)) return
    try {
      await getApi().credentials.remove(credential.id)
      await load()
      toast.success('Credential deleted')
    } catch (error) { toast.error(error.message) }
  }

  const toggleReveal = async (credential) => {
    if (revealed[credential.id]) return setRevealed({ ...revealed, [credential.id]: '' })
    try {
      const password = await getApi().credentials.reveal(credential.id)
      setRevealed((current) => ({ ...current, [credential.id]: password }))
      setTimeout(() => setRevealed((current) => ({ ...current, [credential.id]: '' })), 15000)
    } catch (error) { toast.error(error.message) }
  }

  /* ---------------------------------------------------------------- mapping */

  const assignedTypes = useMemo(
    () => DEVICE_TYPES.filter((type) => (mappings.types[type] || []).includes(selected)),
    [mappings, selected]
  )
  const assignedDeviceIds = useMemo(
    () => Object.entries(mappings.devices).filter(([, ids]) => (ids || []).includes(selected)).map(([id]) => Number(id)),
    [mappings, selected]
  )

  const toggleType = (type) => {
    setMappings((current) => {
      const ids = current.types[type] || []
      const next = ids.includes(selected) ? ids.filter((id) => id !== selected) : [...ids, selected]
      return { ...current, types: { ...current.types, [type]: next } }
    })
  }

  const toggleDevice = (deviceId) => {
    setMappings((current) => {
      const ids = current.devices[deviceId] || []
      const next = ids.includes(selected) ? ids.filter((id) => id !== selected) : [...ids, selected]
      return { ...current, devices: { ...current.devices, [deviceId]: next } }
    })
  }

  const saveMappings = async () => {
    setSavingMap(true)
    try {
      await getApi().credentials.saveMappings(mappings)
      toast.success('Credential assignments saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSavingMap(false)
    }
  }

  const branchName = (id) => branches.find((branch) => branch.id === id)?.name || '—'

  const visibleDevices = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return devices.filter((device) => {
      if (branchFilter !== 'all' && String(device.branch_id) !== branchFilter) return false
      if (typeFilter !== 'all' && device.device_type !== typeFilter) return false
      if (!needle) return true
      return [device.name, device.ip, device.device_type, branchName(device.branch_id)]
        .filter(Boolean).some((field) => String(field).toLowerCase().includes(needle))
    })
  }, [devices, branchFilter, typeFilter, query, branches])

  const selectedCredential = credentials.find((item) => item.id === selected)

  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Plus size={16} />Add credential</CardTitle>
            <CardDescription className="text-xs">Passwords are encrypted with Windows DPAPI before SQLite storage.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={add} className="space-y-3">
              <label><Label>Credential name</Label><Input required placeholder="Branch administrators" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label><Label>Username</Label><Input required autoComplete="off" placeholder="DOMAIN\username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
              <label><Label>Password</Label><Input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <Button className="w-full"><KeyRound size={15} />Encrypt and save</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saved credentials</CardTitle>
            <CardDescription className="text-xs">Select a row to manage its assignments. Revealed passwords hide again after 15 seconds.</CardDescription>
          </CardHeader>
          <CardContent>
            {credentials.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                      <th className="py-2.5">Name</th>
                      <th className="py-2.5">Username</th>
                      <th className="py-2.5">Password</th>
                      <th className="py-2.5">Assigned to</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((credential) => {
                      const types = DEVICE_TYPES.filter((type) => (mappings.types[type] || []).includes(credential.id)).length
                      const deviceCount = Object.values(mappings.devices).filter((ids) => (ids || []).includes(credential.id)).length
                      const active = selected === credential.id
                      return (
                        <tr
                          key={credential.id}
                          onClick={() => setSelected(credential.id)}
                          className={`cursor-pointer border-b transition last:border-0 ${active ? 'bg-[rgb(var(--primary)/.1)]' : 'hover:bg-[rgb(var(--border)/.3)]'}`}
                        >
                          <td className="py-2.5 font-bold">{credential.name}</td>
                          <td className="py-2.5 font-mono">{credential.username}</td>
                          <td className="py-2.5 font-mono">{revealed[credential.id] || '••••••••'}</td>
                          <td className="py-2.5 text-[11px] text-[rgb(var(--muted))]">
                            {types || deviceCount ? `${types} type${types === 1 ? '' : 's'} · ${deviceCount} device${deviceCount === 1 ? '' : 's'}` : 'Not assigned'}
                          </td>
                          <td className="py-2.5">
                            <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleReveal(credential)}>{revealed[credential.id] ? <EyeOff size={15} /> : <Eye size={15} />}</Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-nord-11" onClick={() => remove(credential)}><Trash2 size={15} /></Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<KeyRound />} title="No credentials" description="Create an encrypted credential to enable one-click remote connections." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Link2 size={16} />Credential mapping</CardTitle>
          <CardDescription className="text-xs">
            {selectedCredential
              ? <>Assign <b className="text-[rgb(var(--text))]">{selectedCredential.name}</b> to whole device types, to individual devices, or to any combination of both.</>
              : 'Create a credential first, then assign it to device types and individual devices.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!credentials.length ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-[rgb(var(--muted))]">Add a credential above to start mapping.</p>
          ) : (
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Credential</span>
                <div className="flex flex-wrap gap-1.5">
                  {credentials.map((credential) => (
                    <button
                      key={credential.id}
                      type="button"
                      onClick={() => setSelected(credential.id)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${selected === credential.id ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white shadow-sm' : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.4)]'}`}
                    >
                      {credential.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3.5 lg:grid-cols-[320px_1fr]">
                <div className="rounded-xl border p-3">
                  <b className="flex items-center gap-1.5 text-xs"><Layers size={13} />Device types</b>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[rgb(var(--muted))]">Every device of a selected type inherits this credential.</p>
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                    {DEVICE_TYPES.map((type) => {
                      const active = assignedTypes.includes(type)
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleType(type)}
                          className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${active ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.14)] text-[rgb(var(--primary))]' : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.4)]'}`}
                        >
                          {type}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="flex items-center gap-1.5 text-xs"><MonitorSmartphone size={13} />Individual devices</b>
                    <span className="rounded-md bg-[rgb(var(--border)/.5)] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--muted))]">{assignedDeviceIds.length} selected</span>
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                      <div className="relative">
                        <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
                        <Input className="h-8 w-44 pl-7 text-[11px]" placeholder="Search devices" value={query} onChange={(e) => setQuery(e.target.value)} />
                      </div>
                      <Select className="h-8 w-36 text-[11px]" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                        <option value="all">All branches</option>
                        {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
                      </Select>
                      <Select className="h-8 w-32 text-[11px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="all">All types</option>
                        {DEVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </Select>
                    </div>
                  </div>

                  <div className="mt-2.5 max-h-72 overflow-y-auto rounded-lg border">
                    {visibleDevices.length ? (
                      <table className="w-full text-left text-[11px]">
                        <thead className="sticky top-0 bg-[rgb(var(--surface))]">
                          <tr className="border-b text-[9.5px] uppercase tracking-wider text-[rgb(var(--muted))]">
                            <th className="w-9 py-2 pl-2.5"></th>
                            <th className="py-2">Device</th>
                            <th className="py-2">Type</th>
                            <th className="py-2">Branch</th>
                            <th className="py-2 pr-2.5">IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleDevices.map((device) => {
                            const direct = assignedDeviceIds.includes(device.id)
                            const inherited = assignedTypes.includes(device.device_type)
                            return (
                              <tr
                                key={device.id}
                                onClick={() => toggleDevice(device.id)}
                                className={`cursor-pointer border-b transition last:border-0 ${direct ? 'bg-[rgb(var(--primary)/.1)]' : 'hover:bg-[rgb(var(--border)/.3)]'}`}
                              >
                                <td className="py-1.5 pl-2.5">
                                  <input type="checkbox" readOnly className="accent-[rgb(var(--primary))]" checked={direct} />
                                </td>
                                <td className="py-1.5 font-semibold">
                                  {device.name}
                                  {inherited && !direct && <span className="ml-1.5 rounded bg-[rgb(var(--border)/.6)] px-1 py-px text-[9px] font-medium text-[rgb(var(--muted))]">via type</span>}
                                </td>
                                <td className="py-1.5 text-[rgb(var(--muted))]">{device.device_type}</td>
                                <td className="py-1.5 text-[rgb(var(--muted))]">{branchName(device.branch_id)}</td>
                                <td className="py-1.5 pr-2.5 font-mono text-[10px] text-[rgb(var(--muted))]">{device.ip}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="p-6 text-center text-[11px] text-[rgb(var(--muted))]">No devices match these filters.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={saveMappings} disabled={savingMap}><Save size={15} />{savingMap ? 'Saving…' : 'Save assignments'}</Button>
                <p className="text-[11px] text-[rgb(var(--muted))]">Device assignments take priority over type assignments when a connection is launched.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
