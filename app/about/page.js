'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Download, Rocket, Github, CircleDot, Calendar, HardDrive, ShieldCheck, Code2, ExternalLink, CheckCircle2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import BrandMark from '@/components/layout/BrandMark'
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { getApi } from '@/lib/api'

/**
 * Each entry carries the brand colour of the technology it names. The tiles
 * rest in the neutral surface palette and bloom into that colour on hover, so
 * the stack reads as a calm grid until the pointer explores it.
 */
const technologies = [
  ['Next.js 15', 'Static App Router UI', '#000000', '#8FBCBB'],
  ['Electron 41', 'Secure Windows shell', '#2B2E3A', '#9FEAF9'],
  ['Encrypted SQLite', 'Local operational data', '#0F80CC', '#6FC3F7'],
  ['Framer Motion 11', 'Interface motion', '#BB4B96', '#E879C4'],
  ['shadcn/ui', 'Accessible components', '#111827', '#A3AEC2'],
  ['Recharts', 'Live response charts', '#22B5BF', '#5FD8E0'],
  ['Zustand', 'Focused client state', '#7A5233', '#C79A6B'],
  ['Tailwind CSS', 'Themeable design system', '#38BDF8', '#7DD3FC'],
  ['Lucide Icons', 'Interface iconography', '#F56565', '#FCA5A5'],
  ['ssh2', 'In-app SSH terminal', '#4C8B2B', '#A3BE8C'],
  ['ExcelJS', 'Inventory workbooks', '#1D6F42', '#6FCF97'],
  ['Windows DPAPI', 'Secret encryption', '#0078D4', '#69B7F0']
]

/** Developer contact. mailto: hands the address to the default mail client. */
const DEVELOPER_EMAIL = 'Lahiji.ali@hyperfamili.com'

const REPO = 'https://github.com/aliajeli/hyperfamily-it-app'

/** 183807865 -> "175.3 MB". Sizes are shown in the units users recognise. */
function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let size = value
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
  return `${size.toFixed(index === 0 ? 0 : size >= 100 ? 0 : 1)} ${units[index]}`
}

/** 95 -> "1m 35s", used for the estimated time remaining. */
function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value < 60) return `${Math.round(value)}s`
  const minutes = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export default function AboutPage() {
  const [info, setInfo] = useState({ version: '2.0.11', platform: 'Windows 10/11', dataPath: '—' })
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  // Live transfer figures: how much has arrived, how much is left, how fast.
  const [transfer, setTransfer] = useState({ transferred: 0, total: 0, remaining: 0, bytesPerSecond: 0, etaSeconds: null })
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const api = getApi()
    if (!api) return undefined
    api.app.info().then(setInfo).catch(() => {})
    // A previous visit may already have finished the download; restore the
    // button straight into its Install state instead of offering Download again.
    api.update.state?.().then((state) => {
      if (!state) return
      setDownloading(Boolean(state.downloading))
      setDownloaded(Boolean(state.downloaded))
      setProgress(Number(state.percent) || 0)
      setTransfer({
        transferred: Number(state.transferred) || 0,
        total: Number(state.total) || 0,
        remaining: Number(state.remaining) || 0,
        bytesPerSecond: Number(state.bytesPerSecond) || 0,
        etaSeconds: state.etaSeconds ?? null
      })
    }).catch(() => {})

    const unsubscribe = api.update.subscribe((event) => {
      if (event.type === 'progress') {
        setDownloading(true)
        setProgress(Math.round(event.percent || 0))
        setTransfer({
          transferred: Number(event.transferred) || 0,
          total: Number(event.total) || 0,
          remaining: Number(event.remaining) || 0,
          bytesPerSecond: Number(event.bytesPerSecond) || 0,
          etaSeconds: event.etaSeconds ?? null
        })
      }
      if (event.type === 'downloaded') {
        setDownloading(false)
        setDownloaded(true)
        setProgress(100)
        setTransfer((current) => ({ ...current, transferred: event.total || current.total, remaining: 0, bytesPerSecond: 0, etaSeconds: null }))
        toast.success('Update downloaded — press Install to restart on the new version')
      }
      if (event.type === 'error') {
        setDownloading(false)
        setProgress(0)
        setTransfer({ transferred: 0, total: 0, remaining: 0, bytesPerSecond: 0, etaSeconds: null })
        toast.error(event.message)
      }
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

  /**
   * Opens the default mail client (Outlook on the target Windows machines) with
   * a message already addressed to the developer. Subject and body carry the
   * app version and platform so a report arrives with its context attached.
   */
  const emailDeveloper = () => {
    const subject = `HyperFamily Branch Monitor ${info.version} — feedback`
    const body = [
      'Hello Ali,',
      '',
      '',
      '---',
      `Application: HyperFamily Branch Monitor ${info.version}`,
      `Platform: ${info.platform || 'Windows'}`
    ].join('\r\n')
    external(`mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  /**
   * Downloads the installer in the background. The service already falls back
   * to the plain GitHub asset internally, so only a total failure opens the
   * release page in the browser.
   */
  const download = async () => {
    setDownloading(true)
    setProgress(1)
    try {
      const state = await getApi().update.download()
      if (state?.downloaded) { setDownloaded(true); setProgress(100) }
    } catch (error) {
      setDownloading(false)
      setProgress(0)
      const target = update?.downloadUrl || `${REPO}/releases/latest`
      toast.message('Opening the GitHub release instead', { description: error.message })
      external(target)
    } finally {
      setDownloading(false)
    }
  }

  /** Applies the downloaded update and relaunches on the new version. */
  const install = async () => {
    setInstalling(true)
    try {
      toast.message('Installing the update', { description: 'The application will close and reopen on the new version.' })
      await getApi().update.install()
    } catch (error) {
      setInstalling(false)
      toast.error(error.message)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] space-y-2">
        <div>
          <h1 className="page-title">About HyperFamily Monitor</h1>
          <p className="page-subtitle">Product information, secure updates, technology credits, and support.</p>
        </div>

        <div className="grid gap-2 lg:grid-cols-[1.05fr_.95fr]">
          <Card className="relative overflow-hidden">
            <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[rgb(var(--primary)/.16)] blur-3xl" />
            <CardContent className="relative flex min-h-0 flex-col justify-center p-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <BrandMark className="h-10 w-10 shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black">HyperFamily Branch Monitor</h2>
                    <Badge status="online" className="px-1.5 py-0.5 text-[9px]">v{info.version}</Badge>
                  </div>
                  <p className="mt-0.5 max-w-xl text-[10.5px] leading-snug text-[rgb(var(--muted))]">
                    A secure desktop control center for retail branch connectivity, inventory, remote support, and operational visibility.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                    <span className="flex items-center gap-1.5"><Code2 size={12} className="text-nord-8" />Ali Ajeli Lahiji</span>
                    <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-nord-14" />HyperFamily Stores</span>
                    <span className="flex items-center gap-1.5"><Calendar size={12} className="text-nord-13" />v{info.version}</span>
                    <span className="flex items-center gap-1.5"><HardDrive size={12} className="text-nord-15" />{info.platform}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-2.5 pb-1">
              <CardTitle className="flex items-center gap-2 text-[13px]"><Rocket size={15} />Application updates</CardTitle>
              <CardDescription className="mt-0 text-[10.5px] leading-snug">Updates arrive as a small differential download and install themselves.</CardDescription>
            </CardHeader>
            <CardContent className="p-2.5 pt-1">
              <div className="rounded-lg border bg-[rgb(var(--surface)/.42)] p-2">
                <div className="flex items-center justify-between">
                  <span>
                    <small className="block text-[9.5px] uppercase tracking-wider text-[rgb(var(--muted))]">Installed version</small>
                    <b className="text-[13px]">v{info.version}</b>
                  </span>
                  {update && (
                    <span className="text-right">
                      <small className="block text-[9.5px] uppercase tracking-wider text-[rgb(var(--muted))]">Latest release</small>
                      <b className={`text-[13px] ${update.hasUpdate ? 'text-[rgb(var(--primary))]' : ''}`}>v{update.latestVersion}</b>
                    </span>
                  )}
                </div>
                {update?.hasUpdate && update.downloadSize > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[rgb(var(--muted))]" aria-label="Update download size">
                    <HardDrive size={12} />
                    Download size <b className="text-[rgb(var(--text))]">{formatBytes(update.downloadSize)}</b>
                    {update.downloadName ? <span className="truncate opacity-70">· {update.downloadName}</span> : null}
                  </p>
                )}
                {update && !update.hasUpdate && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] status-online-text"><CheckCircle2 size={12} />You are running the latest version.</p>
                )}
                {(downloading || progress > 0 || downloaded) && (
                  <div className="mt-3" aria-label="Update download progress">
                    <div className="mb-1 flex justify-between text-[9.5px]">
                      <span>{downloaded ? 'Update ready to install' : 'Downloading update'}</span>
                      <b>{progress}%</b>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
                      <motion.div animate={{ width: `${progress}%` }} className="h-full bg-[rgb(var(--primary))]" />
                    </div>
                    {transfer.total > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] text-[rgb(var(--muted))]">
                        <span>
                          <b className="text-[rgb(var(--text))]">{formatBytes(transfer.transferred)}</b> of {formatBytes(transfer.total)}
                          {!downloaded && transfer.remaining > 0 ? <> · {formatBytes(transfer.remaining)} left</> : null}
                        </span>
                        {!downloaded && (transfer.bytesPerSecond > 0 || transfer.etaSeconds) && (
                          <span>
                            {transfer.bytesPerSecond > 0 ? <b className="text-[rgb(var(--text))]">{formatBytes(transfer.bytesPerSecond)}/s</b> : null}
                            {formatDuration(transfer.etaSeconds) ? <> · {formatDuration(transfer.etaSeconds)} remaining</> : null}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={check} disabled={checking} variant="secondary">
                  <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />{checking ? 'Checking…' : 'Check for updates'}
                </Button>
                {update?.hasUpdate && !downloaded && (
                  <Button size="sm" onClick={download} disabled={downloading}>
                    {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                    {downloading
                      ? `Downloading ${progress}%`
                      : `Download v${update.latestVersion}${update.downloadSize > 0 ? ` (${formatBytes(update.downloadSize)})` : ''}`}
                  </Button>
                )}
                {downloaded && (
                  <Button size="sm" variant="success" onClick={install} disabled={installing}>
                    <Rocket size={14} />{installing ? 'Installing…' : 'Install and restart'}
                  </Button>
                )}
                {update?.hasUpdate && (
                  <Button size="sm" variant="ghost" onClick={() => external(update.downloadUrl || `${REPO}/releases/latest`)}>
                    <Github size={14} />Get it from GitHub
                  </Button>
                )}
              </div>

              {update?.releaseNotes && <p className="mt-2 line-clamp-2 whitespace-pre-line text-[11px] leading-relaxed text-[rgb(var(--muted))]">{update.releaseNotes}</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="p-2.5 pb-1">
            <CardTitle className="text-[13px]">Production technology stack</CardTitle>
            <CardDescription className="mt-0 text-[10.5px] leading-snug">Focused tools selected for a responsive, offline-first Windows application.</CardDescription>
          </CardHeader>
          <CardContent className="p-2.5 pt-1">
            <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
              {technologies.map(([name, description, brand, brandDark], index) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .02 }}
                  whileHover={{ y: -4, scale: 1.03 }}
                  whileTap={{ scale: .99 }}
                  style={{ '--brand': brand, '--brand-dark': brandDark }}
                  title={description}
                  className="tech-tile group relative min-w-0 overflow-hidden rounded-lg border bg-[rgb(var(--surface)/.38)] px-2 py-1.5"
                >
                  <span aria-hidden className="tech-tile-wash" />
                  <b className="tech-tile-name relative block truncate text-[10.5px]">{name}</b>
                  <p className="relative truncate text-[9px] leading-snug text-[rgb(var(--muted))]">{description}</p>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-2 lg:grid-cols-2">
        <Card className="p-2.5">
          <div className="flex h-full flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-bold">Need help with branch infrastructure?</h3>
              <p className="text-[10px] leading-snug text-[rgb(var(--muted))]">Report a reproducible issue or browse the source repository.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => external(`${REPO}/issues/new`)}><CircleDot size={14} />Report an issue</Button>
              <Button size="sm" onClick={() => external(REPO)}><Github size={14} />GitHub <ExternalLink size={12} /></Button>
            </div>
          </div>
        </Card>

        <Card className="p-2.5">
          <button
            type="button"
            onClick={emailDeveloper}
            className="contact-card group flex h-full w-full items-center gap-2.5 rounded-lg border bg-[rgb(var(--surface)/.38)] px-2.5 py-2 text-left transition"
            aria-label={`Send an email to ${DEVELOPER_EMAIL}`}
          >
            <span className="contact-card-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))] transition">
              <Mail size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[11px]">Developer contact · Ali Ajeli Lahiji</b>
              <span className="block truncate font-mono text-[10.5px] text-[rgb(var(--primary))] underline-offset-2 group-hover:underline">{DEVELOPER_EMAIL}</span>
            </span>
            <ExternalLink size={14} className="shrink-0 text-[rgb(var(--muted))] transition group-hover:text-[rgb(var(--primary))]" />
          </button>
        </Card>
        </div>

        <footer className="pb-0.5 text-center text-[9px] uppercase tracking-widest text-[rgb(var(--muted))]">© 2026 HyperFamily Stores • MIT License • Built by Ali Ajeli Lahiji</footer>
      </div>
    </AppShell>
  )
}
