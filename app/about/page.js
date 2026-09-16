'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  RefreshCw,
  Download,
  Rocket,
  Github,
  CircleDot,
  HardDrive,
  Code2,
  ExternalLink,
  CheckCircle2,
  Mail,
  Pause,
  Play,
  Square,
  ScrollText,
  X,
  Sparkles,
  ShieldCheck,
  Radio
} from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import BrandMark from '@/components/layout/BrandMark'
import ChangeLogCard from '@/components/about/ChangeLogCard'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { getApi } from '@/lib/api'
import { APP_NAME, APP_VERSION } from '@/lib/constants'
import stack from '@/lib/technology-stack.json'
import packageInfo from '@/package.json'

// Credit technologies used by the shipped application and its Windows build.
// Versioned labels follow the dependency manifest rather than handwritten majors.
const technologies = stack.map((entry) => {
  const version = packageInfo.dependencies[entry.package] || packageInfo.devDependencies[entry.package]
  const major = entry.showMajor && version?.match(/\d+/)?.[0]
  return { ...entry, name: major ? `${entry.name} ${major}` : entry.name }
})

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
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
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
  const [info, setInfo] = useState({ version: APP_VERSION, platform: 'Windows 10/11', dataPath: '—' })
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  // Which update channel this install follows: 'main' (stable only) or 'beta'.
  const [channel, setChannel] = useState('main')
  // Live transfer figures: how much has arrived, how much is left, how fast.
  const [transfer, setTransfer] = useState({
    transferred: 0,
    total: 0,
    remaining: 0,
    bytesPerSecond: 0,
    etaSeconds: null
  })
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const api = getApi()
    if (!api) return undefined
    api.app
      .info()
      .then(setInfo)
      .catch(() => {})
    api.update
      .channel?.()
      .then((state) => {
        if (state?.channel) setChannel(state.channel)
      })
      .catch(() => {})
    // A previous visit may already have finished the download; restore the
    // button straight into its Install state instead of offering Download again.
    api.update
      .state?.()
      .then((state) => {
        if (!state) return
        setDownloading(Boolean(state.downloading))
        setPaused(Boolean(state.paused))
        setDownloaded(Boolean(state.downloaded))
        setProgress(Number(state.percent) || 0)
        setTransfer({
          transferred: Number(state.transferred) || 0,
          total: Number(state.total) || 0,
          remaining: Number(state.remaining) || 0,
          bytesPerSecond: Number(state.bytesPerSecond) || 0,
          etaSeconds: state.etaSeconds ?? null
        })
      })
      .catch(() => {})

    const unsubscribe = api.update.subscribe((event) => {
      if (event.type === 'progress') {
        setDownloading(true)
        setPaused(false)
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
        setTransfer((current) => ({
          ...current,
          transferred: event.total || current.total,
          remaining: 0,
          bytesPerSecond: 0,
          etaSeconds: null
        }))
        toast.success('Update downloaded — press Install to restart on the new version')
      }
      if (event.type === 'error') {
        setDownloading(false)
        setPaused(false)
        setProgress(0)
        setTransfer({ transferred: 0, total: 0, remaining: 0, bytesPerSecond: 0, etaSeconds: null })
        toast.error(event.message)
      }
      if (event.type === 'paused') {
        setDownloading(false)
        setPaused(true)
        toast.info('Download paused', { description: 'Resume it whenever you are ready.' })
      }
      if (event.type === 'resumed') {
        setPaused(false)
        setDownloading(true)
        toast.info('Download resumed')
      }
      if (event.type === 'stopped') {
        setDownloading(false)
        setPaused(false)
        setProgress(0)
        setTransfer({ transferred: 0, total: 0, remaining: 0, bytesPerSecond: 0, etaSeconds: null })
        toast.info('Download cancelled')
      }
    })
    return () => unsubscribe?.()
  }, [])

  const check = async () => {
    setChecking(true)
    try {
      const result = await getApi().update.check()
      setUpdate(result)
      toast[result.hasUpdate ? 'success' : 'info'](
        result.hasUpdate
          ? `Version ${result.latestVersion} is available`
          : 'You are running the latest version'
      )
    } catch (error) {
      toast.error(error.message)
    } finally {
      setChecking(false)
    }
  }

  /**
   * Switches the update channel. The preference is persisted on the main side
   * (settings key update_channel); the service cancels anything belonging to
   * the old channel, so the screen resets cleanly, and a fresh check runs so
   * the button immediately offers that channel's release. Notably, a beta
   * install that switches to 'main' is offered the newest stable even when
   * its version number is lower (an intentional switch-back downgrade).
   */
  const selectChannel = async (next) => {
    if (next === channel) return
    const previous = channel
    setChannel(next)
    try {
      await getApi().update.setChannel(next)
      setUpdate(null)
      setDownloaded(false)
      setDownloading(false)
      setPaused(false)
      setProgress(0)
      setTransfer({ transferred: 0, total: 0, remaining: 0, bytesPerSecond: 0, etaSeconds: null })
      toast.success(next === 'beta' ? 'Beta updates enabled' : 'Stable (main) updates only', {
        description:
          next === 'beta'
            ? 'You will be offered the newest release, including betas.'
            : 'Only stable releases will be offered — a beta install switches back to the newest stable.'
      })
      await check()
    } catch (error) {
      setChannel(previous)
      toast.error(error.message)
    }
  }

  const external = (url) =>
    getApi()
      .app.openExternal(url)
      .catch((e) => toast.error(e.message))

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
    external(
      `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    )
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
      if (state?.downloaded) {
        setDownloaded(true)
        setProgress(100)
      }
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

  /** Pauses the download; the service keeps the progress so it can resume. */
  const pause = async () => {
    try {
      await getApi().update.pause()
    } catch (error) {
      toast.error(error.message)
    }
  }

  /** Continues a paused download from where it stopped. */
  const resume = async () => {
    try {
      setPaused(false)
      await getApi().update.resume()
    } catch (error) {
      toast.error(error.message)
    }
  }

  /** Cancels the download entirely and clears the progress. */
  const stop = async () => {
    try {
      await getApi().update.stop()
    } catch (error) {
      toast.error(error.message)
    }
  }

  /** Applies the downloaded update and relaunches on the new version. */
  const install = async () => {
    setInstalling(true)
    try {
      toast.message('Installing the update', {
        description: 'The application will close and reopen on the new version.'
      })
      await getApi().update.install()
    } catch (error) {
      setInstalling(false)
      toast.error(error.message)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] space-y-2.5">
        <div>
          <h1 className="page-title">About HyperFamily Monitor</h1>
          <p className="page-subtitle">
            Product information, secure updates, technology credits, and support.
          </p>
        </div>

        {/* ------------------------------------------------------------ hero */}
        {/* Structure contract: the first element child is the decorative layer,
            the second is the content that fills the card's full height. */}
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
                <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight md:text-3xl">
                  {APP_NAME}
                </h2>
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
              ].map(({ icon: Icon, label, value, mono, accent }) => (
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

        {/* --------------------------------------------------------- updates */}
        <div className="grid gap-2.5 lg:grid-cols-[1.15fr_.85fr]">
          <Card
            aria-label="Application updates"
            className="relative flex h-full flex-col overflow-hidden border-[rgb(var(--primary)/.25)]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--primary)/.7)] to-transparent"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[rgb(var(--primary)/.07)] via-transparent to-transparent"
            />
            <CardHeader className="relative p-3 pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Rocket size={15} className="text-[rgb(var(--primary))]" />
                Application updates
              </CardTitle>
              <CardDescription className="mt-0 text-xs leading-snug">
                Updates arrive as a small differential download and install themselves.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative flex h-full flex-col p-3 pt-1">
              {/* The status box reserves the height of both its lines from the
                  start, and the "Latest release" slot is always rendered. That
                  is what keeps the card exactly the same height before a check,
                  after an update is found, and while it downloads. */}
              <div className="flex min-h-[92px] flex-col rounded-xl border bg-[rgb(var(--surface)/.45)] p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <small className="block text-2xs uppercase tracking-wider text-[rgb(var(--muted))]">
                      Installed version
                    </small>
                    <b className="font-mono text-sm">v{info.version}</b>
                  </span>
                  <span className="min-w-0 text-right">
                    <small className="block text-2xs uppercase tracking-wider text-[rgb(var(--muted))]">
                      Latest release
                    </small>
                    <b
                      className={`font-mono text-sm ${update?.hasUpdate ? 'text-[rgb(var(--primary))]' : ''}`}
                    >
                      {update ? `v${update.latestVersion}` : '—'}
                    </b>
                  </span>
                </div>
                {/* One status line, always present, so nothing below it moves. */}
                <div className="mt-2 flex min-h-[18px] items-center gap-1.5 text-2xs leading-none">
                  {update?.hasUpdate && update.downloadSize > 0 ? (
                    <p
                      className="flex min-w-0 items-center gap-1.5 text-[rgb(var(--muted))]"
                      aria-label="Update download size"
                    >
                      <HardDrive size={12} className="shrink-0" />
                      <span className="truncate">
                        Download size{' '}
                        <b className="text-[rgb(var(--text))]">{formatBytes(update.downloadSize)}</b>
                        {update.downloadName ? ` · ${update.downloadName}` : ''}
                      </span>
                    </p>
                  ) : update && !update.hasUpdate ? (
                    <p className="flex items-center gap-1.5 status-online-text">
                      <CheckCircle2 size={12} />
                      You are running the latest version.
                    </p>
                  ) : checking ? (
                    <p className="flex items-center gap-1.5 text-[rgb(var(--muted))]">
                      <RefreshCw size={12} className="animate-spin" />
                      Checking the update channel…
                    </p>
                  ) : (
                    <p className="text-[rgb(var(--muted))]">
                      Press Check for updates to compare with the published release.
                    </p>
                  )}
                </div>
                {(downloading || progress > 0 || downloaded) && (
                  <div className="mt-2" aria-label="Update download progress">
                    <div className="mb-1 flex justify-between text-xs">
                      <span>
                        {downloaded
                          ? 'Update ready to install'
                          : paused
                            ? 'Download paused'
                            : 'Downloading update'}
                      </span>
                      <b>{progress}%</b>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
                      <motion.div
                        animate={{ width: `${progress}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-[rgb(var(--primary))] to-nord-14"
                      />
                    </div>
                    {transfer.total > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-[rgb(var(--muted))]">
                        <span>
                          <b className="text-[rgb(var(--text))]">{formatBytes(transfer.transferred)}</b> of{' '}
                          {formatBytes(transfer.total)}
                          {!downloaded && transfer.remaining > 0 ? (
                            <> · {formatBytes(transfer.remaining)} left</>
                          ) : null}
                        </span>
                        {!downloaded && (transfer.bytesPerSecond > 0 || transfer.etaSeconds) && (
                          <span>
                            {transfer.bytesPerSecond > 0 ? (
                              <b className="text-[rgb(var(--text))]">
                                {formatBytes(transfer.bytesPerSecond)}/s
                              </b>
                            ) : null}
                            {formatDuration(transfer.etaSeconds) ? (
                              <> · {formatDuration(transfer.etaSeconds)} remaining</>
                            ) : null}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1"
                role="radiogroup"
                aria-label="Update channel"
              >
                <span className="text-2xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Update channel
                </span>
                <label
                  className={`flex items-center gap-1.5 text-2xs ${downloading || paused ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="update-channel"
                    className="h-3.5 w-3.5 accent-[rgb(var(--primary))]"
                    checked={channel === 'main'}
                    disabled={downloading || paused}
                    onChange={() => selectChannel('main')}
                  />
                  Main release
                  <span className="text-xs text-[rgb(var(--muted))]">(stable only)</span>
                </label>
                <label
                  className={`flex items-center gap-1.5 text-2xs ${downloading || paused ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="update-channel"
                    className="h-3.5 w-3.5 accent-[rgb(var(--primary))]"
                    checked={channel === 'beta'}
                    disabled={downloading || paused}
                    onChange={() => selectChannel('beta')}
                  />
                  Beta release
                  <span className="text-xs text-[rgb(var(--muted))]">(new features first)</span>
                </label>
              </div>
              {update?.hasUpdate && update.isDowngrade && (
                <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs leading-snug text-amber-600 dark:text-amber-400">
                  Switching to stable: v{update.latestVersion} will replace this beta (v{info.version}) — the
                  version number goes down, but this is the newest main release.
                </p>
              )}
              {update?.hasUpdate && update.latestIsPrerelease && (
                <p className="mt-1.5 rounded-md border border-[rgb(var(--primary)/.25)] bg-[rgb(var(--primary)/.08)] px-2 py-1 text-xs leading-snug text-[rgb(var(--primary))]">
                  v{update.latestVersion} is a beta preview — the newest main release stays on the Main
                  channel.
                </p>
              )}

              {/* Pinned to the bottom of the card, so the rare beta/downgrade
                  notice above it can appear without moving anything. */}
              <div className="mt-auto flex min-h-[38px] flex-wrap items-center gap-1.5 pt-2">
                <Button size="sm" onClick={check} disabled={checking} variant="secondary">
                  <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
                  {checking ? 'Checking…' : 'Check for updates'}
                </Button>
                {update?.hasUpdate && !downloaded && !downloading && !paused && (
                  <Button size="sm" onClick={download}>
                    <Download size={14} />
                    Download v{update.latestVersion}
                    {update.downloadSize > 0 ? ` (${formatBytes(update.downloadSize)})` : ''}
                  </Button>
                )}
                {downloading && !paused && (
                  <>
                    <Button size="sm" variant="secondary" onClick={pause}>
                      <Pause size={14} />
                      Pause
                    </Button>
                    <Button size="sm" variant="ghost" onClick={stop}>
                      <Square size={14} />
                      Stop
                    </Button>
                  </>
                )}
                {paused && (
                  <>
                    <Button size="sm" onClick={resume}>
                      <Play size={14} />
                      Resume
                    </Button>
                    <Button size="sm" variant="ghost" onClick={stop}>
                      <Square size={14} />
                      Stop
                    </Button>
                  </>
                )}
                {downloaded && (
                  <Button size="sm" variant="success" onClick={install} disabled={installing}>
                    <Rocket size={14} />
                    {installing ? 'Installing…' : 'Install and restart'}
                  </Button>
                )}
                {update?.hasUpdate && update.releaseNotes && (
                  <Button size="sm" variant="ghost" onClick={() => setChangelogOpen(true)}>
                    <ScrollText size={14} />
                    View changelog
                  </Button>
                )}
                {update?.hasUpdate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => external(update.downloadUrl || `${REPO}/releases/latest`)}
                  >
                    <Github size={14} />
                    Get it from GitHub
                  </Button>
                )}
              </div>

              {/* Reserved height: the notes of a found update appear here
                  without changing the card's size. Full notes: Change log. */}
              <p className="mt-2 line-clamp-2 min-h-[30px] whitespace-pre-line text-2xs leading-relaxed text-[rgb(var(--muted))]">
                {update?.hasUpdate && update.releaseNotes ? update.releaseNotes : ''}
              </p>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------- support */}
          <Card className="relative flex h-full flex-col overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-nord-14/6 via-transparent to-[rgb(var(--primary)/.04)]"
            />
            <CardHeader className="relative p-3 pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck size={15} className="text-nord-14" />
                Support &amp; source
              </CardTitle>
              <CardDescription className="mt-0 text-xs leading-snug">
                Report a reproducible issue, browse the repository, or reach the developer directly.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative flex h-full flex-col gap-1.5 p-3 pt-1">
              <button
                type="button"
                onClick={emailDeveloper}
                className="contact-card group flex w-full items-center gap-2.5 rounded-xl border bg-[rgb(var(--surface)/.45)] px-2.5 py-2.5 text-left transition hover:border-[rgb(var(--primary)/.4)]"
                aria-label={`Send an email to ${DEVELOPER_EMAIL}`}
              >
                <span className="contact-card-icon grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[rgb(var(--primary)/.12)] text-[rgb(var(--primary))] transition">
                  <Mail size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-2xs">Developer contact · Ali Ajeli Lahiji</b>
                  <span className="block truncate font-mono text-xs text-[rgb(var(--primary))] underline-offset-2 group-hover:underline">
                    {DEVELOPER_EMAIL}
                  </span>
                </span>
                <ExternalLink
                  size={14}
                  className="shrink-0 text-[rgb(var(--muted))] transition group-hover:text-[rgb(var(--primary))]"
                />
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="justify-start"
                  onClick={() => external(`${REPO}/issues/new`)}
                >
                  <CircleDot size={14} />
                  Report an issue
                </Button>
                <Button size="sm" className="justify-start" onClick={() => external(REPO)}>
                  <Github size={14} />
                  Repository
                </Button>
              </div>
              <p className="mt-auto rounded-xl border border-dashed bg-[rgb(var(--surface)/.35)] px-2.5 py-2 text-2xs leading-relaxed text-[rgb(var(--muted))]">
                Issues are triaged against the audit log and the version shown above — include both when
                reporting so a fix can be reproduced exactly.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------- tech stack */}
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm">Production technology stack</CardTitle>
            <CardDescription className="mt-0 text-xs leading-snug">
              Core runtime, interface, data protection, native Agent, and Windows build tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
              {technologies.map(({ name, description, brand, brandDark, url }, index) => (
                <motion.button
                  key={name}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  whileHover={{ y: -4, scale: 1.03 }}
                  whileTap={{ scale: 0.99 }}
                  style={{ '--brand': brand, '--brand-dark': brandDark }}
                  /* A real <button>: the pointer cursor, keyboard focus and the
                     click are all native, and the click opens the project's own
                     website in the system browser. */
                  onClick={() => url && external(url)}
                  title={`${description} — open ${name} in your browser`}
                  aria-label={`${name}: ${description}. Opens ${url} in your browser`}
                  className="tech-tile group relative min-w-0 cursor-pointer overflow-hidden rounded-xl border bg-[rgb(var(--surface)/.38)] px-2.5 py-2 text-left"
                >
                  <span aria-hidden className="tech-tile-wash" />
                  <b className="tech-tile-name relative block text-xs leading-snug">
                    {name}
                    <ExternalLink
                      size={9}
                      aria-hidden
                      className="ml-1 inline-block align-baseline opacity-0 transition-opacity duration-200 group-hover:opacity-70"
                    />
                  </b>
                  <p className="relative mt-0.5 text-xs leading-snug text-[rgb(var(--muted))]">
                    {description}
                  </p>
                </motion.button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Every release is recorded in lib/changelog.json, which is also what
            the release workflows publish as the GitHub release notes. */}
        <ChangeLogCard
          version={info.version}
          updateVersion={update?.hasUpdate ? update.latestVersion : null}
          updateNotes={update?.releaseNotes}
          onOpenExternal={external}
        />

        <footer className="pb-0.5 text-center text-xs uppercase tracking-widest text-[rgb(var(--muted))]">
          © 2026 HyperFamily Stores • MIT License • Built by Ali Ajeli Lahiji
        </footer>

        {/* Changelog of the available update, over a blurred page (v2.0.16). */}
        <DialogPrimitive.Root open={changelogOpen} onOpenChange={setChangelogOpen}>
          <AnimatePresence>
            {changelogOpen && update?.hasUpdate && (
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
                    className="dialog-content glass fixed left-1/2 top-1/2 z-[80] flex max-h-[80vh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-[rgb(var(--surface))] p-3.5 shadow-2xl outline-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-[rgb(var(--primary)/.14)] p-1.5 text-[rgb(var(--primary))]">
                        <ScrollText size={15} />
                      </div>
                      <div>
                        <DialogPrimitive.Title className="text-sm font-extrabold">
                          What's new in v{update.latestVersion}
                        </DialogPrimitive.Title>
                        <DialogPrimitive.Description className="text-xs text-[rgb(var(--muted))]">
                          The release notes published with this update.
                        </DialogPrimitive.Description>
                      </div>
                      <DialogPrimitive.Close asChild>
                        <button
                          type="button"
                          aria-label="Close changelog"
                          className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]"
                        >
                          <X size={15} />
                        </button>
                      </DialogPrimitive.Close>
                    </div>
                    <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-[rgb(var(--canvas)/.6)] p-3 text-2xs leading-relaxed">
                      {update.releaseNotes}
                    </div>
                    <div className="mt-2.5 flex items-center justify-end border-t pt-2.5">
                      <DialogPrimitive.Close asChild>
                        <Button size="sm">Close</Button>
                      </DialogPrimitive.Close>
                    </div>
                  </motion.div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            )}
          </AnimatePresence>
        </DialogPrimitive.Root>
      </div>
    </AppShell>
  )
}
