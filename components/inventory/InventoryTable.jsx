'use client'

import { Boxes, Eye, EyeOff } from 'lucide-react'
import { Badge, EmptyState } from '@/components/ui'

const typeLabel = (type) => type === 'AccessPoint' ? 'Access Point' : type

function deviceTitle(device) {
  if (device.name) return device.name
  if (device.hostname) return device.hostname
  if (device.checkout_number) return `${typeLabel(device.device_type)} ${device.checkout_number}`
  return device.model || typeLabel(device.device_type)
}

function connectionDetails(device) {
  const details = []
  if (device.connection_type) details.push(device.connection_type)
  if (device.connection_port) details.push(`Port ${device.connection_port}`)
  if (device.device_type === 'Switch') details.push(`${device.switch_ports?.length || 0} managed ports`)
  return details
}

export default function InventoryTable({ devices }) {
  if (!devices.length) return <EmptyState icon={<Boxes />} title="No matching assets" description="Change the active filters or add devices to your branch directory." />

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1380px] text-left text-xs">
        <thead className="sticky top-0 bg-[rgb(var(--surface))]">
          <tr className="border-b text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
            <th className="px-4 py-3">Branch</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Device</th>
            <th className="px-4 py-3">IP</th>
            <th className="px-4 py-3">Model / version</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Asset / serial</th>
            <th className="px-4 py-3">Connection</th>
            <th className="px-4 py-3">Dashboard</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const connection = connectionDetails(device)
            return (
              <tr key={device.id} className="border-b last:border-0 hover:bg-[rgb(var(--border)/.22)]">
                <td className="px-4 py-4"><b>{device.branch_name}</b><p className="mt-1 font-mono text-[9px] text-[rgb(var(--muted))]">{device.branch_code}{device.branch_warehouse_code ? ` · WH ${device.branch_warehouse_code}` : ''}</p></td>
                <td className="px-4 py-4"><span className="rounded-md bg-[rgb(var(--primary)/.1)] px-2 py-1 font-bold text-[rgb(var(--primary))]">{typeLabel(device.device_type)}</span></td>
                <td className="px-4 py-4"><b>{deviceTitle(device)}</b>{device.hostname && device.hostname !== deviceTitle(device) && <p className="mt-1 font-mono text-[9px] text-[rgb(var(--muted))]">{device.hostname}</p>}{device.user && <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">{device.domain ? `${device.domain}\\` : ''}{device.user}</p>}</td>
                <td className="px-4 py-4 font-mono">{device.ip}{device.port ? `:${device.port}` : ''}</td>
                <td className="px-4 py-4">{device.model || '—'}{device.esxi_version && <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">ESXI {device.esxi_version}</p>}{device.version && <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">Software {device.version}</p>}</td>
                <td className="px-4 py-4">{device.location || '—'}</td>
                <td className="px-4 py-4 font-mono">{device.asset_code || '—'}{device.serial_number && <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">SN {device.serial_number}</p>}{device.terminal_id && <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">Terminal {device.terminal_id}</p>}{device.acceptance_id && <p className="mt-1 text-[9px] text-[rgb(var(--muted))]">Acceptance {device.acceptance_id}</p>}</td>
                <td className="px-4 py-4">{connection.length ? connection.map((detail) => <p key={detail} className="mb-1 last:mb-0">{detail}</p>) : '—'}</td>
                <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 font-bold ${device.is_dashboard_visible ? 'status-online-text' : 'text-[rgb(var(--muted))]'}`}>{device.is_dashboard_visible ? <Eye size={13} /> : <EyeOff size={13} />}{device.is_dashboard_visible ? 'Shown' : 'Hidden'}</span></td>
                <td className="px-4 py-4"><Badge status={device.status || 'unknown'}>{device.status || 'unknown'}</Badge></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
