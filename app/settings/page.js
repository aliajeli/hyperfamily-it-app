'use client'

import { useEffect, useState } from 'react'
import { SlidersHorizontal, KeyRound, MonitorCog, Shield, Palette, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import GeneralSettings from '@/components/settings/GeneralSettings'
import CredentialsSettings from '@/components/settings/CredentialsSettings'
import DeviceSettings from '@/components/settings/DeviceSettings'
import VPNSettings from '@/components/settings/VPNSettings'
import RemoteSettings from '@/components/settings/RemoteSettings'
import ThemeSettings from '@/components/settings/ThemeSettings'
import { Card, Skeleton, Tabs, TabsContent } from '@/components/ui'
import { getApi } from '@/lib/api'
import { DEFAULT_SETTINGS } from '@/lib/constants'

const tabs = [
  { value: 'general', label: 'General', icon: <SlidersHorizontal size={14} /> },
  { value: 'credentials', label: 'Credentials', icon: <KeyRound size={14} /> },
  { value: 'devices', label: 'Device tools', icon: <MonitorCog size={14} /> },
  { value: 'vpn', label: 'VPN', icon: <Shield size={14} /> },
  { value: 'remote', label: 'Remote', icon: <MonitorSmartphone size={14} /> },
  { value: 'theme', label: 'Theme', icon: <Palette size={14} /> }
]

export default function SettingsPage() {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    getApi().settings.get()
      .then((value) => setSettings({ ...DEFAULT_SETTINGS, ...value }))
      .catch((error) => toast.error(error.message))
  }, [])

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <div>
          <h1 className="page-title">Application settings</h1>
          <p className="page-subtitle">Security, monitoring intervals, remote tools, VPN profiles, and appearance.</p>
        </div>

        {!settings ? (
          <Skeleton className="h-[520px]" />
        ) : (
          /* The tab strip lives outside the panel so the active tab reads as a
             header for the card below it rather than a control inside it. */
          <Tabs value={tab} onValueChange={setTab} tabs={tabs} listClassName="mb-2.5 w-fit max-w-full">
            <Card className="p-3">
              <TabsContent value="general"><GeneralSettings settings={settings} onSaved={setSettings} /></TabsContent>
              <TabsContent value="credentials"><CredentialsSettings /></TabsContent>
              <TabsContent value="devices"><DeviceSettings settings={settings} onSaved={setSettings} /></TabsContent>
              <TabsContent value="vpn"><VPNSettings settings={settings} onSaved={setSettings} /></TabsContent>
              <TabsContent value="remote"><RemoteSettings settings={settings} onSaved={setSettings} /></TabsContent>
              <TabsContent value="theme"><ThemeSettings settings={settings} onSaved={setSettings} /></TabsContent>
            </Card>
          </Tabs>
        )}
      </div>
    </AppShell>
  )
}
