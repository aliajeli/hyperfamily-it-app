'use client'

import { useEffect, useState } from 'react'
import { FolderOpen, Shield, Route, Lock, AlertTriangle, CheckCircle2, Download, Stethoscope, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Switch } from '@/components/ui'
import { getApi } from '@/lib/api'

export default function VPNSettings({ settings, onSaved }) {
  const [form, setForm] = useState({
    vpn_gateway: settings.vpn_gateway || '',
    vpn_port: settings.vpn_port || 443,
    vpn_user: settings.vpn_user || '',
    vpn_pass: settings.vpn_pass || '',
    vpn_autoconnect: settings.vpn_autoconnect ?? false,
    forticlient_path: settings.forticlient_path || ''
  })
  const [probe, setProbe] = useState(null)
  const [saving, setSaving] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [report, setReport] = useState(null)

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

  /**
   * Runs a real login attempt and shows exactly what the gateway answered.
   * The settings are saved first so the test always uses what is on screen.
   */
  const diagnose = async () => {
    setDiagnosing(true)
    setReport(null)
    try {
      const next = await getApi().settings.save({ ...form, vpn_port: Number(form.vpn_port) })
      onSaved(next)
      const result = await getApi().vpn.diagnose()
      setReport(result)
      if (result.outcome === 'rejected') toast.error('The gateway explicitly rejected these credentials')
      else if (result.ok) toast.success('The gateway did not reject the login')
      else toast.warning(result.reason)
    } catch (error) {
      setReport({ ok: false, stage: 'client', outcome: 'error', reason: error.message })
      toast.error(error.message)
    } finally {
      setDiagnosing(false)
    }
  }

  const reportText = report ? [
    `outcome      : ${report.outcome}`,
    `reason       : ${report.reason}`,
    `stage        : ${report.stage}`,
    report.target ? `target       : ${report.target}` : null,
    report.username ? `username     : ${report.username}` : null,
    report.statusCode !== undefined ? `http status  : ${report.statusCode} ${report.statusMessage || ''}`.trimEnd() : null,
    report.durationMs !== undefined ? `duration     : ${report.durationMs} ms` : null,
    report.transportError ? `transport    : ${report.transportError}` : null,
    report.cookieNames?.length ? `cookies      : ${report.cookieNames.join(', ')}` : 'cookies      : (none)',
    report.setCookie?.length ? `set-cookie   :\n${report.setCookie.map((item) => '  ' + item).join('\n')}` : null,
    report.headers ? `headers      :\n${Object.entries(report.headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')}` : null,
    report.bodyLength !== undefined ? `body (${report.bodyLength} bytes):\n${report.bodyExcerpt || '(empty)'}` : null
  ].filter(Boolean).join('\n') : ''

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText)
      toast.success('Diagnostics copied to the clipboard')
    } catch {
      toast.error('Could not access the clipboard')
    }
  }

  const outcomeTone = {
    accepted: { label: 'Credentials accepted', className: 'border-nord-14/50 bg-nord-14/15 text-[#4f6b3a]' },
    ambiguous: { label: 'No verdict from gateway — connection will proceed', className: 'border-nord-13/50 bg-nord-13/15 text-[#8b6e1c]' },
    rejected: { label: 'Gateway rejected the credentials (ret=0)', className: 'border-nord-11/50 bg-nord-11/15 text-[#a54b4b]' },
    two_factor: { label: 'Two-factor authentication required', className: 'border-nord-13/50 bg-nord-13/15 text-[#8b6e1c]' },
    unreachable: { label: 'Gateway did not answer', className: 'border-nord-11/50 bg-nord-11/15 text-[#a54b4b]' },
    error: { label: 'Test could not run', className: 'border-nord-11/50 bg-nord-11/15 text-[#a54b4b]' }
  }[report?.outcome] || null

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Shield size={17} />FortiClient SSL VPN</CardTitle>
          <CardDescription className="text-xs">One shared gateway profile, used by the VPN button in the header. Credentials are encrypted with Windows DPAPI.</CardDescription>
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
            <label className="flex items-center justify-between rounded-xl border p-3">
              <span>
                <b className="text-xs">Connect automatically at startup</b>
                <span className="mt-0.5 block text-[11px] text-[rgb(var(--muted))]">Launches FortiClient and connects as soon as you sign in.</span>
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

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving}><Lock size={15} />{saving ? 'Saving…' : 'Encrypt and save VPN settings'}</Button>
              <Button type="button" variant="secondary" disabled={diagnosing} onClick={diagnose} aria-label="Test and diagnose the VPN login">
                <Stethoscope size={15} />{diagnosing ? 'Testing…' : 'Test & diagnose'}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-[rgb(var(--muted))]">
              “Test & diagnose” saves the form, performs a real portal login, and shows the gateway’s untouched reply. Use the copy button and send the text to support if the login misbehaves.
            </p>
          </form>

          {report ? (
            <div className="mt-4 space-y-2" aria-label="VPN diagnostics report">
              <div className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${outcomeTone?.className || ''}`}>
                <div className="min-w-0">
                  <b className="text-xs">{outcomeTone?.label || report.outcome}</b>
                  <p className="mt-1 text-[11px] leading-relaxed">{report.reason}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={copyReport} aria-label="Copy diagnostics">
                  <Copy size={14} />Copy
                </Button>
              </div>
              <pre className="max-h-80 overflow-auto rounded-xl border bg-[rgb(var(--canvas))] p-3 font-mono text-[10px] leading-relaxed text-[rgb(var(--muted))] whitespace-pre-wrap break-all">{reportText}</pre>
            </div>
          ) : null}
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
                <p className="mt-1 text-[11px] leading-relaxed text-[rgb(var(--muted))]">The VPN needs the FortiClient VPN client on this computer.</p>
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
              <b className="text-xs">How the VPN works</b>
              <p className="mt-1 text-[11px] leading-relaxed text-[rgb(var(--muted))]">The app launches the FortiClient VPN installed on this computer and watches for the tunnel. Once FortiClient reports a connection the indicator turns green on its own, and every branch device is reached through it.</p>
            </div>
          </div>
        </Card>

        <p className="px-1.5 text-[10px] leading-relaxed text-[rgb(var(--muted))]">
          Two-factor authentication is completed in the FortiClient window itself, so gateways that enforce it are fully supported.
        </p>
      </div>
    </div>
  )
}
