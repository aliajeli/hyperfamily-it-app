'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import AboutHero from '@/components/about/AboutHero'
import ChangeLogCard from '@/components/about/ChangeLogCard'
import SupportCard from '@/components/about/SupportCard'
import TechStackCard from '@/components/about/TechStackCard'
import UpdateChangelogDialog from '@/components/about/UpdateChangelogDialog'
import UpdatePanel from '@/components/about/UpdatePanel'
import CompanionUpdateCard from '@/components/mobile/CompanionUpdateCard'
import { getApi } from '@/lib/api'
import { DEVELOPER_EMAIL, REPO } from '@/lib/about-presentation'
import { APP_VERSION } from '@/lib/constants'
import { usePageHeaderStore } from '@/stores/page-header.store'

export default function AboutPage() {
  const { setHeader } = usePageHeaderStore()

  const [info, setInfo] = useState<any>({ version: APP_VERSION, platform: 'Windows 10/11', dataPath: '—' })
  const [update, setUpdate] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [channel, setChannel] = useState('main')
  const [transfer, setTransfer] = useState<any>({
    transferred: 0,
    total: 0,
    remaining: 0,
    bytesPerSecond: 0,
    etaSeconds: null
  })
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    setHeader({
      title: 'About HyperFamily Monitor',
      subtitle: 'Product information, secure updates, technology credits, and support.'
    })
    return () => usePageHeaderStore.getState().clearHeader()
  }, [])

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

  const pause = async () => {
    try {
      await getApi().update.pause()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const resume = async () => {
    try {
      setPaused(false)
      await getApi().update.resume()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const stop = async () => {
    try {
      await getApi().update.stop()
    } catch (error) {
      toast.error(error.message)
    }
  }

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
        <AboutHero info={info} channel={channel} />

        <CompanionUpdateCard />

        <div className="grid gap-2.5 lg:grid-cols-[1.15fr_.85fr]">
          <UpdatePanel
            info={info}
            update={update}
            checking={checking}
            downloading={downloading}
            paused={paused}
            downloaded={downloaded}
            progress={progress}
            transfer={transfer}
            installing={installing}
            channel={channel}
            onCheck={check}
            onSelectChannel={selectChannel}
            onDownload={download}
            onPause={pause}
            onResume={resume}
            onStop={stop}
            onInstall={install}
            onOpenChangelog={() => setChangelogOpen(true)}
            onExternal={external}
          />
          <SupportCard onEmail={emailDeveloper} onExternal={external} />
        </div>

        <TechStackCard onExternal={external} />

        <ChangeLogCard
          version={info.version}
          updateVersion={update?.hasUpdate ? update.latestVersion : null}
          updateNotes={update?.releaseNotes}
          onOpenExternal={external}
        />

        <footer className="pb-0.5 text-center text-xs uppercase tracking-widest text-[rgb(var(--muted))]">
          © 2026 HyperFamily Stores • MIT License • Built by Ali Ajeli Lahiji
        </footer>

        <UpdateChangelogDialog open={changelogOpen} setOpen={setChangelogOpen} update={update} />
      </div>
    </AppShell>
  )
}
