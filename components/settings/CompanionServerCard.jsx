'use client'

import { useCallback, useEffect, useState } from 'react'
import { Smartphone, Copy, Check, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Switch
} from '@/components/ui'
import { getApi } from '@/lib/api'

/**
 * Companion server card — turns this workstation into the backend for the
 * HyperFamily Companion app on Android. The phone loads the very same
 * interface from this machine over the store network and signs in with a
 * regular application account; the companion token below is the second key
 * that keeps the API closed to everyone else on the LAN.
 */
export default function CompanionServerCard() {
  const [state, setState] = useState(null)
  const [portInput, setPortInput] = useState('8420')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let alive = true
    getApi()
      .companion?.state?.()
      .then((value) => {
        if (alive) {
          setState(value)
          setPortInput(String(value?.port || 8420))
        }
      })
      .catch(() => {
        if (alive) setState({ supported: false })
      })
    return () => {
      alive = false
    }
  }, [])

  const apply = useCallback(async (patch, what) => {
    setBusy(what)
    try {
      setState(await getApi().companion.set(patch))
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }, [])

  const copy = useCallback(async (label, value) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      toast.error('Copying failed — select the text manually')
    }
  }, [])

  const rotate = useCallback(async () => {
    setBusy('rotate')
    try {
      setState(await getApi().companion.rotateToken())
      toast.success('New companion token generated', { description: 'Enter the new token in the phone app.' })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }, [])

  const unsupported = state && state.supported === false
  const urls = (state?.addresses || []).map((address) => `http://${address}:${state?.port || 8420}`)

  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Smartphone size={15} className="text-[rgb(var(--primary))]" />
          Companion server (Android)
        </CardTitle>
        <CardDescription className="mt-0 text-xs leading-snug">
          Lets the HyperFamily Companion phone app use this workstation as its backend over the local network.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 p-3 pt-1">
        {unsupported ? (
          <p className="rounded-xl border border-dashed bg-[rgb(var(--surface)/.35)] px-2.5 py-2 text-2xs leading-relaxed text-[rgb(var(--muted))]">
            The companion server runs inside the desktop application — it is not available in the browser
            preview.
          </p>
        ) : !state ? (
          <p className="text-xs text-[rgb(var(--muted))]">Loading companion state…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-[rgb(var(--surface)/.45)] px-2.5 py-2">
              <div className="min-w-0">
                <b className="block text-2xs">Run the companion server</b>
                <span className="block text-2xs text-[rgb(var(--muted))]">
                  {state.running
                    ? `Listening on port ${state.port}`
                    : 'Stopped — the phone app cannot connect'}
                </span>
              </div>
              <Switch
                checked={Boolean(state.enabled)}
                disabled={busy === 'toggle'}
                onCheckedChange={(next) =>
                  apply({ enabled: next, port: Number(portInput) || undefined }, 'toggle')
                }
              />
            </div>

            {state.error ? (
              <p className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs leading-snug text-amber-600 dark:text-amber-400">
                <TriangleAlert size={12} className="shrink-0" />
                {state.error} — is another program using this port?
              </p>
            ) : null}

            <form
              className="flex items-end gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                apply({ port: Number(portInput) }, 'port')
              }}
            >
              <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Port
                </span>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={portInput}
                  onChange={(event) => setPortInput(event.target.value)}
                  className="max-w-[9rem]"
                />
              </label>
              <Button size="sm" variant="secondary" disabled={busy === 'port'}>
                {busy === 'port' ? 'Saving…' : 'Save port'}
              </Button>
            </form>

            {state.running ? (
              <div className="flex flex-col gap-1.5 rounded-xl border bg-[rgb(var(--surface)/.45)] p-2.5">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Server address — enter it in the phone app
                </span>
                {urls.length ? (
                  urls.map((url) => (
                    <div key={url} className="flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate rounded-md border bg-[rgb(var(--canvas)/.6)] px-2 py-1 font-mono text-xs">
                        {url}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(url, url)}
                        aria-label={`Copy ${url}`}
                      >
                        {copied === url ? <Check size={13} /> : <Copy size={13} />}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[rgb(var(--muted))]">No local network address found yet.</p>
                )}
                <span className="mt-1 text-2xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Companion token
                </span>
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md border bg-[rgb(var(--canvas)/.6)] px-2 py-1 font-mono text-xs">
                    {state.token}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(state.token, state.token)}
                    aria-label="Copy the companion token"
                  >
                    {copied === state.token ? <Check size={13} /> : <Copy size={13} />}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === 'rotate'} onClick={rotate}>
                    <RefreshCw size={13} className={busy === 'rotate' ? 'animate-spin' : ''} />
                    New token
                  </Button>
                </div>
              </div>
            ) : null}

            <p className="rounded-xl border border-dashed bg-[rgb(var(--surface)/.35)] px-2.5 py-2 text-2xs leading-relaxed text-[rgb(var(--muted))]">
              On first start Windows may ask to allow this app on the network — choose private networks. The
              phone signs in with the same account as this app; the token only protects the connection. Keep
              both on the same store network.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
