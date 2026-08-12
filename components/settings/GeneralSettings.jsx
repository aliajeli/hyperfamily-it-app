'use client'

import { useState } from 'react'
import { Activity, Check, LayoutDashboard, Maximize2, PanelRightOpen, Rows3, ShieldCheck, UserRoundCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label } from '@/components/ui'
import { getApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useSettingsStore } from '@/stores/settings.store'

const branchModes = [
  {
    value: 'compact_over_four',
    icon: Rows3,
    title: 'Compact after four branches',
    description: 'Show equipment inside cards for up to four branches. With more branches, cards show only the Router chart.'
  },
  {
    value: 'always_compact',
    icon: LayoutDashboard,
    title: 'Always compact',
    description: 'Every branch card always shows only its Router chart. Select the branch title to see equipment.'
  }
]

const detailViews = [
  {
    value: 'modal',
    icon: Maximize2,
    title: 'Large popup',
    description: 'Open branch equipment in a spacious centered panel.'
  },
  {
    value: 'side_panel',
    icon: PanelRightOpen,
    title: 'Side panel',
    description: 'Slide branch equipment in from the right side.'
  }
]

function Choice({ selected, icon: Icon, title, description, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${selected ? 'border-[rgb(var(--primary)/.55)] bg-[rgb(var(--primary)/.09)] shadow-md shadow-black/5' : 'bg-[rgb(var(--surface)/.48)] hover:border-[rgb(var(--primary)/.3)] hover:bg-[rgb(var(--surface)/.8)]'}`}>
      <span aria-hidden="true" className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[rgb(var(--primary)/.1)] blur-2xl transition-transform duration-500 group-hover:scale-150" />
      <div className="relative flex items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all duration-300 group-hover:rotate-[-5deg] group-hover:scale-105 ${selected ? 'bg-[rgb(var(--primary))] text-white shadow-md' : 'bg-[rgb(var(--border)/.5)] text-[rgb(var(--muted))]'}`}><Icon size={17} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold tracking-[0.025em]">{title}</p>
          <p className="mt-1 text-[10px] leading-4 text-[rgb(var(--muted))]">{description}</p>
        </div>
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-300 ${selected ? 'scale-100 border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white' : 'scale-90 text-transparent'}`}><Check size={12} strokeWidth={3} /></span>
      </div>
    </button>
  )
}

export default function GeneralSettings({ settings, onSaved }) {
  const { user, updateUser } = useAuthStore()
  const setGlobalSettings = useSettingsStore((state) => state.setSettings)
  const [account, setAccount] = useState({
    newUsername: user?.username || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [ping, setPing] = useState({
    ping_interval: settings.ping_interval || 3,
    ping_history_count: settings.ping_history_count || 30
  })
  const [dashboard, setDashboard] = useState({
    dashboard_branch_mode: settings.dashboard_branch_mode === 'always_compact' ? 'always_compact' : 'compact_over_four',
    dashboard_branch_details_view: settings.dashboard_branch_details_view === 'side_panel' ? 'side_panel' : 'modal'
  })
  const [busy, setBusy] = useState('')

  const finishSettingsSave = (next) => {
    onSaved(next)
    setGlobalSettings(next)
  }

  const updateAccount = async (event) => {
    event.preventDefault()
    const username = account.newUsername.trim()
    if (username.length < 3 || username.length > 64) return toast.error('Username must contain between 3 and 64 characters')
    if (account.newPassword && account.newPassword.length < 4) return toast.error('New password must contain at least 4 characters')
    if (account.newPassword !== account.confirmPassword) return toast.error('New passwords do not match')

    setBusy('account')
    try {
      const updatedUser = await getApi().auth.updateCredentials({
        currentPassword: account.currentPassword,
        newUsername: username,
        newPassword: account.newPassword
      })
      updateUser(updatedUser)
      setAccount({ newUsername: updatedUser.username, currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Administrator account updated')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  const savePing = async (event) => {
    event.preventDefault()
    const normalized = {
      ping_interval: Math.min(60, Math.max(1, Number(ping.ping_interval))),
      ping_history_count: Math.min(100, Math.max(10, Number(ping.ping_history_count)))
    }
    setBusy('ping')
    try {
      const next = await getApi().settings.save(normalized)
      setPing(normalized)
      finishSettingsSave(next)
      toast.success('Ping settings saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  const saveDashboard = async (event) => {
    event.preventDefault()
    setBusy('dashboard')
    try {
      const next = await getApi().settings.save(dashboard)
      finishSettingsSave(next)
      toast.success('Dashboard display settings saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-nord-15/15 p-2.5 text-nord-15"><UserRoundCog size={19} /></div>
            <div>
              <CardTitle>Administrator account</CardTitle>
              <CardDescription>Change the login username, password, or both. Your current password is always required.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={updateAccount} className="space-y-4">
            <label>
              <Label>Login username</Label>
              <Input autoComplete="username" minLength={3} maxLength={64} required value={account.newUsername} onChange={(event) => setAccount({ ...account, newUsername: event.target.value })} />
              <p className="mt-1 text-[10px] text-[rgb(var(--muted))]">This username will be required at the next login.</p>
            </label>
            <label>
              <Label>Current password</Label>
              <Input type="password" autoComplete="current-password" required value={account.currentPassword} onChange={(event) => setAccount({ ...account, currentPassword: event.target.value })} />
            </label>
            <label>
              <Label>New password (optional)</Label>
              <Input type="password" autoComplete="new-password" minLength={account.newPassword ? 4 : undefined} value={account.newPassword} onChange={(event) => setAccount({ ...account, newPassword: event.target.value })} />
              <p className="mt-1 text-[10px] text-[rgb(var(--muted))]">Leave blank to keep the current password. A longer passphrase is recommended.</p>
            </label>
            <label>
              <Label>Confirm new password</Label>
              <Input type="password" autoComplete="new-password" value={account.confirmPassword} onChange={(event) => setAccount({ ...account, confirmPassword: event.target.value })} />
            </label>
            <Button disabled={busy === 'account'}>{busy === 'account' ? 'Updating account…' : 'Update account'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-nord-8/15 p-2.5 text-nord-10"><Activity size={19} /></div>
            <div>
              <CardTitle>Real-time monitoring</CardTitle>
              <CardDescription>Balance freshness with traffic across monitored networks.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2 rounded-xl border border-nord-14/35 bg-nord-14/10 p-3 text-xs">
            <ShieldCheck className="status-online-text mt-0.5 shrink-0" size={16} />
            <p><b>Healthy threshold:</b> Ping responses up to and including 300 ms are classified as online. Higher responses show a warning.</p>
          </div>
          <form onSubmit={savePing} className="space-y-4">
            <label>
              <Label>Ping interval (seconds)</Label>
              <Input type="number" min={1} max={60} value={ping.ping_interval} onChange={(event) => setPing({ ...ping, ping_interval: event.target.value })} />
              <p className="mt-1 text-[10px] text-[rgb(var(--muted))]">Between 1 and 60 seconds. Default: 3.</p>
            </label>
            <label>
              <Label>Chart history points</Label>
              <Input type="number" min={10} max={100} value={ping.ping_history_count} onChange={(event) => setPing({ ...ping, ping_history_count: event.target.value })} />
              <p className="mt-1 text-[10px] text-[rgb(var(--muted))]">Between 10 and 100 responses. Default: 30.</p>
            </label>
            <Button disabled={busy === 'ping'}>{busy === 'ping' ? 'Saving…' : 'Save monitoring settings'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[rgb(var(--primary)/.14)] p-2.5 text-[rgb(var(--primary))]"><LayoutDashboard size={19} /></div>
            <div>
              <CardTitle>Dashboard branch experience</CardTitle>
              <CardDescription>Choose when branch cards become compact and how their complete equipment view opens.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDashboard} className="space-y-5">
            <fieldset>
              <legend className="field-label">Branch card density</legend>
              <div className="grid gap-2.5 md:grid-cols-2">
                {branchModes.map((option) => <Choice key={option.value} {...option} selected={dashboard.dashboard_branch_mode === option.value} onClick={() => setDashboard({ ...dashboard, dashboard_branch_mode: option.value })} />)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">Equipment view style</legend>
              <div className="grid gap-2.5 md:grid-cols-2">
                {detailViews.map((option) => <Choice key={option.value} {...option} selected={dashboard.dashboard_branch_details_view === option.value} onClick={() => setDashboard({ ...dashboard, dashboard_branch_details_view: option.value })} />)}
              </div>
            </fieldset>
            <Button disabled={busy === 'dashboard'}>{busy === 'dashboard' ? 'Saving…' : 'Save Dashboard experience'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
