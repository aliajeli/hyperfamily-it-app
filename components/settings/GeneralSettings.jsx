'use client'

import { useState } from 'react'
import { Activity, ShieldCheck, UserRoundCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label } from '@/components/ui'
import { getApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useSettingsStore } from '@/stores/settings.store'

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

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card>
        <CardHeader className="p-3 pb-1.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-nord-15/15 p-2 text-nord-15"><UserRoundCog size={16} /></div>
            <div>
              <CardTitle className="text-sm">Administrator account</CardTitle>
              <CardDescription className="mt-0.5 text-[11px] leading-snug">Change the login username, password, or both. Your current password is always required.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-1.5">
          <form onSubmit={updateAccount} className="space-y-2.5">
            {/* Paired into two rows so the card fits a 768px-tall screen. */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="min-w-0">
                <Label>Login username</Label>
                <Input autoComplete="username" minLength={3} maxLength={64} required value={account.newUsername} onChange={(event) => setAccount({ ...account, newUsername: event.target.value })} />
              </label>
              <label className="min-w-0">
                <Label>Current password</Label>
                <Input type="password" autoComplete="current-password" required value={account.currentPassword} onChange={(event) => setAccount({ ...account, currentPassword: event.target.value })} />
              </label>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="min-w-0">
                <Label>New password (optional)</Label>
                <Input type="password" autoComplete="new-password" minLength={account.newPassword ? 4 : undefined} value={account.newPassword} onChange={(event) => setAccount({ ...account, newPassword: event.target.value })} />
              </label>
              <label className="min-w-0">
                <Label>Confirm new password</Label>
                <Input type="password" autoComplete="new-password" value={account.confirmPassword} onChange={(event) => setAccount({ ...account, confirmPassword: event.target.value })} />
              </label>
            </div>
            <p className="text-[9.5px] leading-snug text-[rgb(var(--muted))]">The username is required at the next login. Leave the password blank to keep the current one; a longer passphrase is recommended.</p>
            <Button disabled={busy === 'account'}>{busy === 'account' ? 'Updating account…' : 'Update account'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-1.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-nord-8/15 p-2 text-nord-10"><Activity size={16} /></div>
            <div>
              <CardTitle className="text-sm">Real-time monitoring</CardTitle>
              <CardDescription className="mt-0.5 text-[11px] leading-snug">Balance freshness with traffic across monitored networks.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-1.5">
          <div className="mb-2.5 flex gap-2 rounded-lg border border-nord-14/35 bg-nord-14/10 p-2 text-[10.5px] leading-snug">
            <ShieldCheck className="status-online-text mt-0.5 shrink-0" size={14} />
            <p><b>Healthy threshold:</b> Ping responses up to and including 300 ms are classified as online. Higher responses show a warning.</p>
          </div>
          <form onSubmit={savePing} className="space-y-2.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="min-w-0">
                <Label>Ping interval (seconds)</Label>
                <Input type="number" min={1} max={60} value={ping.ping_interval} onChange={(event) => setPing({ ...ping, ping_interval: event.target.value })} />
                <p className="mt-0.5 text-[9.5px] leading-snug text-[rgb(var(--muted))]">1–60 seconds. Default: 3.</p>
              </label>
              <label className="min-w-0">
                <Label>Chart history points</Label>
                <Input type="number" min={10} max={100} value={ping.ping_history_count} onChange={(event) => setPing({ ...ping, ping_history_count: event.target.value })} />
                <p className="mt-0.5 text-[9.5px] leading-snug text-[rgb(var(--muted))]">10–100 responses. Default: 30.</p>
              </label>
            </div>
            <Button disabled={busy === 'ping'}>{busy === 'ping' ? 'Saving…' : 'Save monitoring settings'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
