'use client'

import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Monitor, Eye, Box, Globe, Terminal, ChevronRight, KeyRound, MoreVertical, LoaderCircle, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'

const methods = [
  { id: 'guacamole', label: 'Remote session', icon: MonitorSmartphone, types: ['Server', 'Client', 'Checkout', 'POS', 'Router', 'Switch'] },
  { id: 'rdp', label: 'Remote Desktop', icon: Monitor, types: ['Server', 'Client', 'Checkout'] },
  { id: 'teamviewer', label: 'TeamViewer (LAN)', icon: Eye, types: ['Server', 'Client', 'Checkout', 'POS'] },
  { id: 'winbox', label: 'Winbox', icon: Box, types: ['Router'] },
  { id: 'browser', label: 'Open in browser', icon: Globe, types: ['Router', 'Switch', 'iLO', 'NVR', 'AccessPoint', 'Scale', 'POS'] },
  { id: 'termius', label: 'Termius SSH', icon: Terminal, types: ['Router', 'Switch', 'Server'] }
]

const CREDENTIAL_METHODS = ['guacamole', 'rdp', 'winbox', 'browser', 'termius']
const PALETTE_KEYS = ['canvas', 'surface', 'border', 'text', 'muted', 'primary', 'danger', 'success']

const menuClass = 'glass z-50 min-w-56 rounded-xl p-1.5 shadow-xl'
const itemClass = 'flex cursor-default select-none items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold outline-none data-[highlighted]:bg-[rgb(var(--border)/.55)]'

/** Hands the remote-session window the palette of the active theme. */
function currentPalette() {
  if (typeof window === 'undefined') return {}
  const styles = window.getComputedStyle(document.documentElement)
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => [key, styles.getPropertyValue(`--${key}`).trim()]).filter(([, value]) => value)
  )
}

export default function DeviceActionsMenu({ device, size = 12, className = '' }) {
  const [open, setOpen] = useState(false)
  const [credentials, setCredentials] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)

  const handleOpenChange = async (nextOpen) => {
    setOpen(nextOpen)
    if (!nextOpen || loaded || loading) return

    setLoading(true)
    try {
      // Resolves device-level assignments first, then type-level ones.
      const list = await getApi().credentials.forDevice(device.id)
      setCredentials(Array.isArray(list) ? list : [])
      setLoaded(true)
    } catch {
      setCredentials([])
    } finally {
      setLoading(false)
    }
  }

  const connect = async (method, credentialId = null) => {
    setBusy(method)
    try {
      await getApi().remote.connect({ method, deviceId: device.id, credentialId, palette: currentPalette() })
      const label = method === 'guacamole' ? 'Remote session' : method === 'browser' ? 'Browser' : method
      toast.success(`${label} launched for ${device.name || device.ip}`)
    } catch (error) {
      toast.error(error.message || 'Unable to open the connection')
    } finally {
      setBusy(null)
    }
  }

  const available = methods.filter((method) => method.types.includes(device.device_type))

  return (
    <DropdownMenu.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={`grid shrink-0 place-items-center rounded-md text-[rgb(var(--muted)/.65)] transition hover:bg-[rgb(var(--border)/.65)] hover:text-[rgb(var(--text))] data-[state=open]:bg-[rgb(var(--primary)/.12)] data-[state=open]:text-[rgb(var(--primary))] ${className || 'h-5 w-5'}`}
          aria-label={`Connection options for ${device.name || device.ip}`}
          title="Connection options"
        >
          {busy ? <LoaderCircle size={size} className="animate-spin" /> : <MoreVertical size={size} />}
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
            const supportsCredentials = CREDENTIAL_METHODS.includes(method.id)

            if (credentials.length > 0 && supportsCredentials) {
              return (
                <DropdownMenu.Sub key={method.id}>
                  <DropdownMenu.SubTrigger className={itemClass}>
                    <Icon size={15} />
                    {method.label}
                    <ChevronRight className="ml-auto" size={13} />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className={menuClass} sideOffset={5} collisionPadding={10}>
                      <DropdownMenu.Item className={itemClass} onSelect={() => connect(method.id)}>
                        <KeyRound size={13} />
                        <span>Assigned credential</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="my-1 h-px bg-[rgb(var(--border))]" />
                      {credentials.map((credential) => (
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
              <LoaderCircle size={12} className="animate-spin" /> Loading assigned credentials…
            </div>
          )}

          {!loading && loaded && credentials.length === 0 && available.length > 0 && (
            <div className="px-3 py-1.5 text-[9px] leading-relaxed text-[rgb(var(--muted))]">
              No credential is assigned to this device. Assign one in Settings → Credentials.
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
