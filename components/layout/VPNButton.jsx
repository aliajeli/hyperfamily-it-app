'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Shield, ShieldAlert, ShieldCheck, ChevronDown, Check, Unplug, Globe2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'
import { useVpnStore } from '@/stores/vpn.store'
import { cn } from '@/lib/utils'

/**
 * The indicator is deliberately binary: green while a tunnel is actually
 * carrying traffic, red whenever it is not. The main process re-checks the real
 * state every second and pushes it here, and this component also polls as a
 * safety net so the colour is never stale even if an event is missed.
 */
const STATES = {
  disconnected: { label: 'VPN off', tone: 'off', icon: Shield },
  connecting: { label: 'Connecting…', tone: 'busy', icon: Loader2 },
  connected_global: { label: 'FortiClient VPN', tone: 'on', icon: ShieldCheck },
  // The user is signing in inside the FortiClient window. Not an error: the
  // indicator turns green by itself as soon as the tunnel appears.
  awaiting_forticlient: { label: 'Sign in to FortiClient…', tone: 'busy', icon: Loader2 },
  // Legacy state names kept so an older stored status never breaks the header.
  // They all resolve to the single remaining mode.
  connected_in_app: { label: 'FortiClient VPN', tone: 'on', icon: ShieldCheck },
  connected_split: { label: 'FortiClient VPN', tone: 'on', icon: ShieldCheck },
  connected_full: { label: 'FortiClient VPN', tone: 'on', icon: ShieldCheck },
  error: { label: 'VPN error', tone: 'off', icon: ShieldAlert }
}

const TONES = {
  on: 'status-online-text bg-nord-14/15 ring-1 ring-nord-14/40',
  off: 'text-nord-11 bg-nord-11/10 ring-1 ring-nord-11/30',
  busy: 'text-[rgb(var(--primary))] bg-[rgb(var(--primary)/.12)] ring-1 ring-[rgb(var(--primary)/.3)]'
}

export default function VPNButton() {
  const status = useVpnStore()
  const setStatus = useVpnStore((s) => s.setStatus)
  const [open, setOpen] = useState(false)
  const [probe, setProbe] = useState(null)
  const ref = useRef(null)

  const config = STATES[status.state] || STATES.disconnected
  const Icon = config.icon
  const claimsConnected = String(status.state || '').startsWith('connected')
  // `live` is authoritative when the main process reports it.
  const live = status.live ?? claimsConnected
  const tone = config.tone === 'on' && !live ? 'off' : config.tone
  const label = config.tone === 'on' && !live ? 'VPN off' : config.label

  const refresh = useCallback(() => {
    const api = getApi()
    if (!api?.vpn?.status) return
    api.vpn.status().then(setStatus).catch(() => {})
  }, [setStatus])

  useEffect(() => {
    const api = getApi()
    if (!api?.vpn) return undefined
    refresh()
    api.vpn.probe().then(setProbe).catch(() => setProbe(null))
    const unsubscribe = api.vpn.subscribe(setStatus)
    // Poll once a second so the colour tracks reality even without events.
    const timer = setInterval(refresh, 1000)
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => {
      unsubscribe?.()
      clearInterval(timer)
      document.removeEventListener('mousedown', close)
    }
  }, [setStatus, refresh])

  const connect = async (mode) => {
    setOpen(false)
    setStatus({ state: 'connecting', mode })
    try {
      const result = await getApi().vpn.connect(mode)
      setStatus(result)
      if (result?.state === 'awaiting_forticlient') {
        toast.info('FortiClient is open — finish signing in there. This indicator turns green on its own once the tunnel is up.', { duration: 10000 })
      } else {
        toast.success('FortiClient VPN tunnel is active')
      }
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
      <button
        onClick={() => setOpen(!open)}
        aria-label={`VPN status: ${label}`}
        data-vpn-live={live ? 'true' : 'false'}
        className={cn('no-drag flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-bold transition hover:brightness-95', TONES[tone])}
      >
        <span className="relative flex items-center">
          <Icon size={16} className={config.tone === 'busy' ? 'animate-spin' : undefined} />
          <span
            aria-hidden
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[rgb(var(--surface))]',
              live ? 'bg-nord-14' : 'bg-nord-11',
              live && 'animate-pulse'
            )}
          />
        </span>
        <span className="hidden lg:inline">{label}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div role="dialog" aria-label="VPN connection" className="vpn-popup glass absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-[22px] p-2 shadow-2xl">
          <div className="px-3 pb-1.5 pt-1 text-[9.5px] font-bold uppercase tracking-widest text-[rgb(var(--muted))]">FortiClient SSL VPN</div>

          {!live ? (
            <>
              <button onClick={() => connect('global')} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-nord-14/12">
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
