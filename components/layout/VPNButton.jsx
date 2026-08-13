'use client'

import { useEffect, useRef, useState } from 'react'
import { Shield, ShieldAlert, ShieldCheck, ChevronDown, Check, Unplug, AppWindow, Globe2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'
import { useVpnStore } from '@/stores/vpn.store'
import { cn } from '@/lib/utils'

const states = {
  disconnected: { label: 'VPN off', className: 'text-nord-11 bg-nord-11/10', icon: Shield },
  connecting: { label: 'Connecting…', className: 'text-nord-9 bg-nord-9/10 animate-pulse', icon: Shield },
  connected_in_app: { label: 'In-app tunnel', className: 'text-[#8b6e1c] bg-nord-13/20', icon: ShieldCheck },
  connected_global: { label: 'FortiClient VPN', className: 'text-[#66834e] bg-nord-14/20', icon: ShieldCheck },
  // Legacy state names kept so an older stored status never breaks the header.
  connected_split: { label: 'In-app tunnel', className: 'text-[#8b6e1c] bg-nord-13/20', icon: ShieldCheck },
  connected_full: { label: 'FortiClient VPN', className: 'text-[#66834e] bg-nord-14/20', icon: ShieldCheck },
  error: { label: 'VPN error', className: 'text-nord-11 bg-nord-11/10 animate-shake', icon: ShieldAlert }
}

export default function VPNButton() {
  const status = useVpnStore()
  const setStatus = useVpnStore((s) => s.setStatus)
  const [open, setOpen] = useState(false)
  const [probe, setProbe] = useState(null)
  const ref = useRef(null)
  const config = states[status.state] || states.disconnected
  const Icon = config.icon
  const connected = String(status.state || '').startsWith('connected')

  useEffect(() => {
    let unsubscribe = () => {}
    const api = getApi()
    api.vpn.status().then(setStatus).catch(() => {})
    api.vpn.probe().then(setProbe).catch(() => setProbe(null))
    unsubscribe = api.vpn.subscribe(setStatus)
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => { unsubscribe?.(); document.removeEventListener('mousedown', close) }
  }, [setStatus])

  const connect = async (mode) => {
    setOpen(false)
    setStatus({ state: 'connecting', mode })
    try {
      const result = await getApi().vpn.connect(mode)
      setStatus(result)
      toast.success(mode === 'in_app' ? 'In-app VPN tunnel is active' : 'FortiClient VPN launched — finish signing in there')
    } catch (error) {
      setStatus({ state: 'error', mode: null, message: error.message })
      toast.error(error.message, {
        duration: 8000,
        action: /not installed/i.test(error.message)
          ? { label: 'Get FortiClient', onClick: () => getApi().app.openExternal('https://www.fortinet.com/support/product-downloads#vpn') }
          : undefined
      })
    }
  }

  const disconnect = async () => {
    setOpen(false)
    try { setStatus(await getApi().vpn.disconnect()); toast.success('VPN disconnected') } catch (error) { toast.error(error.message) }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={cn('no-drag flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-bold transition hover:brightness-95', config.className)}>
        <Icon size={16} />
        <span className="hidden lg:inline">{config.label}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="glass absolute right-0 top-11 z-50 w-72 rounded-xl p-2 shadow-xl">
          <div className="px-3 pb-1.5 pt-1 text-[9.5px] font-bold uppercase tracking-widest text-[rgb(var(--muted))]">FortiClient SSL VPN</div>

          {!connected ? (
            <>
              <button onClick={() => connect('in_app')} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-nord-13/15">
                <AppWindow size={16} className="mt-0.5 text-nord-13" />
                <span>
                  <b className="block text-xs">In-app tunnel</b>
                  <small className="text-[10px] leading-relaxed text-[rgb(var(--muted))]">Routes only this application through the SSL-VPN portal proxy. Windows stays untouched.</small>
                </span>
              </button>
              <button onClick={() => connect('global')} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-nord-14/15">
                <Globe2 size={16} className="mt-0.5 text-nord-14" />
                <span>
                  <b className="block text-xs">Global (FortiClient)</b>
                  <small className="text-[10px] leading-relaxed text-[rgb(var(--muted))]">Launches the installed FortiClient VPN so all system traffic uses the tunnel.</small>
                </span>
              </button>
              {probe && !probe.installed && (
                <button
                  onClick={() => getApi().app.openExternal(probe.downloadUrl || 'https://www.fortinet.com/support/product-downloads#vpn')}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg bg-nord-11/10 px-3 py-2 text-left text-[10px] font-semibold text-nord-11"
                >
                  <Download size={13} />FortiClient is not installed — download it
                </button>
              )}
            </>
          ) : (
            <>
              <div className="rounded-lg bg-[rgb(var(--border)/.4)] px-3 py-2 text-[10px] text-[rgb(var(--muted))]">
                {status.gateway && <p>Gateway <b className="font-mono text-[rgb(var(--text))]">{status.gateway}</b></p>}
                {status.proxyPort ? <p className="mt-0.5">Local proxy on port <b className="font-mono text-[rgb(var(--text))]">{status.proxyPort}</b></p> : null}
                {status.stats?.requests ? <p className="mt-0.5">{status.stats.requests} request{status.stats.requests === 1 ? '' : 's'} tunnelled</p> : null}
              </div>
              <button onClick={disconnect} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-nord-11 hover:bg-nord-11/10">
                <Unplug size={16} />
                <span><b className="block text-xs">Disconnect</b><small className="text-[10px] text-[rgb(var(--muted))]">End the secure session</small></span>
              </button>
            </>
          )}

          <div className="mt-1 flex items-center gap-2 border-t px-3 pt-2 text-[9.5px] text-[rgb(var(--muted))]"><Check size={11} /> Credentials stay encrypted on this PC</div>
        </div>
      )}
    </div>
  )
}
