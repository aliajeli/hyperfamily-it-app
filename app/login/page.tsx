'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, User } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Button, Input } from '@/components/ui'
import BrandMark from '@/components/layout/BrandMark'
import AuthenticationStatus from '@/components/login/AuthenticationStatus'
import DeveloperCredit from '@/components/login/DeveloperCredit'
import LoginBackdrop from '@/components/login/LoginBackdrop'
import RecoveryDialog from '@/components/login/RecoveryDialog'
import { wait } from '@/lib/timing'

const REMEMBER_KEY = 'hyperfamily.browser.remembered'

function readRememberedSync() {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data?.username)
      return { username: String(data.username), password: String(data.password || ''), remember: true }
  } catch {}
  return null
}

export default function LoginPage() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { user, hydrated, login } = useAuthStore()
  const [form, setForm] = useState<any>(() => {
    const remembered = typeof window !== 'undefined' ? readRememberedSync() : null
    return remembered || { username: 'Admin', password: 'Admin', remember: true }
  })
  const [showPassword, setShowPassword] = useState(false)
  // Starts false on the server AND the client so hydration always matches;
  // reduced-motion short-circuits the intro right after mount.
  const [introComplete, setIntroComplete] = useState(false)
  const [authPhase, setAuthPhase] = useState('idle')
  const [recoverOpen, setRecoverOpen] = useState(false)

  useEffect(() => {
    if (hydrated && user) router.replace('/dashboard')
  }, [hydrated, user, router])
  useEffect(() => {
    if (reduceMotion) setIntroComplete(true)
  }, [reduceMotion])

  useEffect(() => {
    try {
      const api = getApi()
      if (api?.auth?.rememberedCredentials) {
        api.auth
          .rememberedCredentials()
          .then((saved) => {
            if (saved?.username)
              setForm({ username: saved.username, password: saved.password || '', remember: true })
          })
          .catch(() => {
            const sync = readRememberedSync()
            if (sync) setForm(sync)
          })
      } else {
        const sync = readRememberedSync()
        if (sync) setForm(sync)
      }
    } catch {
      const sync = readRememberedSync()
      if (sync) setForm(sync)
    }
  }, [])

  const finishIntro = useCallback(() => setIntroComplete(true), [])

  const submit = async (event) => {
    event.preventDefault()
    if (authPhase !== 'idle') return
    if (!form.username.trim() || form.password.length < 4) {
      toast.error('Enter a username and a password of at least 4 characters')
      return
    }

    setAuthPhase('checking')
    const authentication = getApi()
      .auth.login(form)
      .then((authenticatedUser) => ({ authenticatedUser }))
      .catch((error) => ({ error }))

    await wait(reduceMotion ? 200 : 1450)
    const result = await authentication

    if (result.error) {
      setAuthPhase('error')
      toast.error(result.error.message || 'Login failed')
      await wait(reduceMotion ? 250 : 1050)
      setAuthPhase('idle')
      return
    }

    // Only a successful sign-in is remembered, and only while the checkbox
    // is ticked; unchecking it clears any previously saved credentials.
    getApi()
      .auth.rememberCredentials?.(
        form.remember ? { username: form.username.trim(), password: form.password } : {}
      )
      .catch(() => {
        /* remember-me is best-effort */
      })

    setAuthPhase('success')
    await wait(reduceMotion ? 180 : 850)
    setAuthPhase('entering')
    await wait(reduceMotion ? 180 : 520)

    login(result.authenticatedUser)
    window.dispatchEvent(new CustomEvent('hyperfamily:data-changed'))
    toast.success(`Welcome back, ${result.authenticatedUser.username}`)
    router.replace('/dashboard')
  }

  const isAuthenticating = authPhase !== 'idle'

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto px-4 py-4 sm:py-6">
      <LoginBackdrop />

      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: authPhase === 'entering' ? 0 : 1,
          y: authPhase === 'entering' ? -18 : 0,
          scale: authPhase === 'entering' ? 0.96 : 1,
          x: authPhase === 'error' ? [0, -6, 6, -4, 4, 0] : 0
        }}
        transition={{ duration: 0.45, layout: { duration: 0.55, type: 'spring', bounce: 0.16 } }}
        className="glass login-card relative z-10 m-auto w-full max-w-[460px] overflow-hidden rounded-[30px] p-6 sm:p-8"
      >
        <div className="login-card-highlight pointer-events-none absolute inset-x-12 top-0 h-px" />

        <motion.section
          layout
          animate={{ minHeight: introComplete ? 0 : 340 }}
          transition={{ minHeight: { duration: 0.62, ease: [0.22, 1, 0.36, 1] }, layout: { duration: 0.55 } }}
          className="relative flex flex-col items-center justify-center text-center"
        >
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.78, filter: 'blur(8px)' }}
            animate={{
              opacity: 1,
              scale: 1,
              filter: 'blur(0px)',
              width: introComplete ? 60 : 82,
              height: introComplete ? 60 : 82
            }}
            transition={{
              opacity: { duration: 0.75 },
              scale: { duration: 0.8, ease: 'easeOut' },
              width: { duration: 0.55 },
              height: { duration: 0.55 }
            }}
            className="relative"
          >
            <motion.span
              className="absolute -inset-2 rounded-[24px] border border-[rgb(var(--primary)/.2)]"
              animate={{ scale: [0.94, 1.09, 0.94], opacity: [0.3, 0.72, 0.3] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              className="absolute -inset-4 rounded-[28px] border border-[rgb(var(--secondary)/.12)]"
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            >
              <span className="absolute -right-1 top-1/2 h-2 w-2 rounded-full bg-[rgb(var(--secondary))] shadow-[0_0_10px_rgb(var(--secondary))]" />
            </motion.span>
            <BrandMark className="relative h-full w-full drop-shadow-[0_10px_20px_rgba(46,52,64,.16)]" />
          </motion.div>

          <motion.h1
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, fontSize: introComplete ? 24 : 29 }}
            transition={{
              opacity: { delay: 0.72, duration: 0.68 },
              y: { delay: 0.72, duration: 0.68 },
              fontSize: { duration: 0.55 }
            }}
            className="mt-5 font-extrabold tracking-tight"
          >
            Welcome to <span className="gradient-text">Hyper Family</span>
          </motion.h1>

          <DeveloperCredit onComplete={finishIntro} reduceMotion={reduceMotion} />

          <AnimatePresence>
            {introComplete && (
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mt-2 text-xs text-[rgb(var(--muted))]"
              >
                Sign in to the branch operations control center
              </motion.p>
            )}
          </AnimatePresence>
        </motion.section>

        <AnimatePresence mode="wait">
          {introComplete && authPhase === 'idle' ? (
            <motion.form
              key="login-form"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, filter: 'blur(5px)' }}
              transition={{ duration: 0.42, delay: 0.12 }}
              onSubmit={submit}
              className="mt-6 space-y-4"
            >
              <motion.label
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="group relative block"
              >
                <span className="field-label transition-colors group-focus-within:text-[rgb(var(--primary))]">
                  Username
                </span>
                <User
                  className="absolute bottom-3.5 left-3.5 text-[rgb(var(--muted))] transition-colors group-focus-within:text-[rgb(var(--primary))]"
                  size={17}
                />
                <Input
                  autoFocus
                  autoComplete="username"
                  disabled={isAuthenticating}
                  className="pl-10 transition-all duration-300 focus:-translate-y-0.5 focus:shadow-[0_8px_24px_rgb(var(--primary)/.12)]"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </motion.label>

              <motion.label
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="group relative block"
              >
                <span className="field-label transition-colors group-focus-within:text-[rgb(var(--primary))]">
                  Password
                </span>
                <LockKeyhole
                  className="absolute bottom-3.5 left-3.5 text-[rgb(var(--muted))] transition-colors group-focus-within:text-[rgb(var(--primary))]"
                  size={17}
                />
                <Input
                  autoComplete="current-password"
                  disabled={isAuthenticating}
                  type={showPassword ? 'text' : 'password'}
                  className="px-10 transition-all duration-300 focus:-translate-y-0.5 focus:shadow-[0_8px_24px_rgb(var(--primary)/.12)]"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute bottom-2.5 right-2.5 rounded-lg p-2 text-[rgb(var(--muted))] transition hover:scale-110 hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </motion.label>

              <motion.label
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.48 }}
                className="flex cursor-pointer items-center gap-2 text-xs text-[rgb(var(--muted))]"
              >
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(event) => setForm({ ...form, remember: event.target.checked })}
                  className="accent-[rgb(var(--primary))]"
                />
                Remember this account on this device
              </motion.label>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.52 }}
              >
                <Button
                  disabled={isAuthenticating}
                  className="login-button group mt-1 h-12 w-full overflow-hidden"
                >
                  <span className="relative z-10">Sign in securely</span>
                  <ArrowRight
                    className="login-button-icon relative z-10 transition-transform duration-300 group-hover:translate-x-1"
                    size={17}
                  />
                </Button>
              </motion.div>
            </motion.form>
          ) : introComplete ? (
            <AuthenticationStatus phase={authPhase} />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {introComplete && authPhase === 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="mt-6 flex items-center justify-center gap-2 border-t pt-5 text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"
            >
              <ShieldCheck size={14} className="text-nord-14" />
              Local encrypted workspace • Windows 10/11
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <p className="relative z-10 mt-auto pt-3 text-center text-xs uppercase tracking-[.2em] text-[rgb(var(--muted))]">
        HyperFamily Stores • IT Operations
      </p>

      {/* Corner recovery link (v2.0.21): a quiet way back in when the
          administrator forgets the login. PIN-gated. */}
      <button
        type="button"
        onClick={() => setRecoverOpen(true)}
        aria-label="Recover credentials"
        className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border bg-[rgb(var(--surface)/.72)] px-3 py-1.5 text-xs font-bold text-[rgb(var(--muted))] shadow-sm backdrop-blur transition hover:border-[rgb(var(--primary)/.5)] hover:text-[rgb(var(--primary))]"
      >
        <KeyRound size={12} />
        Recover credentials
      </button>

      <RecoveryDialog open={recoverOpen} onOpenChange={setRecoverOpen} />
    </main>
  )
}
