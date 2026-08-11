'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { User, LockKeyhole, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Button, Input } from '@/components/ui'
import BrandMark from '@/components/layout/BrandMark'

export default function LoginPage() {
  const router = useRouter()
  const { user, hydrated, login } = useAuthStore()
  const [form, setForm] = useState({ username: 'Admin', password: 'Admin', remember: true })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (hydrated && user) router.replace('/dashboard') }, [hydrated, user, router])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.username.trim() || form.password.length < 4) return toast.error('Enter a username and a password of at least 4 characters')
    setLoading(true)
    try {
      const authenticatedUser = await getApi().auth.login(form)
      login(authenticatedUser)
      window.dispatchEvent(new CustomEvent('hyperfamily:data-changed'))
      toast.success(`Welcome back, ${authenticatedUser.username}`)
      router.replace('/dashboard')
    } catch (error) { toast.error(error.message || 'Login failed') } finally { setLoading(false) }
  }

  return <main className="relative grid min-h-screen overflow-hidden px-4 py-10">
    <div className="pointer-events-none absolute -left-32 -top-36 h-[30rem] w-[30rem] animate-float rounded-full bg-nord-8/25 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-44 -right-28 h-[34rem] w-[34rem] animate-float rounded-full bg-nord-15/20 blur-3xl [animation-delay:-9s]" />
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }} className="glass relative m-auto w-full max-w-[440px] rounded-[28px] p-7 sm:p-9">
      <motion.div initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: .25, type: 'spring' }} className="mb-7"><BrandMark className="mx-auto h-16 w-16" /></motion.div>
      <div className="text-center"><h1 className="text-2xl font-extrabold tracking-tight">Welcome to <span className="gradient-text">HyperFamily</span></h1><p className="mt-2 text-sm text-[rgb(var(--muted))]">Sign in to the branch operations control center</p></div>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <motion.label initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .2 }} className="relative block"><span className="field-label">Username</span><User className="absolute bottom-3.5 left-3.5 text-[rgb(var(--muted))]" size={17} /><Input autoFocus autoComplete="username" className="pl-10" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></motion.label>
        <motion.label initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .3 }} className="relative block"><span className="field-label">Password</span><LockKeyhole className="absolute bottom-3.5 left-3.5 text-[rgb(var(--muted))]" size={17} /><Input autoComplete="current-password" type={showPassword ? 'text' : 'password'} className="px-10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)} className="absolute bottom-2.5 right-2.5 rounded-lg p-2 text-[rgb(var(--muted))]">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></motion.label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[rgb(var(--muted))]"><input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} className="accent-[rgb(var(--primary))]" /> Remember this account on this device</label>
        <Button disabled={loading} className="mt-2 w-full">{loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Authenticating…</> : <>Sign in securely <ArrowRight size={17} /></>}</Button>
      </form>
      <div className="mt-6 flex items-center justify-center gap-2 border-t pt-5 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"><ShieldCheck size={14} className="text-nord-14" /> Local encrypted workspace • Windows 10/11</div>
    </motion.div>
    <p className="relative mt-auto pt-6 text-center text-[10px] uppercase tracking-[.2em] text-[rgb(var(--muted))]">HyperFamily Stores • IT Operations</p>
  </main>
}
