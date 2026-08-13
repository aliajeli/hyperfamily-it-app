'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, Trash2, Plus, Search, Layers, MonitorSmartphone, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, EmptyState, Select } from '@/components/ui'
import { DEVICE_TYPES } from '@/lib/constants'
import { getApi } from '@/lib/api'

/**
 * Credential assignment, simplified.
 *
 * The previous screen asked the operator to pick a credential, toggle it across
 * two separate grids, then remember to press "Save assignments" — and anything
 * not re-selected was wiped on save. Now every row carries its own dropdown and
 * writes immediately through a single-device IPC call, so an assignment can
 * never be lost by forgetting a button, and nothing else is ever touched.
 */
export default function CredentialsSettings() {
  const [credentials, setCredentials] = useState([])
  const [rows, setRows] = useState([])
  const [typeDefaults, setTypeDefaults] = useState({})
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [revealed, setRevealed] = useState({})
  const [branchFilter, setBranchFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [savedKey, setSavedKey] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const api = getApi()
      if (!api) return
      const [credentialList, branchList, overview, map] = await Promise.all([
        api.credentials.list(),
        api.branches.list(),
        api.credentials.overview(),
        api.credentials.map()
      ])
      setCredentials(credentialList)
      setBranches(branchList)
      setRows(overview)
      const defaults = {}
      for (const [type, ids] of Object.entries(map?.types || {})) if (ids?.length) defaults[type] = ids[0]
      setTypeDefaults(defaults)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (key) => {
    setSavedKey(key)
    setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 1600)
  }

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
    if (!window.confirm(`Delete credential “${credential.name}”? Any device using it falls back to its device-type credential.`)) return
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

  /* ------------------------------------------------------- instant assignment */

  const assignDevice = async (device, rawValue) => {
    const credentialId = rawValue === '' ? null : Number(rawValue)
    const key = `device-${device.device_id}`
    setBusyKey(key)
    // Optimistic update so the dropdown never snaps back while saving.
    setRows((current) => current.map((row) => row.device_id === device.device_id
      ? { ...row, credential_id: credentialId } : row))
    try {
      await getApi().credentials.assignDevice(device.device_id, credentialId)
      await load()
      flash(key)
    } catch (error) {
      toast.error(error.message)
      await load()
    } finally { setBusyKey(null) }
  }

  const assignType = async (type, rawValue) => {
    const credentialId = rawValue === '' ? null : Number(rawValue)
    const key = `type-${type}`
    setBusyKey(key)
    setTypeDefaults((current) => {
      const next = { ...current }
      if (credentialId === null) delete next[type]
      else next[type] = credentialId
      return next
    })
    try {
      await getApi().credentials.assignType(type, credentialId)
      await load()
      flash(key)
    } catch (error) {
      toast.error(error.message)
      await load()
    } finally { setBusyKey(null) }
  }

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (branchFilter !== 'all' && String(row.branch_id) !== branchFilter) return false
      if (typeFilter !== 'all' && row.device_type !== typeFilter) return false
      if (!needle) return true
      return [row.device_name, row.ip, row.device_type, row.branch_name, row.effective_name]
        .filter(Boolean).some((field) => String(field).toLowerCase().includes(needle))
    })
  }, [rows, branchFilter, typeFilter, query])

  const unassignedCount = rows.filter((row) => row.source === 'none').length

  const statusCell = (row) => {
    if (row.source === 'device') return <span className="rounded bg-[rgb(var(--primary)/.16)] px-1.5 py-0.5 text-[9.5px] font-bold text-[rgb(var(--primary))]">Set for this device</span>
    if (row.source === 'type') return <span className="rounded bg-[rgb(var(--border)/.6)] px-1.5 py-0.5 text-[9.5px] font-medium text-[rgb(var(--muted))]">From {row.device_type} default</span>
    return <span className="rounded bg-nord-11/15 px-1.5 py-0.5 text-[9.5px] font-bold text-nord-11">Not set</span>
  }

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
            <CardDescription className="text-xs">Revealed passwords hide again after 15 seconds.</CardDescription>
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
                      <th className="py-2.5">In use by</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((credential) => {
                      const deviceCount = rows.filter((row) => row.credential_id === credential.id).length
                      const typeCount = Object.values(typeDefaults).filter((id) => id === credential.id).length
                      return (
                        <tr key={credential.id} className="border-b transition last:border-0 hover:bg-[rgb(var(--border)/.3)]">
                          <td className="py-2.5 font-bold">{credential.name}</td>
                          <td className="py-2.5 font-mono">{credential.username}</td>
                          <td className="py-2.5 font-mono">{revealed[credential.id] || '••••••••'}</td>
                          <td className="py-2.5 text-[11px] text-[rgb(var(--muted))]">
                            {deviceCount || typeCount
                              ? [deviceCount ? `${deviceCount} device${deviceCount === 1 ? '' : 's'}` : null,
                                 typeCount ? `${typeCount} type default${typeCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')
                              : 'Not assigned'}
                          </td>
                          <td className="py-2.5">
                            <div className="flex justify-end gap-1">
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

      {credentials.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Layers size={16} />Default per device type</CardTitle>
              <CardDescription className="text-xs">
                Pick one credential per type and every device of that type uses it automatically. Changes save instantly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {DEVICE_TYPES.map((type) => {
                  const key = `type-${type}`
                  return (
                    <div key={type} className="rounded-xl border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-[11px]">{type}</b>
                        {busyKey === key && <Loader2 size={12} className="animate-spin text-[rgb(var(--muted))]" />}
                        {savedKey === key && <Check size={13} className="text-nord-14" />}
                      </div>
                      <Select
                        aria-label={`Default credential for ${type}`}
                        className="mt-1.5 h-8 w-full text-[11px]"
                        value={typeDefaults[type] ?? ''}
                        onChange={(event) => assignType(type, event.target.value)}
                      >
                        <option value="">No default</option>
                        {credentials.map((credential) => (
                          <option key={credential.id} value={credential.id}>{credential.name}</option>
                        ))}
                      </Select>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><MonitorSmartphone size={16} />Per-device credential</CardTitle>
              <CardDescription className="text-xs">
                Only for exceptions — a device set here overrides its type default. Every change saves immediately.
                {unassignedCount > 0 && <> <b className="text-nord-11">{unassignedCount} device{unassignedCount === 1 ? '' : 's'} still have no credential.</b></>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative">
                  <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
                  <Input className="h-8 w-52 pl-7 text-[11px]" placeholder="Search devices" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <Select aria-label="Filter by branch" className="h-8 w-40 text-[11px]" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  <option value="all">All branches</option>
                  {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
                </Select>
                <Select aria-label="Filter by device type" className="h-8 w-36 text-[11px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {DEVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </Select>
                <span className="ml-auto text-[10.5px] text-[rgb(var(--muted))]">{visibleRows.length} shown</span>
              </div>

              <div className="mt-2.5 max-h-[26rem] overflow-y-auto rounded-lg border">
                {loading ? (
                  <p className="p-6 text-center text-[11px] text-[rgb(var(--muted))]">Loading devices…</p>
                ) : visibleRows.length ? (
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 z-10 bg-[rgb(var(--surface))]">
                      <tr className="border-b text-[9.5px] uppercase tracking-wider text-[rgb(var(--muted))]">
                        <th className="py-2 pl-2.5">Device</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Branch</th>
                        <th className="py-2">Status</th>
                        <th className="py-2 pr-2.5">Credential</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const key = `device-${row.device_id}`
                        return (
                          <tr key={row.device_id} className="border-b transition last:border-0 hover:bg-[rgb(var(--border)/.25)]">
                            <td className="py-1.5 pl-2.5">
                              <div className="font-semibold">{row.device_name}</div>
                              <div className="font-mono text-[9.5px] text-[rgb(var(--muted))]">{row.ip}</div>
                            </td>
                            <td className="py-1.5 text-[rgb(var(--muted))]">{row.device_type}</td>
                            <td className="py-1.5 text-[rgb(var(--muted))]">{row.branch_name}</td>
                            <td className="py-1.5">{statusCell(row)}</td>
                            <td className="py-1.5 pr-2.5">
                              <div className="flex items-center gap-1.5">
                                <Select
                                  aria-label={`Credential for ${row.device_name} (${row.ip})`}
                                  className="h-8 w-48 text-[11px]"
                                  value={row.credential_id ?? ''}
                                  onChange={(event) => assignDevice(row, event.target.value)}
                                >
                                  <option value="">
                                    {row.source === 'type' ? `Use ${row.device_type} default` : 'Not set'}
                                  </option>
                                  {credentials.map((credential) => (
                                    <option key={credential.id} value={credential.id}>{credential.name}</option>
                                  ))}
                                </Select>
                                {busyKey === key && <Loader2 size={12} className="animate-spin text-[rgb(var(--muted))]" />}
                                {savedKey === key && <Check size={13} className="text-nord-14" />}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-6 text-center text-[11px] text-[rgb(var(--muted))]">No devices match these filters.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
