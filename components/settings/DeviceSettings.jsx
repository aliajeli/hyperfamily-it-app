'use client'

import { useEffect, useState } from 'react'
import { FolderOpen, MonitorCog, Router, Save, CheckCircle2, AlertTriangle, PlugZap, RotateCcw, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Switch } from '@/components/ui'
import { getApi } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings.store'
import { DEVICE_TYPES, DEVICE_TYPE_DETAILS } from '@/lib/constants'
import {
  CONNECTION_METHODS,
  CONNECTION_METHOD_IDS,
  DEFAULT_CONNECTION_METHODS,
  connectionSettingKey,
  resolveConnectionMethods
} from '@/lib/connection-methods'

/**
 * Per-device-type connection methods.
 *
 * Several methods can be enabled for one type; the first enabled one is that
 * type's default and the rest appear as alternatives in the device menu.
 * Clicking an enabled method promotes it to default, which is why order is
 * preserved rather than recomputed from the checkbox order.
 */
function ConnectionMethodMatrix({ settings, onSaved }) {
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(DEVICE_TYPES.map((type) => [type, resolveConnectionMethods(type, settings)])))
  const [saving, setSaving] = useState(false)

  const toggle = (type, methodId) => {
    setDraft((current) => {
      const list = current[type] || []
      // Never leave a device type with no way to connect.
      if (list.includes(methodId)) {
        if (list.length === 1) {
          toast.error(`${DEVICE_TYPE_DETAILS[type]?.label || type} needs at least one connection method`)
          return current
        }
        return { ...current, [type]: list.filter((id) => id !== methodId) }
      }
      return { ...current, [type]: [...list, methodId] }
    })
  }

  const makeDefault = (type, methodId) => {
    setDraft((current) => {
      const list = current[type] || []
      if (!list.includes(methodId)) return current
      return { ...current, [type]: [methodId, ...list.filter((id) => id !== methodId)] }
    })
  }

  const restoreDefaults = () => {
    setDraft(Object.fromEntries(DEVICE_TYPES.map((type) => [type, [...(DEFAULT_CONNECTION_METHODS[type] || ['browser'])]])))
    toast.info('Factory connection methods restored — save to apply')
  }

  const save = async () => {
    setSaving(true)
    try {
      const patch = Object.fromEntries(DEVICE_TYPES.map((type) => [connectionSettingKey(type), draft[type]]))
      const next = await getApi().settings.save(patch)
      onSaved(next)
      setGlobalSettings(next)
      toast.success('Connection methods saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2.5">
        <CardTitle className="flex items-center gap-2 text-sm"><PlugZap size={15} />Connection method per device type</CardTitle>
        <CardDescription className="text-[11px]">
          Click a method to enable it, click an enabled one to make it the default (marked with a star), and use its × to remove it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {DEVICE_TYPES.map((type) => {
            const list = draft[type] || []
            return (
              <div key={type} className="rounded-xl border border-[rgb(var(--border))] p-2.5">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <b className="text-[11px]">{DEVICE_TYPE_DETAILS[type]?.label || type}</b>
                  <span className="truncate text-[9px] text-[rgb(var(--muted))]">
                    {CONNECTION_METHODS[list[0]]?.label || 'None'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CONNECTION_METHOD_IDS.map((methodId) => {
                    const enabled = list.includes(methodId)
                    const isDefault = list[0] === methodId
                    const label = CONNECTION_METHODS[methodId].label
                    // The chip is a wrapper, not a button, so the label and the
                    // remove control can be two real sibling buttons. Nesting a
                    // button inside a button is invalid HTML and breaks clicks.
                    return (
                      <span
                        key={methodId}
                        title={CONNECTION_METHODS[methodId].description}
                        className={`flex items-center rounded-lg border text-[9.5px] font-semibold transition ${
                          isDefault
                            ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)/.14)] text-[rgb(var(--primary))]'
                            : enabled
                              ? 'border-[rgb(var(--border))] bg-[rgb(var(--border)/.4)] text-[rgb(var(--text))]'
                              : 'border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.35)]'
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={enabled}
                          aria-label={
                            enabled
                              ? (isDefault ? `${label} is the default for ${type}` : `Make ${label} the default for ${type}`)
                              : `Enable ${label} for ${type}`
                          }
                          onClick={() => (enabled ? makeDefault(type, methodId) : toggle(type, methodId))}
                          className="flex items-center gap-1 py-1 pl-1.5 pr-1.5"
                        >
                          {isDefault && <Star size={9} fill="currentColor" />}
                          {label}
                        </button>
                        {enabled && list.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remove ${label} from ${type}`}
                            title={`Remove ${label}`}
                            onClick={() => toggle(type, methodId)}
                            className="py-1 pl-0 pr-1.5 opacity-55 transition hover:opacity-100"
                          >
                            <X size={9} strokeWidth={3} />
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button size="sm" onClick={save} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save connection methods'}</Button>
          <Button size="sm" variant="secondary" onClick={restoreDefaults}><RotateCcw size={14} />Restore defaults</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DeviceSettings({ settings, onSaved }) {
  const [form, setForm] = useState({
    teamviewer_path: settings.teamviewer_path || '',
    teamviewer_password: settings.teamviewer_password || '',
    teamviewer_lan_mode: settings.teamviewer_lan_mode ?? true,
    winbox_path: settings.winbox_path || '',
    winbox_port: settings.winbox_port || 8291
  })
  const [probe, setProbe] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { getApi().remote.probe().then(setProbe).catch(() => setProbe(null)) }, [])

  const browse = async (key) => {
    const path = await getApi().dialog.selectFile({
      title: `Select the ${key === 'teamviewer_path' ? 'TeamViewer' : 'Winbox'} executable`,
      filters: [{ name: 'Windows executables', extensions: ['exe'] }]
    })
    if (path) setForm((current) => ({ ...current, [key]: path }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = await getApi().settings.save({ ...form, winbox_port: Number(form.winbox_port) })
      onSaved(next)
      toast.success('Device tool settings saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const Detected = ({ value }) => value
    ? <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#66834e]"><CheckCircle2 size={12} />Detected at {value}</span>
    : <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#8b6e1c]"><AlertTriangle size={12} />Not found in the default install locations</span>

  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><MonitorCog size={17} />TeamViewer</CardTitle>
            <CardDescription className="text-xs">Executable, default password, and LAN connection behaviour.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label>
              <Label>Executable path</Label>
              <div className="flex gap-2">
                <Input value={form.teamviewer_path} onChange={(e) => setForm({ ...form, teamviewer_path: e.target.value })} placeholder="C:\\Program Files\\TeamViewer\\TeamViewer.exe" />
                <Button type="button" variant="secondary" size="icon" onClick={() => browse('teamviewer_path')}><FolderOpen size={16} /></Button>
              </div>
              <Detected value={probe?.teamviewer} />
            </label>
            <label>
              <Label>Default password <span className="font-normal text-[rgb(var(--muted))]">(optional)</span></Label>
              <Input type="password" autoComplete="new-password" value={form.teamviewer_password} onChange={(e) => setForm({ ...form, teamviewer_password: e.target.value })} />
            </label>
            <label className="flex items-center justify-between rounded-xl border p-3">
              <span>
                <b className="text-xs">LAN connections</b>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[rgb(var(--muted))]">Connect to the device by IP address instead of a TeamViewer ID. Enable “Incoming LAN connections” on the target too.</span>
              </span>
              <Switch checked={Boolean(form.teamviewer_lan_mode)} onCheckedChange={(value) => setForm({ ...form, teamviewer_lan_mode: value })} />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Router size={17} />MikroTik Winbox</CardTitle>
            <CardDescription className="text-xs">Winbox sessions open with the device IP, this port, and the credential assigned to the device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label>
              <Label>Executable path</Label>
              <div className="flex gap-2">
                <Input value={form.winbox_path} onChange={(e) => setForm({ ...form, winbox_path: e.target.value })} placeholder="C:\\Program Files\\Mikrotik\\Winbox\\winbox64.exe" />
                <Button type="button" variant="secondary" size="icon" onClick={() => browse('winbox_path')}><FolderOpen size={16} /></Button>
              </div>
              <Detected value={probe?.winbox} />
            </label>
            <label>
              <Label>Default connection port</Label>
              <Input type="number" min={1} max={65535} value={form.winbox_port} onChange={(e) => setForm({ ...form, winbox_port: e.target.value })} />
              <span className="mt-1.5 block text-[10px] text-[rgb(var(--muted))]">A port set on an individual device overrides this value.</span>
            </label>
          </CardContent>
        </Card>
      </div>

      <ConnectionMethodMatrix settings={settings} onSaved={onSaved} />

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save device tool settings'}</Button>
        <p className="text-[11px] text-[rgb(var(--muted))]">Credential assignment now lives in the <b>Credentials</b> tab.</p>
      </div>
    </div>
  )
}
