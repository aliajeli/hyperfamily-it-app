'use client'

import { useEffect, useState } from 'react'
import { SlidersHorizontal, KeyRound, MonitorCog, Shield, Palette } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import GeneralSettings from '@/components/settings/GeneralSettings'
import CredentialsSettings from '@/components/settings/CredentialsSettings'
import DeviceSettings from '@/components/settings/DeviceSettings'
import VPNSettings from '@/components/settings/VPNSettings'
import ThemeSettings from '@/components/settings/ThemeSettings'
import { Card, Skeleton, Tabs, TabsContent } from '@/components/ui'
import { getApi } from '@/lib/api'
import { DEFAULT_SETTINGS } from '@/lib/constants'

const tabs = [
  { value: 'general', label: 'General', icon: <SlidersHorizontal size={16} /> },
  { value: 'credentials', label: 'Credentials', icon: <KeyRound size={16} /> },
  { value: 'devices', label: 'Device tools', icon: <MonitorCog size={16} /> },
  { value: 'vpn', label: 'VPN', icon: <Shield size={16} /> },
  { value: 'theme', label: 'Theme', icon: <Palette size={16} /> }
]

export default function SettingsPage() {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState(null)
  useEffect(() => { getApi().settings.get().then((value) => setSettings({ ...DEFAULT_SETTINGS, ...value })).catch((e) => toast.error(e.message)) }, [])
  return <AppShell><div className="mx-auto max-w-[1600px] space-y-3"><div><h1 className="page-title">Application settings</h1><p className="page-subtitle">Security, monitoring intervals, remote tools, VPN profiles, and appearance.</p></div>{!settings ? <Skeleton className="h-[520px]" /> : <Card className="p-3.5"><Tabs value={tab} onValueChange={setTab} tabs={tabs}><TabsContent value="general"><GeneralSettings settings={settings} onSaved={setSettings} /></TabsContent><TabsContent value="credentials"><CredentialsSettings /></TabsContent><TabsContent value="devices"><DeviceSettings settings={settings} onSaved={setSettings} /></TabsContent><TabsContent value="vpn"><VPNSettings settings={settings} onSaved={setSettings} /></TabsContent><TabsContent value="theme"><ThemeSettings settings={settings} onSaved={setSettings} /></TabsContent></Tabs></Card>}</div></AppShell>
}
