'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, EmptyState } from '@/components/ui'
import { getApi } from '@/lib/api'

export default function CredentialsSettings() {
  const [credentials, setCredentials] = useState([])
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [revealed, setRevealed] = useState({})
  const load = () => getApi().credentials.list().then(setCredentials).catch((e) => toast.error(e.message))
  useEffect(() => { load() }, [])
  const add = async (event) => { event.preventDefault(); try { await getApi().credentials.save(form); setForm({ name: '', username: '', password: '' }); await load(); toast.success('Credential encrypted and saved') } catch (error) { toast.error(error.message) } }
  const remove = async (credential) => { if (!window.confirm(`Delete credential “${credential.name}”?`)) return; try { await getApi().credentials.remove(credential.id); await load(); toast.success('Credential deleted') } catch (error) { toast.error(error.message) } }
  const toggle = async (credential) => { if (revealed[credential.id]) return setRevealed({ ...revealed, [credential.id]: '' }); try { const password = await getApi().credentials.reveal(credential.id); setRevealed({ ...revealed, [credential.id]: password }); setTimeout(() => setRevealed((current) => ({ ...current, [credential.id]: '' })), 15000) } catch (error) { toast.error(error.message) } }
  return <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus size={18} />Add credential</CardTitle><CardDescription>Passwords are encrypted with Windows DPAPI before SQLite storage.</CardDescription></CardHeader><CardContent><form onSubmit={add} className="space-y-4"><label><Label>Credential name</Label><Input required placeholder="Branch administrators" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label><Label>Username</Label><Input required autoComplete="off" placeholder="DOMAIN\\username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label><label><Label>Password</Label><Input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><Button className="w-full"><KeyRound size={16} />Encrypt and save</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Saved credentials</CardTitle><CardDescription>Revealed passwords are automatically hidden after 15 seconds.</CardDescription></CardHeader><CardContent>{credentials.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]"><th className="py-3">Name</th><th className="py-3">Username</th><th className="py-3">Password</th><th className="py-3 text-right">Actions</th></tr></thead><tbody>{credentials.map((credential) => <tr key={credential.id} className="border-b last:border-0"><td className="py-4 font-bold">{credential.name}</td><td className="py-4 font-mono">{credential.username}</td><td className="py-4 font-mono">{revealed[credential.id] || '••••••••••'}</td><td className="py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => toggle(credential)}>{revealed[credential.id] ? <EyeOff size={16} /> : <Eye size={16} />}</Button><Button variant="ghost" size="icon" className="text-nord-11" onClick={() => remove(credential)}><Trash2 size={16} /></Button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={<KeyRound />} title="No credentials" description="Create an encrypted credential to enable one-click remote connections." />}</CardContent></Card>
  </div>
}
