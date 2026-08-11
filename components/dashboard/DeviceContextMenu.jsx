'use client'

import { useEffect, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Monitor, Eye, Box, Globe, Terminal, ChevronRight, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'

const methods = [
  { id: 'rdp', label: 'Remote Desktop', icon: Monitor, types: ['Server', 'Client', 'Checkout'] },
  { id: 'teamviewer', label: 'TeamViewer', icon: Eye, types: ['Server', 'Client', 'Checkout', 'POS'] },
  { id: 'winbox', label: 'Winbox', icon: Box, types: ['Router'] },
  { id: 'browser', label: 'Open in browser', icon: Globe, types: ['Router', 'Switch', 'iLO', 'NVR', 'AccessPoint', 'Scale', 'POS'] },
  { id: 'termius', label: 'Termius SSH', icon: Terminal, types: ['Router', 'Switch', 'Server'] }
]

const menuClass = 'glass z-50 min-w-56 rounded-xl p-1.5 shadow-xl'
const itemClass = 'flex cursor-default select-none items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold outline-none data-[highlighted]:bg-[rgb(var(--border)/.55)]'

export default function DeviceContextMenu({ device, children }) {
  const [credentials, setCredentials] = useState([])
  const [mappings, setMappings] = useState({})
  useEffect(() => { Promise.all([getApi().credentials.list(), getApi().credentials.mappings()]).then(([c, m]) => { setCredentials(c); setMappings(m) }).catch(() => {}) }, [])

  const connect = async (method, credentialId = null) => {
    try {
      await getApi().remote.connect({ method, deviceId: device.id, credentialId })
      toast.success(`${method === 'browser' ? 'Browser' : method} launched for ${device.name || device.ip}`)
    } catch (error) { toast.error(error.message) }
  }

  const mappedIds = mappings[device.device_type] || []
  const mapped = credentials.filter((item) => mappedIds.includes(item.id))
  const available = methods.filter((method) => method.types.includes(device.device_type))

  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content className={menuClass}>
      <div className="px-3 py-2"><p className="truncate text-xs font-extrabold">{device.name || device.device_type}</p><p className="font-mono text-[10px] text-[rgb(var(--muted))]">{device.ip}</p></div>
      <ContextMenu.Separator className="my-1 h-px bg-[rgb(var(--border))]" />
      {available.map((method) => {
        const Icon = method.icon
        if (mapped.length > 0 && ['rdp', 'winbox', 'browser', 'termius'].includes(method.id)) return <ContextMenu.Sub key={method.id}>
          <ContextMenu.SubTrigger className={itemClass}><Icon size={16} />{method.label}<ChevronRight className="ml-auto" size={14} /></ContextMenu.SubTrigger>
          <ContextMenu.Portal><ContextMenu.SubContent className={menuClass}>{mapped.map((credential) => <ContextMenu.Item key={credential.id} className={itemClass} onSelect={() => connect(method.id, credential.id)}><KeyRound size={14} />{credential.name}<span className="ml-auto text-[10px] text-[rgb(var(--muted))]">{credential.username}</span></ContextMenu.Item>)}</ContextMenu.SubContent></ContextMenu.Portal>
        </ContextMenu.Sub>
        return <ContextMenu.Item key={method.id} className={itemClass} onSelect={() => connect(method.id)}><Icon size={16} />{method.label}</ContextMenu.Item>
      })}
      {available.length === 0 && <div className="px-3 py-4 text-center text-xs text-[rgb(var(--muted))]">No remote method for this device type</div>}
      <ContextMenu.Separator className="my-1 h-px bg-[rgb(var(--border))]" />
      <div className="px-3 py-1.5 text-[9px] text-[rgb(var(--muted))]">Right-click actions are recorded in Audit Logs.</div>
    </ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>
}
