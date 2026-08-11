'use client'

import { Check, Palette } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card } from '@/components/ui'
import { THEMES } from '@/lib/constants'
import { getApi } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function ThemeSettings({ settings, onSaved }) {
  const choose = async (theme) => { document.documentElement.dataset.theme = theme; try { const next = await getApi().settings.save({ theme }); onSaved(next); toast.success(`${THEMES.find((x) => x.id === theme)?.name} theme applied`) } catch (error) { toast.error(error.message) } }
  return <div><div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-nord-15/15 p-2.5 text-nord-15"><Palette size={20} /></div><div><h2 className="font-bold">Nord color system</h2><p className="text-sm text-[rgb(var(--muted))]">Choose a calm, accessible palette for your operations workspace.</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{THEMES.map((theme) => { const selected = settings.theme === theme.id; return <motion.button whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: .99 }} key={theme.id} onClick={() => choose(theme.id)} className="text-left"><Card className={cn('relative overflow-hidden p-4 transition', selected && 'ring-2 ring-[rgb(var(--primary))] ring-offset-2 ring-offset-[rgb(var(--canvas))]')}>{selected && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[rgb(var(--primary))] text-white"><Check size={14} /></span>}<div className="mb-5 flex h-24 overflow-hidden rounded-xl border">{theme.colors.map((color, i) => <span key={color} style={{ background: color, flex: i === 3 ? 1.5 : 1 }} />)}</div><b>{theme.name}</b><p className="mt-1 text-xs text-[rgb(var(--muted))]">{theme.description}</p></Card></motion.button> })}</div></div>
}
