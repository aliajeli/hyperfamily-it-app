'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Download, Rocket, Github, CircleDot, Calendar, HardDrive, ShieldCheck, Code2, ExternalLink, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import BrandMark from '@/components/layout/BrandMark'
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { getApi } from '@/lib/api'

const technologies = [
  ['Next.js 15', 'Static App Router UI'], ['Electron 41', 'Secure Windows shell'], ['Encrypted SQLite', 'Local operational data'],
  ['Framer Motion 11', 'Interface motion'], ['shadcn/ui', 'Accessible components'], ['Recharts', 'Live response charts'],
  ['Zustand', 'Focused client state'], ['Tailwind CSS', 'Themeable design system'], ['Lucide Icons', 'Interface iconography'],
  ['ssh2', 'In-app SSH terminal'], ['ExcelJS', 'Inventory workbooks'], ['Windows DPAPI', 'Secret encryption']
]

const REPO = 'https://github.com/aliajeli/hyperfamily-it-app'

export default function AboutPage() {
  const [info, setInfo] = useState({ version: '2.0.2', platform: 'Windows 10/11', dataPath: '—' })
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    getApi().app.info().then(setInfo).catch(() => {})
    const unsubscribe = getApi().update.subscribe((event) => {
      if (event.type === 'progress') setProgress(Math.round(event.percent))
      if (event.type === 'downloaded') { setDownloaded(true); setProgress(100); toast.success('Update ready to install') }
      if (event.type === 'error') { setProgress(0); toast.error(event.message) }
    })
    return () => unsubscribe?.()
  }, [])

  const check = async () => {
    setChecking(true)
    try {
      const result = await getApi().update.check()
      setUpdate(result)
      toast[result.hasUpdate ? 'success' : 'info'](result.hasUpdate ? `Version ${result.latestVersion} is available` : 'You are running the latest version')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setChecking(false)
    }
  }

  const external = (url) => getApi().app.openExternal(url).catch((e) => toast.error(e.message))

  /** In-app download; falls back to the GitHub release asset when unavailable. */
  const download = async () => {
    try {
      setProgress(1)
      await getApi().update.download()
    } catch (error) {
      setProgress(0)
      const target = update?.downloadUrl || `${REPO}/releases/latest`
      toast.message('Opening the GitHub release', { description: error.message })
      external(target)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] space-y-2.5">
        <div>
          <h1 className="page-title">About HyperFamily Monitor</h1>
          <p className="page-subtitle">Product information, secure updates, technology credits, and support.</p>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-[1.05fr_.95fr]">
          <Card className="relative overflow-hidden">
            <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[rgb(var(--primary)/.16)] blur-3xl" />
            <CardContent className="relative flex min-h-44 flex-col justify-center p-4">
              <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
                <BrandMark className="h-14 w-14 shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">HyperFamily Branch Monitor</h2>
                    <Badge status="online">v{info.version}</Badge>
                  </div>
                  <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[rgb(var(--muted))]">
                    A secure desktop control center for retail branch connectivity, inventory, remote support, and operational visibility.
                  </p>
                  <div className="mt-3 grid gap-1.5 text-[11px] sm:grid-cols-2">
                    <span className="flex items-center gap-2"><Code2 size={13} className="text-nord-8" />Ali Ajeli Lahiji</span>
                    <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-nord-14" />HyperFamily Stores</span>
                    <span className="flex items-center gap-2"><Calendar size={13} className="text-nord-13" />Version {info.version}</span>
                    <span className="flex items-center gap-2"><HardDrive size={13} className="text-nord-15" />{info.platform}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2.5">
              <CardTitle className="flex items-center gap-2 text-base"><Rocket size={16} />Application updates</CardTitle>
              <CardDescription className="text-xs">Every release is published on GitHub as a signed Windows installer.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border bg-[rgb(var(--surface)/.42)] p-3">
                <div className="flex items-center justify-between">
                  <span>
                    <small className="block text-[9.5px] uppercase tracking-wider text-[rgb(var(--muted))]">Installed version</small>
                    <b className="text-sm">v{info.version}</b>
                  </span>
                  {update && (
                    <span className="text-right">
                      <small className="block text-[9.5px] uppercase tracking-wider text-[rgb(var(--muted))]">Latest release</small>
                      <b className={`text-sm ${update.hasUpdate ? 'text-[rgb(var(--primary))]' : ''}`}>v{update.latestVersion}</b>
                    </span>
                  )}
                </div>
                {update && !update.hasUpdate && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] status-online-text"><CheckCircle2 size={12} />You are running the latest version.</p>
                )}
                {progress > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[9.5px]"><span>Downloading update</span><b>{progress}%</b></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
                      <motion.div animate={{ width: `${progress}%` }} className="h-full bg-[rgb(var(--primary))]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={check} disabled={checking} variant="secondary">
                  <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />{checking ? 'Checking…' : 'Check for updates'}
                </Button>
                {update?.hasUpdate && !downloaded && <Button size="sm" onClick={download}><Download size={14} />Download v{update.latestVersion}</Button>}
                {downloaded && <Button size="sm" variant="success" onClick={() => getApi().update.install()}><Rocket size={14} />Restart and install</Button>}
                {update?.hasUpdate && (
                  <Button size="sm" variant="ghost" onClick={() => external(update.downloadUrl || `${REPO}/releases/latest`)}>
                    <Github size={14} />Get it from GitHub
                  </Button>
                )}
              </div>

              {update?.releaseNotes && <p className="mt-3 line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed text-[rgb(var(--muted))]">{update.releaseNotes}</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2.5">
            <CardTitle className="text-base">Production technology stack</CardTitle>
            <CardDescription className="text-xs">Focused tools selected for a responsive, offline-first Windows application.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {technologies.map(([name, description], index) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .02 }}
                  whileHover={{ y: -2 }}
                  className="rounded-xl border bg-[rgb(var(--surface)/.38)] p-2.5"
                >
                  <b className="text-[11px]">{name}</b>
                  <p className="mt-0.5 text-[9.5px] leading-relaxed text-[rgb(var(--muted))]">{description}</p>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="p-3.5">
          <div className="flex flex-col justify-between gap-2.5 md:flex-row md:items-center">
            <div>
              <h3 className="text-sm font-bold">Need help with branch infrastructure?</h3>
              <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">Report a reproducible application issue or review the public source repository on GitHub.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => external(`${REPO}/issues/new`)}><CircleDot size={14} />Report an issue</Button>
              <Button size="sm" onClick={() => external(REPO)}><Github size={14} />View on GitHub <ExternalLink size={12} /></Button>
            </div>
          </div>
        </Card>

        <footer className="pb-2 text-center text-[9.5px] uppercase tracking-widest text-[rgb(var(--muted))]">© 2026 HyperFamily Stores • MIT License • Built by Ali Ajeli Lahiji</footer>
      </div>
    </AppShell>
  )
}
