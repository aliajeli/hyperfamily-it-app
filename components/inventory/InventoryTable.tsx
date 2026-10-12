'use client'

import { useState } from 'react'
import {
  Boxes,
  Eye,
  EyeOff,
  X,
  Server,
  MapPin,
  Hash,
  Network,
  Info,
  HardDrive,
  User,
  Building2,
  Cpu,
  Monitor
} from 'lucide-react'
import { Badge, EmptyState, Button } from '@/components/ui'
import DeviceActionsMenu from '@/components/dashboard/DeviceActionsMenu'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'

const typeLabel = (type: any) => (type === 'AccessPoint' ? 'Access Point' : type)

function deviceTitle(device: any) {
  if (device.name) return device.name
  if (device.hostname) return device.hostname
  if (device.checkout_number) return `${typeLabel(device.device_type)} ${device.checkout_number}`
  return device.model || typeLabel(device.device_type)
}

function connectionDetails(device: any) {
  const details: any[] = []
  if (device.connection_type) details.push(device.connection_type)
  if (device.connection_port) details.push(`Port ${device.connection_port}`)
  if (device.device_type === 'Switch') details.push(`${device.switch_ports?.length || 0} ports`)
  return details
}

const columns = [
  { key: 'branch', label: 'Branch', width: '13%' },
  { key: 'type', label: 'Type', width: '9%' },
  { key: 'device', label: 'Device', width: '15%' },
  { key: 'ip', label: 'IP', width: '10%' },
  { key: 'model', label: 'Model / version', width: '12%' },
  { key: 'location', label: 'Location', width: '7%' },
  { key: 'asset', label: 'Asset / serial', width: '12%' },
  { key: 'connection', label: 'Connection', width: '9%' },
  { key: 'status', label: 'Status', width: '10%' },
  { key: 'actions', label: '', width: '3%' }
]

function DetailRow({ icon: Icon, label, value }: any) {
  if (!value) return null
  return (
    <div className="flex gap-2.5 rounded-lg bg-[rgb(var(--canvas)/.6)] px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]">
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-bold uppercase tracking-wider text-[rgb(var(--muted))]">{label}</p>
        <p className="mt-0.5 break-words text-xs font-medium">{String(value)}</p>
      </div>
    </div>
  )
}

function InventoryDetailsDialog({ device, open, onOpenChange }: any) {
  if (!device) return null
  const title = deviceTitle(device)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[70] bg-nord-0/55 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="dialog-content fixed left-1/2 top-1/2 z-[80] max-h-[85vh] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border bg-[rgb(var(--surface))] shadow-2xl outline-none"
              >
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]">
                      <Server size={16} />
                    </span>
                    <div className="min-w-0">
                      <DialogPrimitive.Title className="truncate text-sm font-black">
                        {title}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="truncate text-2xs text-[rgb(var(--muted))]">
                        {typeLabel(device.device_type)} • {device.ip}
                        {device.port ? `:${device.port}` : ''}
                      </DialogPrimitive.Description>
                    </div>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-[rgb(var(--muted))] hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]">
                      <X size={16} />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(85vh - 60px)' }}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DetailRow
                      icon={Building2}
                      label="Branch"
                      value={`${device.branch_name} (${device.branch_code})`}
                    />
                    <DetailRow icon={Hash} label="Warehouse Code" value={device.branch_warehouse_code} />
                    <DetailRow
                      icon={Network}
                      label="IP Address"
                      value={`${device.ip}${device.port ? `:${device.port}` : ''}`}
                    />
                    <DetailRow
                      icon={Info}
                      label="Status"
                      value={`${device.status || 'unknown'} ${device.ping_time ? `(${device.ping_time} ms)` : ''}`}
                    />
                    <DetailRow icon={Cpu} label="Model" value={device.model} />
                    <DetailRow icon={MapPin} label="Location" value={device.location} />
                    <DetailRow icon={Hash} label="Asset Code" value={device.asset_code} />
                    <DetailRow icon={HardDrive} label="Serial Number" value={device.serial_number} />
                    <DetailRow icon={Server} label="Hostname" value={device.hostname} />
                    <DetailRow
                      icon={User}
                      label="User / Domain"
                      value={
                        device.user ? `${device.domain ? device.domain + '\\' : ''}${device.user}` : null
                      }
                    />
                    <DetailRow
                      icon={Monitor}
                      label="Connection"
                      value={connectionDetails(device).join(' • ')}
                    />
                    <DetailRow icon={Hash} label="Checkout Number" value={device.checkout_number} />
                    <DetailRow icon={Info} label="Brand" value={device.brand} />
                    <DetailRow icon={Hash} label="Terminal ID" value={device.terminal_id} />
                    <DetailRow icon={Hash} label="Acceptance ID" value={device.acceptance_id} />
                    <DetailRow icon={Info} label="ESXi Version" value={device.esxi_version} />
                    <DetailRow icon={Info} label="Version" value={device.version} />
                    <DetailRow icon={Info} label="Protocol" value={device.protocol} />
                    <DetailRow
                      icon={Eye}
                      label="Dashboard Visible"
                      value={device.is_dashboard_visible ? 'Yes' : 'No'}
                    />
                  </div>

                  {device.device_type === 'Switch' &&
                    Array.isArray(device.switch_ports) &&
                    device.switch_ports.length > 0 && (
                      <div className="mt-4">
                        <h3 className="mb-2 text-xs font-black uppercase tracking-wider">
                          Switch Ports ({device.switch_ports.length})
                        </h3>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {device.switch_ports.map((port: any) => (
                            <div
                              key={port.id || port.port_number}
                              className="rounded-lg border bg-[rgb(var(--canvas)/.5)] px-2.5 py-2"
                            >
                              <p className="text-xs font-bold">
                                Port {port.port_number} {port.vlan ? `• VLAN ${port.vlan}` : ''} •{' '}
                                {port.status || 'up'}
                              </p>
                              {port.ip && <p className="text-2xs text-[rgb(var(--muted))]">IP: {port.ip}</p>}
                              {port.details && (
                                <p className="text-2xs text-[rgb(var(--muted))]">{port.details}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {device.history && device.history.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-wider">
                        Recent Ping History
                      </h3>
                      <div className="flex gap-1 overflow-x-auto pb-1">
                        {device.history.slice(-20).map((h: any, i: number) => (
                          <div
                            key={i}
                            className={`h-8 w-2 shrink-0 rounded-full ${h.status === 'online' ? 'bg-nord-14' : h.status === 'warning' ? 'bg-nord-13' : 'bg-nord-11'}`}
                            title={`${h.ping_time ?? 'offline'} ms • ${h.status}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t bg-[rgb(var(--canvas)/.4)] px-4 py-3">
                  <DialogPrimitive.Close asChild>
                    <Button variant="secondary" size="sm">
                      Close
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

export default function InventoryTable({ devices }: any) {
  const [selected, setSelected] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const handleSelect = (device: any) => {
    setSelected(device)
    setOpen(true)
  }

  if (!devices.length)
    return (
      <EmptyState
        icon={<Boxes />}
        title="No matching assets"
        description="Change the active filters or add devices to your branch directory."
      />
    )

  return (
    <>
      <div className="hidden w-full md:block">
        <table className="w-full table-fixed text-left text-2xs">
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-14 z-10 bg-[rgb(var(--surface))]">
            <tr className="border-b text-xs uppercase tracking-wider text-[rgb(var(--muted))]">
              {columns.map((column) => (
                <th key={column.key} className={`px-2 py-2 ${column.key === 'actions' ? 'text-right' : ''}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((device: any) => {
              const connection = connectionDetails(device)
              const title = deviceTitle(device)
              return (
                <tr
                  key={device.id}
                  onClick={() => handleSelect(device)}
                  className="cursor-pointer border-b align-top last:border-0 hover:bg-[rgb(var(--border)/.22)]"
                >
                  <td className="px-2 py-1.5">
                    <b className="block truncate" title={device.branch_name}>
                      {device.branch_name}
                    </b>
                    <p className="truncate font-mono text-xs text-[rgb(var(--muted))]">
                      {device.branch_code}
                      {device.branch_warehouse_code ? ` · WH ${device.branch_warehouse_code}` : ''}
                    </p>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block max-w-full truncate rounded-md bg-[rgb(var(--primary)/.1)] px-1.5 py-0.5 text-xs font-bold text-[rgb(var(--primary))]">
                      {typeLabel(device.device_type)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <b className="block truncate" title={title}>
                      {title}
                    </b>
                    {device.hostname && device.hostname !== title && (
                      <p className="truncate font-mono text-xs text-[rgb(var(--muted))]">{device.hostname}</p>
                    )}
                    {device.user && (
                      <p className="truncate text-xs text-[rgb(var(--muted))]">
                        {device.domain ? `${device.domain}\\` : ''}
                        {device.user}
                      </p>
                    )}
                  </td>
                  <td className="truncate px-2 py-1.5 font-mono" title={device.ip}>
                    {device.ip}
                    {device.port ? `:${device.port}` : ''}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate" title={device.model || ''}>
                      {device.model || '—'}
                    </span>
                    {device.esxi_version && (
                      <p className="truncate text-xs text-[rgb(var(--muted))]">ESXI {device.esxi_version}</p>
                    )}
                    {device.version && (
                      <p className="truncate text-xs text-[rgb(var(--muted))]">SW {device.version}</p>
                    )}
                  </td>
                  <td className="truncate px-2 py-1.5" title={device.location || ''}>
                    {device.location || '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate font-mono" title={device.asset_code || ''}>
                      {device.asset_code || '—'}
                    </span>
                    {device.serial_number && (
                      <p className="truncate text-xs text-[rgb(var(--muted))]">SN {device.serial_number}</p>
                    )}
                    {device.terminal_id && (
                      <p className="truncate text-xs text-[rgb(var(--muted))]">Term {device.terminal_id}</p>
                    )}
                    {device.acceptance_id && (
                      <p className="truncate text-xs text-[rgb(var(--muted))]">Acc {device.acceptance_id}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {connection.length
                      ? connection.map((detail: any) => (
                          <p key={detail} className="truncate" title={detail}>
                            {detail}
                          </p>
                        ))
                      : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        status={device.status || 'unknown'}
                        className="whitespace-nowrap px-1.5 py-0.5 text-xs capitalize"
                      >
                        {device.status || 'unknown'}
                      </Badge>
                      <span
                        className={
                          device.is_dashboard_visible ? 'status-online-text' : 'text-[rgb(var(--muted))]'
                        }
                        title={
                          device.is_dashboard_visible ? 'Shown on the dashboard' : 'Hidden from the dashboard'
                        }
                      >
                        {device.is_dashboard_visible ? <Eye size={11} /> : <EyeOff size={11} />}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <DeviceActionsMenu device={device} size={14} className="h-7 w-7" />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <InventoryCards devices={devices} onSelect={handleSelect} />

      <InventoryDetailsDialog device={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function InventoryCards({ devices, onSelect }: any) {
  const [selected, setSelected] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const handle =
    onSelect ||
    ((d: any) => {
      setSelected(d)
      setOpen(true)
    })

  if (!devices.length)
    return (
      <EmptyState
        icon={<Boxes />}
        title="No matching assets"
        description="Change the active filters or add devices to your branch directory."
      />
    )

  return (
    <>
      <ul className="space-y-1.5 p-2 md:hidden">
        {devices.map((device: any) => {
          const title = deviceTitle(device)
          const connection = connectionDetails(device)
          return (
            <li
              key={device.id}
              onClick={() => handle(device)}
              className="cursor-pointer rounded-xl border bg-[rgb(var(--surface)/.7)] p-3 shadow-sm transition hover:border-[rgb(var(--primary)/.3)]"
            >
              <div className="flex items-center gap-2">
                <span className="inline-block shrink-0 rounded-md bg-[rgb(var(--primary)/.1)] px-1.5 py-0.5 text-xs font-bold text-[rgb(var(--primary))]">
                  {typeLabel(device.device_type)}
                </span>
                <b className="min-w-0 flex-1 truncate text-xs" title={title}>
                  {title}
                </b>
                <Badge
                  status={device.status || 'unknown'}
                  className="shrink-0 whitespace-nowrap px-1.5 py-0.5 text-xs capitalize"
                >
                  {device.status || 'unknown'}
                </Badge>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <span className="truncate text-[rgb(var(--muted))]" title={device.branch_name}>
                  {device.branch_name}
                  {device.branch_code ? ` · ${device.branch_code}` : ''}
                </span>
                <span className="truncate font-mono" title={device.ip}>
                  {device.ip}
                  {device.port ? `:${device.port}` : ''}
                </span>
                <span className="truncate text-[rgb(var(--muted))]" title={device.model || ''}>
                  {device.model || '—'}
                </span>
                <span className="truncate text-[rgb(var(--muted))]" title={device.location || ''}>
                  {device.location || '—'}
                </span>
                <span className="truncate font-mono text-[rgb(var(--muted))]" title={device.asset_code || ''}>
                  {device.asset_code || ''}
                </span>
                <span className="truncate text-[rgb(var(--muted))]">{connection.join(' • ') || ''}</span>
              </div>
            </li>
          )
        })}
      </ul>
      {!onSelect && <InventoryDetailsDialog device={selected} open={open} onOpenChange={setOpen} />}
    </>
  )
}
