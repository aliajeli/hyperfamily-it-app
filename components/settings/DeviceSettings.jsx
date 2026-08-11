'use client'

import { useEffect, useState } from 'react'
import { FolderOpen, MonitorCog, Router } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label } from '@/components/ui'
import { DEVICE_TYPES } from '@/lib/constants'
import { getApi } from '@/lib/api'

export default function DeviceSettings({ settings, onSaved }) {
  const [form, setForm] = useState({ teamviewer_path: settings.teamviewer_path || '', teamviewer_password: settings.teamviewer_password || '', winbox_path: settings.winbox_path || '', winbox_port: settings.winbox_port || 8291 })
  const [credentials, setCredentials] = useState([])
  const [mappings, setMappings] = useState({})
  useEffect(() => { Promise.all([getApi().credentials.list(), getApi().credentials.mappings()]).then(([c, m]) => { setCredentials(c); setMappings(m) }).catch((e) => toast.error(e.message)) }, [])
  const browse = async (key) => { const path = await getApi().dialog.selectFile({ title: `Select ${key === 'teamviewer_path' ? 'TeamViewer' : 'Winbox'} executable`, filters: [{ name: 'Windows executables', extensions: ['exe'] }] }); if (path) setForm({ ...form, [key]: path }) }
  const save = async () => { try { const next = await getApi().settings.save({ ...form, winbox_port: Number(form.winbox_port) }); await getApi().credentials.saveMappings(mappings); onSaved(next); toast.success('Remote tool settings saved') } catch (error) { toast.error(error.message) } }
  const toggle = (type, id) => { const ids = mappings[type] || []; setMappings({ ...mappings, [type]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }) }
  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><MonitorCog size={18} />TeamViewer</CardTitle><CardDescription>Executable and optional default unattended-access password.</CardDescription></CardHeader><CardContent className="space-y-4"><label><Label>Executable path</Label><div className="flex gap-2"><Input value={form.teamviewer_path} onChange={(e) => setForm({ ...form, teamviewer_path: e.target.value })} /><Button type="button" variant="secondary" size="icon" onClick={() => browse('teamviewer_path')}><FolderOpen size={17} /></Button></div></label><label><Label>Default password</Label><Input type="password" value={form.teamviewer_password} onChange={(e) => setForm({ ...form, teamviewer_password: e.target.value })} /></label></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Router size={18} />MikroTik Winbox</CardTitle><CardDescription>Path and default management service port.</CardDescription></CardHeader><CardContent className="space-y-4"><label><Label>Executable path</Label><div className="flex gap-2"><Input value={form.winbox_path} onChange={(e) => setForm({ ...form, winbox_path: e.target.value })} /><Button type="button" variant="secondary" size="icon" onClick={() => browse('winbox_path')}><FolderOpen size={17} /></Button></div></label><label><Label>Default port</Label><Input type="number" min={1} max={65535} value={form.winbox_port} onChange={(e) => setForm({ ...form, winbox_port: e.target.value })} /></label></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Device type → credential mapping</CardTitle><CardDescription>Mapped credentials appear as secure submenus when you right-click a monitored device.</CardDescription></CardHeader><CardContent>{credentials.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{DEVICE_TYPES.map((type) => <div key={type} className="rounded-xl border p-3"><b className="text-xs">{type}</b><div className="mt-2 space-y-2">{credentials.map((credential) => <label key={credential.id} className="flex cursor-pointer items-center gap-2 text-xs text-[rgb(var(--muted))]"><input type="checkbox" className="accent-[rgb(var(--primary))]" checked={(mappings[type] || []).includes(credential.id)} onChange={() => toggle(type, credential.id)} />{credential.name} <span className="ml-auto font-mono text-[9px]">{credential.username}</span></label>)}</div></div>)}</div> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-[rgb(var(--muted))]">Add credentials in the Credentials tab first.</p>}<div className="mt-5"><Button onClick={save}>Save device settings</Button></div></CardContent></Card>
  </div>
}
