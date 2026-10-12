'use client'

import { motion } from 'framer-motion'
import { Code2, HardDrive, Radio, Rocket, Sparkles } from 'lucide-react'
import BrandMark from '@/components/layout/BrandMark'
import { APP_NAME } from '@/lib/constants'

/**
 * The About hero: brand block plus the glass spec panel (version, platform,
 * update channel, developer). Presentational — the page passes the live info.
 */
export default function AboutHero({ info, channel }: any) {
  return (
    /* Structure contract: the first element child is the decorative layer,
        the second is the content that fills the card's full height. */
    <section
      aria-label="Product overview"
      className="relative flex flex-col overflow-hidden rounded-3xl border border-[rgb(var(--primary)/.28)] shadow-lg shadow-[rgb(var(--primary)/.06)]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--primary)/.16)] via-[rgb(var(--surface)/.4)] to-[rgb(var(--primary)/.05)]" />
        {/* Soft glows as static radial gradients — a blur filter this size
            would re-rasterize constantly and even destabilise software
            renderers; gradients look the same for zero render cost. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(34rem 30rem at -6rem -10rem, rgb(var(--primary) / .20), transparent 62%), radial-gradient(30rem 26rem at calc(100% - 4rem) calc(100% + 8rem), rgb(var(--primary) / .12), transparent 62%)'
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(rgb(var(--primary) / .14) 1px, transparent 1px)',
            backgroundSize: '22px 22px'
          }}
        />
      </div>

      <div className="relative flex h-full flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-white/25 bg-[rgb(var(--surface)/.6)] shadow-xl shadow-[rgb(var(--primary)/.15)] backdrop-blur-xl"
          >
            <BrandMark className="h-11 w-11" symbol />
          </motion.div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-2xs font-extrabold uppercase tracking-[.22em] text-[rgb(var(--primary))]">
              <Sparkles size={11} />
              HyperFamily Stores · IT Operations
            </p>
            <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight md:text-3xl">{APP_NAME}</h2>
            <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[rgb(var(--muted))]">
              Branch connectivity, live monitoring, asset inventory and remote support — one calm Windows
              workspace for every store.
            </p>
          </div>
        </div>

        {/* Glass spec panel — the four facts at a glance. */}
        <div className="grid w-full max-w-md shrink-0 grid-cols-2 gap-1.5 rounded-2xl border border-white/25 bg-[rgb(var(--surface)/.5)] p-2 shadow-xl shadow-black/5 backdrop-blur-xl">
          {[
            {
              icon: Rocket,
              label: info.version.includes('-') ? 'Preview release' : 'Stable release',
              value: `v${info.version}`,
              mono: true,
              accent: true
            },
            { icon: HardDrive, label: 'Platform', value: info.platform },
            { icon: Radio, label: 'Update channel', value: channel === 'beta' ? 'Beta' : 'Main' },
            { icon: Code2, label: 'Developer', value: 'Ali Ajeli Lahiji' }
          ].map(({ icon: Icon, label, value, mono, accent }: any) => (
            <div
              key={label}
              className="flex flex-col justify-between gap-1 rounded-xl border border-[rgb(var(--primary)/.12)] bg-[rgb(var(--surface)/.65)] px-2.5 py-2 transition-colors hover:border-[rgb(var(--primary)/.3)]"
            >
              <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                <Icon size={11} className={accent ? 'text-[rgb(var(--primary))]' : ''} />
                {label}
              </span>
              <span
                className={`truncate text-sm font-bold ${mono ? 'font-mono' : ''} ${accent ? 'text-[rgb(var(--primary))]' : 'text-[rgb(var(--text))]'}`}
                title={value}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
