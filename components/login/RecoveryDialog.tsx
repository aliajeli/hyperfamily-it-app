'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, Copy, KeyRound, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { getApi } from '@/lib/api'

/**
 * Credential recovery (v2.0.21).
 *
 * Opened from the small corner link: the user enters their recovery PIN and —
 * only when it matches — sees the stored username and password. Five wrong
 * attempts lock the dialog for five minutes, exactly like the standalone
 * recovery tool.
 */
export default function RecoveryDialog({ open, onOpenChange }: any) {
  const [status, setStatus] = useState<any>(null) // { pinSet }
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [locked, setLocked] = useState(false)
  const [remainingAttempts, setRemainingAttempts] = useState<any>(null)
  const [retryAfter, setRetryAfter] = useState<any>(null) // seconds
  const [result, setResult] = useState<any>(null) // { username, password }
  const [copied, setCopied] = useState<any>(null)

  useEffect(() => {
    if (!open) return
    setPin('')
    setMessage('')
    setLocked(false)
    setRemainingAttempts(null)
    setRetryAfter(null)
    setResult(null)
    setCopied(null)
    getApi()
      .auth.recoverStatus()
      .then(setStatus)
      .catch((error) => setMessage(error.message))
  }, [open])

  // Countdown while locked out.
  useEffect(() => {
    if (!retryAfter) return undefined
    const timer = setInterval(
      () =>
        setRetryAfter((value) => {
          const next = (value || 0) - 1
          if (next <= 0) {
            setLocked(false)
            return null
          }
          return next
        }),
      1000
    )
    return () => clearInterval(timer)
  }, [retryAfter])

  const submit = async (event) => {
    event.preventDefault()
    if (busy || locked) return
    setBusy(true)
    try {
      const outcome = await getApi().auth.recover(pin)
      if (outcome.ok) {
        setResult({ username: outcome.username, password: outcome.password })
        setMessage('')
      } else if (outcome.locked) {
        setLocked(true)
        setRemainingAttempts(null)
        setRetryAfter(Math.ceil((outcome.retryAfterMs || 0) / 1000))
        setMessage('Too many wrong attempts — recovery is locked for 5 minutes.')
      } else {
        setRemainingAttempts(outcome.remainingAttempts)
        setMessage(
          `Wrong PIN. ${outcome.remainingAttempts} attempt${outcome.remainingAttempts === 1 ? '' : 's'} left.`
        )
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1400)
    } catch {
      /* clipboard may be unavailable */
    }
  }

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
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[70] bg-nord-0/55 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="dialog-content glass fixed left-1/2 top-1/2 z-[80] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-[rgb(var(--surface))] p-4 shadow-2xl outline-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-[rgb(var(--primary)/.14)] p-1.5 text-[rgb(var(--primary))]">
                    <KeyRound size={15} />
                  </div>
                  <div>
                    <DialogPrimitive.Title className="text-sm font-extrabold">
                      Recover credentials
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-xs text-[rgb(var(--muted))]">
                      Enter the recovery PIN to see the stored login.
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Close credential recovery"
                      className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]"
                    >
                      <X size={15} />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                {result ? (
                  <div className="mt-3 space-y-1.5">
                    {[
                      ['Username', result.username, 'user'],
                      ['Password', result.password || 'not recorded', 'pass']
                    ].map(([label, value, key]) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-xl border bg-[rgb(var(--canvas)/.6)] p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold uppercase tracking-wider text-[rgb(var(--muted))]">
                            {label}
                          </p>
                          <p className="truncate font-mono text-xs" title={value}>
                            {value}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copy(value, key)}
                          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-[rgb(var(--primary)/.12)] px-2 text-xs font-extrabold text-[rgb(var(--primary))] transition hover:bg-[rgb(var(--primary)/.22)]"
                        >
                          {copied === key ? <Check size={11} /> : <Copy size={11} />}
                          {copied === key ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ))}
                    <p className="text-xs leading-snug text-[rgb(var(--muted))]">
                      Keep these safe — anyone with them can open the application.
                    </p>
                  </div>
                ) : status && !status.pinSet ? (
                  <p className="mt-3 rounded-xl border bg-nord-13/10 p-2.5 text-2xs leading-relaxed text-[#8b6e1c]">
                    No recovery PIN has been set yet. Sign in normally and set one in{' '}
                    <b>Settings → General</b> to enable recovery.
                  </p>
                ) : (
                  <form onSubmit={submit} className="mt-3 space-y-2">
                    <Input
                      autoFocus
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={8}
                      disabled={locked || busy}
                      placeholder="Recovery PIN"
                      aria-label="Recovery PIN"
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                    />
                    {message && (
                      <p
                        className={`text-xs leading-snug ${locked ? 'text-nord-11' : 'text-[rgb(var(--muted))]'}`}
                      >
                        {message}
                        {locked && retryAfter
                          ? ` Try again in ${Math.floor(retryAfter / 60)}:${String(retryAfter % 60).padStart(2, '0')}.`
                          : ''}
                      </p>
                    )}
                    {remainingAttempts !== null && !locked && (
                      <p className="text-xs text-[rgb(var(--muted))]">
                        {remainingAttempts} attempt{remainingAttempts === 1 ? '' : 's'} remaining before a
                        5-minute lock.
                      </p>
                    )}
                    <Button disabled={locked || busy || pin.length < 4} className="w-full">
                      {busy ? 'Checking…' : 'Reveal credentials'}
                    </Button>
                  </form>
                )}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
