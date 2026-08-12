'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { MapPin, Router, Activity, Maximize2 } from 'lucide-react'
import PingChart from './PingChart'
import DeviceCard from './DeviceCard'
import DeviceActionsMenu from './DeviceActionsMenu'
import DeviceStatusBadge from './DeviceStatusBadge'

const gatewayTreatment = {
  online: 'border-nord-14/50 bg-gradient-to-br from-nord-14/15 via-[rgb(var(--surface))] to-[rgb(var(--canvas))]',
  warning: 'border-nord-13/60 bg-gradient-to-br from-nord-13/18 via-[rgb(var(--surface))] to-[rgb(var(--canvas))]',
  offline: 'border-nord-11/50 bg-gradient-to-br from-nord-11/15 via-[rgb(var(--surface))] to-[rgb(var(--canvas))]',
  unknown: 'border-[rgb(var(--border))] bg-[rgb(var(--canvas))]'
}

function descriptor(device) {
  return `${device.name || ''} ${device.hostname || ''} ${device.model || ''}`.toLowerCase()
}

function deviceRank(device) {
  const text = descriptor(device)
  if (device.device_type === 'iLO') return 10
  if (device.device_type === 'Server' && text.includes('sql')) return 20
  if (device.device_type === 'Server' && text.includes('iis')) return 30
  if (device.device_type === 'Server') return 35
  if (device.device_type === 'Checkout') return 40 + Math.min(Number(device.checkout_number || 99), 99)
  return 200 + String(device.device_type || '').charCodeAt(0)
}

function displayLabel(device) {
  const text = descriptor(device)
  if (device.device_type === 'iLO') return 'iLO'
  if (device.device_type === 'Server' && text.includes('sql')) return 'Server - SQL'
  if (device.device_type === 'Server' && text.includes('iis')) return 'Server - IIS'
  if (device.device_type === 'Checkout' && device.checkout_number) return `Checkout ${device.checkout_number}`
  return device.name
}

export default function BranchCard({ branch, devices }) {
  const navigation = useRouter()
  const visible = devices.filter((device) => device.branch_id === branch.id && device.is_dashboard_visible)
  const gateway = visible.find((device) => device.device_type === 'Router')
  const displayDevices = visible
    .filter((device) => device.device_type !== 'Router')
    .sort((left, right) => deviceRank(left) - deviceRank(right) || String(left.name || '').localeCompare(String(right.name || '')))
  const online = displayDevices.filter((device) => device.status === 'online').length
  const gatewayStatus = gateway?.status || 'unknown'
  const gatewayPing = gateway?.last_ping_ms ?? gateway?.ping_time

  const openGatewayDetails = () => {
    if (!gateway) return
    navigation.push(`/dashboard/gateway?branch=${encodeURIComponent(branch.id)}&device=${encodeURIComponent(gateway.id)}`)
  }

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel min-w-0 overflow-hidden"
      aria-label={`${branch.name} branch status`}
    >
      <header className="border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))]">
            <MapPin size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-xs font-extrabold tracking-tight" title={branch.name}>{branch.name}</h2>
              <span className="shrink-0 rounded-md bg-[rgb(var(--border)/.55)] px-1.5 py-0.5 font-mono text-[7px] font-bold">{branch.code}</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[8px] font-semibold text-[rgb(var(--muted))]">
              <Activity size={9} /> {online}/{displayDevices.length} devices online
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-2 p-2.5">
        {gateway ? (
          <div className={`relative overflow-hidden rounded-2xl border shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${gatewayTreatment[gatewayStatus] || gatewayTreatment.unknown}`}>
            <button type="button" onClick={openGatewayDetails} className="block w-full p-2.5 text-left" aria-label={`Open detailed Router chart for ${branch.name}`}>
              <div className="flex min-w-0 items-center gap-2 pr-7">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[rgb(var(--surface))] text-nord-8 shadow-sm">
                  <Router size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-[rgb(var(--muted))]">Router</p>
                  <p className="truncate text-[11px] font-extrabold" title={gateway.name}>{gateway.name}</p>
                </div>
                <div className="text-right">
                  <DeviceStatusBadge status={gatewayStatus} compact />
                  <p className="mt-1 text-[10px] font-extrabold tabular-nums">{gatewayPing == null ? 'No reply' : `${gatewayPing} ms`}</p>
                </div>
              </div>

              <div className="mt-1.5 overflow-hidden rounded-lg bg-[rgb(var(--surface)/.58)] px-1">
                <PingChart history={gateway.history} compact />
              </div>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-[8px] font-bold text-[rgb(var(--primary))]">
                <Maximize2 size={9} /> Select chart for detailed view
              </p>
            </button>
            <div className="absolute right-2 top-2">
              <DeviceActionsMenu device={gateway} />
            </div>
          </div>
        ) : (
          <div className="grid h-28 place-items-center rounded-2xl border border-dashed text-[9px] font-semibold text-[rgb(var(--muted))]">
            No Router configured
          </div>
        )}

        <div className="flex items-center justify-between px-0.5">
          <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">Monitored devices</p>
          <span className="text-[8px] font-semibold text-[rgb(var(--muted))]">{displayDevices.length}</span>
        </div>

        {displayDevices.length ? (
          <div className="space-y-1.5">
            {displayDevices.map((device) => <DeviceCard key={device.id} device={device} label={displayLabel(device)} />)}
          </div>
        ) : (
          <div className="grid h-14 place-items-center rounded-xl border border-dashed text-center text-[9px] text-[rgb(var(--muted))]">
            No dashboard devices for this branch
          </div>
        )}
      </div>
    </motion.section>
  )
}
