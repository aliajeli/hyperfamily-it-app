'use client'

import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Monitor, Eye, Box, Globe, Terminal, ChevronRight, KeyRound, MoreVertical, LoaderCircle } from 'lucide-react'
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

export default function DeviceActionsMenu({ device }) {
  const [open, setOpen] = useState(false)
  const [credentials, setCredentials] = useState([])
  const [mappings, setMappings] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleOpenChange = async (nextOpen) => {
    setOpen(nextOpen)
    if (!nextOpen || loaded || loading) return

    setLoading(true)
    try {
      const [credentialList, credentialMappings] = await Promise.all([
        getApi().credentials.list(),
        getApi().credentials.mappings()
      ])
      setCredentials(credentialList)
      setMappings(credentialMappings)
      setLoaded(true)
    } catch {
      setCredentials([])
      setMappings({})
    } finally {
      setLoading(false)
    }
  }

  const connect = async (method, credentialId = null) => {
    try {
      await getApi().remote.connect({ method, deviceId: device.id, credentialId })
      toast.success(`${method === 'browser' ? 'Browser' : method} launched for ${device.name || device.ip}`)
    } catch (error) {
      toast.error(error.message || 'Unable to open the connection')
    }
  }

  const mappedIds = mappings[device.device_type] || []
  const mapped = credentials.filter((item) => mappedIds.includes(item.id))
  const available = methods.filter((method) => method.types.includes(device.device_type))

  return (
    <DropdownMenu.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[rgb(var(--muted)/.65)] transition hover:bg-[rgb(var(--border)/.65)] hover:text-[rgb(var(--text))] data-[state=open]:bg-[rgb(var(--primary)/.12)] data-[state=open]:text-[rgb(var(--primary))]"
          aria-label={`Connection options for ${device.name || device.ip}`}
          title="Connection options"
        >
          <MoreVertical size={12} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuClass} align="end" sideOffset={6} collisionPadding={10}>
          <div className="px-3 pb-2 pt-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">Connect to</p>
            <p className="mt-0.5 max-w-48 truncate text-xs font-extrabold">{device.name || device.device_type}</p>
            <p className="font-mono text-[9px] text-[rgb(var(--muted))]">{device.ip}{device.port ? `:${device.port}` : ''}</p>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-[rgb(var(--border))]" />

          {available.map((method) => {
            const Icon = method.icon
            const supportsCredentials = ['rdp', 'winbox', 'browser', 'termius'].includes(method.id)

            if (mapped.length > 0 && supportsCredentials) {
              return (
                <DropdownMenu.Sub key={method.id}>
                  <DropdownMenu.SubTrigger className={itemClass}>
                    <Icon size={15} />
                    {method.label}
                    <ChevronRight className="ml-auto" size={13} />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className={menuClass} sideOffset={5} collisionPadding={10}>
                      {mapped.map((credential) => (
                        <DropdownMenu.Item key={credential.id} className={itemClass} onSelect={() => connect(method.id, credential.id)}>
                          <KeyRound size={13} />
                          <span className="max-w-28 truncate">{credential.name}</span>
                          <span className="ml-auto max-w-20 truncate text-[9px] text-[rgb(var(--muted))]">{credential.username}</span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )
            }

            return (
              <DropdownMenu.Item key={method.id} className={itemClass} onSelect={() => connect(method.id)}>
                <Icon size={15} />
                {method.label}
              </DropdownMenu.Item>
            )
          })}

          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-[rgb(var(--muted))]">
              <LoaderCircle size={12} className="animate-spin" /> Loading saved credentials…
            </div>
          )}

          {available.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-[rgb(var(--muted))]">No remote method for this device type</div>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-[rgb(var(--border))]" />
          <div className="px-3 py-1 text-[8px] text-[rgb(var(--muted))]">Select a connection method. The action is saved in Audit Logs.</div>
          <DropdownMenu.Arrow className="fill-[rgb(var(--surface))]" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
