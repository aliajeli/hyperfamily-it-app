'use client'

import { useState } from 'react'
import { MonitorSmartphone, Save, PlugZap, FolderOpen, HardDriveDownload } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Select, Switch } from '@/components/ui'
import { getApi } from '@/lib/api'

export default function RemoteSettings({ settings, onSaved }) {
  const [form, setForm] = useState({
    guacamole_url: settings.guacamole_url || '',
    guacamole_user: settings.guacamole_user || '',
    guacamole_pass: settings.guacamole_pass || '',
    guacamole_datasource: settings.guacamole_datasource || 'postgresql',
    guacamole_enable_drive: settings.guacamole_enable_drive ?? true,
    guacamole_drive_path: settings.guacamole_drive_path || ''
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const next = await getApi().settings.save(form)
      onSaved(next)
      toast.success('Remote session settings saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      await getApi().settings.save(form)
      const result = await getApi().remote.guacamoleTest()
      toast.success(`Connected to ${result.server} (data source: ${result.dataSource})`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setTesting(false)
    }
  }

  const browse = async () => {
    const path = await getApi().dialog.selectFile({ title: 'Select the shared transfer folder' })
    if (path) setForm((current) => ({ ...current, guacamole_drive_path: path }))
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><MonitorSmartphone size={17} />Apache Guacamole</CardTitle>
          <CardDescription className="text-xs">Remote sessions open in a dedicated in-app window. The app creates the connection for you using the credential assigned to the device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3.5">
            <label>
              <Label>Server URL</Label>
              <Input placeholder="https://guacamole.example.com/guacamole" value={form.guacamole_url} onChange={(e) => setForm({ ...form, guacamole_url: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><Label>Username</Label><Input autoComplete="off" value={form.guacamole_user} onChange={(e) => setForm({ ...form, guacamole_user: e.target.value })} /></label>
              <label><Label>Password</Label><Input type="password" autoComplete="new-password" value={form.guacamole_pass} onChange={(e) => setForm({ ...form, guacamole_pass: e.target.value })} /></label>
            </div>
            <label>
              <Label>Data source</Label>
              <Select value={form.guacamole_datasource} onChange={(e) => setForm({ ...form, guacamole_datasource: e.target.value })}>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL / MariaDB</option>
                <option value="sqlserver">SQL Server</option>
                <option value="ldap">LDAP</option>
                <option value="json">JSON</option>
              </Select>
            </label>

            <fieldset className="rounded-xl border p-3">
              <legend className="flex items-center gap-1.5 px-1.5 text-[11px] font-bold"><HardDriveDownload size={13} />File transfer</legend>
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <b className="text-xs">Mount a shared drive in the session</b>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[rgb(var(--muted))]">Adds a “HyperFamily Transfer” drive to RDP sessions and SFTP browsing to SSH sessions, so files can be copied both ways.</span>
                  </span>
                  <Switch checked={Boolean(form.guacamole_enable_drive)} onCheckedChange={(value) => setForm({ ...form, guacamole_enable_drive: value })} />
                </label>
                <label>
                  <Label>Local staging folder</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Defaults to a per-device folder on the Guacamole host" value={form.guacamole_drive_path} onChange={(e) => setForm({ ...form, guacamole_drive_path: e.target.value })} />
                    <Button type="button" variant="secondary" size="icon" onClick={browse}><FolderOpen size={16} /></Button>
                  </div>
                </label>
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save remote settings'}</Button>
              <Button type="button" variant="secondary" disabled={testing} onClick={test}><PlugZap size={15} />{testing ? 'Testing…' : 'Test connection'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card className="p-4">
          <b className="text-xs">Protocol selection</b>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-[rgb(var(--muted))]">
            <li><b className="text-[rgb(var(--text))]">RDP</b> — Server, Client, Checkout, POS</li>
            <li><b className="text-[rgb(var(--text))]">SSH</b> — Router, Switch</li>
            <li>Everything else defaults to RDP; a device can override it.</li>
          </ul>
        </Card>
        <Card className="p-4">
          <b className="text-xs">Security</b>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[rgb(var(--muted))]">
            Guacamole credentials never reach the browser layer. The main process signs in, provisions the connection, and hands the session window a single-use token.
          </p>
        </Card>
      </div>
    </div>
  )
}
