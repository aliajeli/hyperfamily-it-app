'use client'

import { useEffect, useRef, useState } from 'react'
import { Shield, ShieldAlert, ChevronDown, Check, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'
import { useVpnStore } from '@/stores/vpn.store'
import { cn } from '@/lib/utils'

const states = {
  disconnected: { label: 'VPN disconnected', className: 'text-nord-11 bg-nord-11/10', icon: Shield },
  connecting: { label: 'Connecting…', className: 'text-nord-9 bg-nord-9/10 animate-pulse', icon: Shield },
  connected_split: { label: 'Split tunnel', className: 'text-[#8b6e1c] bg-nord-13/20', icon: Shield },
  connected_full: { label: 'Full VPN', className: 'text-[#66834e] bg-nord-14/20', icon: Shield },
  error: { label: 'VPN error', className: 'text-nord-11 bg-nord-11/10 animate-shake', icon: ShieldAlert }
}

export default function VPNButton() {
  const status = useVpnStore()
  const setStatus = useVpnStore((s) => s.setStatus)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const config = states[status.state] || states.disconnected
  const Icon = config.icon
  const connected = status.state.startsWith('connected')

  useEffect(() => {
    let unsubscribe = () => {}
    getApi().vpn.status().then(setStatus).catch(() => {})
    unsubscribe = getApi().vpn.subscribe(setStatus)
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
      toast.success(mode === 'split' ? 'Split tunnel connected' : 'Full VPN connected')
    } catch (error) {
      setStatus({ state: 'error', mode: null, message: error.message })
      toast.error(error.message)
    }
  }
  const disconnect = async () => {
    setOpen(false)
    try { setStatus(await getApi().vpn.disconnect()); toast.success('VPN disconnected') } catch (error) { toast.error(error.message) }
  }

  return <div ref={ref} className="relative">
    <button onClick={() => setOpen(!open)} className={cn('no-drag flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition hover:brightness-95', config.className)}><Icon size={17} /><span className="hidden lg:inline">{config.label}</span><ChevronDown size={14} /></button>
    {open && <div className="glass absolute right-0 top-12 z-50 w-64 rounded-xl p-2 shadow-xl">
      <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted))]">Secure connection</div>
      {!connected ? <>
        <button onClick={() => connect('split')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-nord-13/15"><span className="h-2.5 w-2.5 rounded-full bg-nord-13" /><span><b className="block">Split tunnel</b><small className="text-[rgb(var(--muted))]">Private networks only</small></span></button>
        <button onClick={() => connect('full')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-nord-14/15"><span className="h-2.5 w-2.5 rounded-full bg-nord-14" /><span><b className="block">Full VPN</b><small className="text-[rgb(var(--muted))]">All system traffic</small></span></button>
      </> : <button onClick={disconnect} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-nord-11 hover:bg-nord-11/10"><Unplug size={17} /><span><b className="block">Disconnect</b><small className="text-[rgb(var(--muted))]">End secure session</small></span></button>}
      <div className="mt-1 flex items-center gap-2 border-t px-3 pt-2 text-[10px] text-[rgb(var(--muted))]"><Check size={12} /> Credentials stay encrypted on this PC</div>
    </div>}
  </div>
}
