'use client'

import { useEffect, useState } from 'react'
import { FolderOpen, Shield, Route, Lock, AlertTriangle, CheckCircle2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Switch } from '@/components/ui'
import { getApi } from '@/lib/api'

export default function VPNSettings({ settings, onSaved }) {
  const [form, setForm] = useState({
    vpn_gateway: settings.vpn_gateway || '',
    vpn_port: settings.vpn_port || 443,
    vpn_user: settings.vpn_user || '',
    vpn_pass: settings.vpn_pass || '',
    vpn_realm: settings.vpn_realm || '',
    vpn_mode: settings.vpn_mode || 'in_app',
    vpn_autoconnect: settings.vpn_autoconnect ?? false,
    forticlient_path: settings.forticlient_path || ''
  })
  const [probe, setProbe] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { getApi().vpn.probe().then(setProbe).catch(() => setProbe(null)) }, [])

  const browse = async () => {
    const path = await getApi().dialog.selectFile({ title: 'Select the FortiClient executable', filters: [{ name: 'Windows executable', extensions: ['exe'] }] })
    if (path) setForm((current) => ({ ...current, forticlient_path: path }))
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const next = await getApi().settings.save({ ...form, vpn_port: Number(form.vpn_port) })
      onSaved(next)
      toast.success('VPN configuration encrypted and saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const modes = [
    { id: 'in_app', title: 'In-app tunnel', icon: <Route size={16} />, description: 'Only this application’s traffic is routed. The app authenticates to the FortiGate portal over HTTP POST and forwards branch requests through a local HTTP proxy. Windows keeps its normal internet connection.' },
    { id: 'global', title: 'Global (FortiClient)', icon: <Shield size={16} />, description: 'Launches the FortiClient VPN installed on this computer so you complete the connection there. All system traffic follows the FortiClient profile.' }
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Shield size={17} />FortiClient SSL VPN</CardTitle>
          <CardDescription className="text-xs">Gateway profile shared by both connection modes. Credentials are encrypted with Windows DPAPI.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label><Label>Remote gateway</Label><Input placeholder="vpn.example.com" value={form.vpn_gateway} onChange={(e) => setForm({ ...form, vpn_gateway: e.target.value })} /></label>
              <label><Label>Port</Label><Input type="number" min={1} max={65535} value={form.vpn_port} onChange={(e) => setForm({ ...form, vpn_port: e.target.value })} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><Label>Username</Label><Input autoComplete="off" value={form.vpn_user} onChange={(e) => setForm({ ...form, vpn_user: e.target.value })} /></label>
              <label><Label>Password</Label><Input type="password" autoComplete="new-password" value={form.vpn_pass} onChange={(e) => setForm({ ...form, vpn_pass: e.target.value })} /></label>
            </div>
            <label><Label>Realm <span className="font-normal text-[rgb(var(--muted))]">(optional)</span></Label><Input placeholder="e.g. branches" value={form.vpn_realm} onChange={(e) => setForm({ ...form, vpn_realm: e.target.value })} /></label>

            <fieldset className="rounded-xl border p-3">
              <legend className="px-1.5 text-[11px] font-bold">Connection mode</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {modes.map((mode) => {
                  const active = form.vpn_mode === mode.id
                  return (
                    <button
                      type="button"
                      key={mode.id}
                      onClick={() => setForm({ ...form, vpn_mode: mode.id })}
                      className={`rounded-xl border p-3 text-left transition ${active ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.1)] shadow-sm' : 'hover:bg-[rgb(var(--border)/.35)]'}`}
                    >
                      <span className={`flex items-center gap-2 text-xs font-bold ${active ? 'text-[rgb(var(--primary))]' : ''}`}>{mode.icon}{mode.title}</span>
                      <span className="mt-1.5 block text-[11px] leading-relaxed text-[rgb(var(--muted))]">{mode.description}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className="flex items-center justify-between rounded-xl border p-3">
              <span>
                <b className="text-xs">Connect automatically at startup</b>
                <span className="mt-0.5 block text-[11px] text-[rgb(var(--muted))]">Starts the selected mode as soon as you sign in.</span>
              </span>
              <Switch checked={Boolean(form.vpn_autoconnect)} onCheckedChange={(value) => setForm({ ...form, vpn_autoconnect: value })} />
            </label>

            <label>
              <Label>FortiClient executable <span className="font-normal text-[rgb(var(--muted))]">(auto-detected when empty)</span></Label>
              <div className="flex gap-2">
                <Input placeholder="C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe" value={form.forticlient_path} onChange={(e) => setForm({ ...form, forticlient_path: e.target.value })} />
                <Button variant="secondary" size="icon" type="button" onClick={browse}><FolderOpen size={16} /></Button>
              </div>
            </label>

            <Button disabled={saving}><Lock size={15} />{saving ? 'Saving…' : 'Encrypt and save VPN settings'}</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card className="p-4">
          {probe?.installed ? (
            <div className="flex items-start gap-2.5">
              <div className="rounded-xl bg-nord-14/20 p-2 text-[#66834e]"><CheckCircle2 size={17} /></div>
              <div className="min-w-0">
                <b className="text-xs">FortiClient detected</b>
                <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-[rgb(var(--muted))]">{probe.path}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <div className="rounded-xl bg-nord-13/20 p-2 text-[#8b6e1c]"><AlertTriangle size={17} /></div>
              <div>
                <b className="text-xs">FortiClient is not installed</b>
                <p className="mt-1 text-[11px] leading-relaxed text-[rgb(var(--muted))]">Global mode needs the FortiClient VPN client on this computer. In-app mode works without it.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => getApi().app.openExternal(probe?.downloadUrl || 'https://www.fortinet.com/support/product-downloads#vpn')}
                >
                  <Download size={14} />Get FortiClient
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-2.5">
            <div className="rounded-xl bg-[rgb(var(--primary)/.18)] p-2 text-[rgb(var(--primary))]"><Route size={17} /></div>
            <div>
              <b className="text-xs">How the in-app tunnel works</b>
              <p className="mt-1 text-[11px] leading-relaxed text-[rgb(var(--muted))]">A loopback proxy is started inside the app. Pings, device web UIs, and Guacamole sessions are forwarded through the SSL-VPN portal, so nothing else on the machine is re-routed.</p>
            </div>
          </div>
        </Card>

        <p className="px-1.5 text-[10px] leading-relaxed text-[rgb(var(--muted))]">
          Gateways that enforce two-factor authentication cannot be used with the in-app tunnel; choose Global mode for those profiles.
        </p>
      </div>
    </div>
  )
}
