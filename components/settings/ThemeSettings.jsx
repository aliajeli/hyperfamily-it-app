'use client'

import { Check, Moon, Palette, Sun } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card } from '@/components/ui'
import { THEMES } from '@/lib/constants'
import { getApi } from '@/lib/api'
import { cn } from '@/lib/utils'

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme.id
  document.documentElement.dataset.colorMode = theme.mode
}

export default function ThemeSettings({ settings, onSaved }) {
  const choose = async (theme) => {
    const previous = THEMES.find((item) => item.id === settings.theme) || THEMES[0]
    applyTheme(theme)
    try {
      const next = await getApi().settings.save({ theme: theme.id })
      onSaved(next)
      toast.success(`${theme.name} theme applied`)
    } catch (error) {
      applyTheme(previous)
      toast.error(error.message)
    }
  }

  const renderGroup = (mode) => {
    const dark = mode === 'dark'
    const themes = THEMES.filter((theme) => theme.mode === mode)
    return (
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${dark ? 'bg-nord-0 text-nord-6' : 'bg-nord-5 text-nord-3'}`}>{dark ? <Moon size={15} /> : <Sun size={15} />}</span>
          <div><h3 className="text-sm font-black">{dark ? 'Dark Nord themes' : 'Light Nord themes'}</h3><p className="text-[10px] text-[rgb(var(--muted))]">{themes.length} complete color palettes</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {themes.map((theme) => {
            const selected = settings.theme === theme.id
            return (
              <motion.button whileHover={{ y: -3, scale: 1.008 }} whileTap={{ scale: .99 }} key={theme.id} onClick={() => choose(theme)} className="text-left">
                <Card className={cn('relative h-full overflow-hidden p-3 transition', selected && 'ring-2 ring-[rgb(var(--primary))] ring-offset-2 ring-offset-[rgb(var(--canvas))]')}>
                  {selected && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-[rgb(var(--primary))] text-white"><Check size={13} /></span>}
                  <div className="mb-3 flex h-16 overflow-hidden rounded-lg border">{theme.colors.map((color, index) => <span key={`${theme.id}-${color}`} style={{ background: color, flex: index === 3 ? 1.5 : 1 }} />)}</div>
                  <div className="flex items-center gap-1.5"><b className="text-sm">{theme.name}</b><span className="rounded-full bg-[rgb(var(--border)/.65)] px-1.5 py-0.5 text-[7px] font-extrabold uppercase text-[rgb(var(--muted))]">{theme.mode}</span></div>
                  <p className="mt-1 text-[10px] leading-4 text-[rgb(var(--muted))]">{theme.description}</p>
                </Card>
              </motion.button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-nord-15/15 p-2.5 text-nord-15"><Palette size={20} /></div><div><h2 className="font-bold">Nord color system</h2><p className="text-sm text-[rgb(var(--muted))]">Choose from four light and four dark themes. Every palette uses only official Nord colors.</p></div></div>
      <div className="space-y-6">{renderGroup('light')}{renderGroup('dark')}</div>
    </div>
  )
}
