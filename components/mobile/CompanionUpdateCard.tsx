// @ts-nocheck - Capacitor plugins only available in native build
'use client'

import { useEffect, useState } from 'react'
import { Download, RefreshCw, Smartphone, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'

const REPO = 'aliajeli/hyperfamily-it-app'

function parseVer(s: string) {
  s = String(s).replace(/^v/, '')
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '', raw: s }
}

function newerThan(a: string, b: string) {
  const pa = parseVer(a)
  const pb = parseVer(b)
  if (!pa) return false
  if (!pb) return true
  if (pa.major !== pb.major) return pa.major > pb.major
  if (pa.minor !== pb.minor) return pa.minor > pb.minor
  if (pa.patch !== pb.patch) return pa.patch > pb.patch
  if (!pa.pre && pb.pre) return true
  if (pa.pre && !pb.pre) return false
  return pa.pre.localeCompare(pb.pre) > 0
}

function pickAsset(release: any) {
  const assets = release?.assets || []
  const re = /HyperFamily-Companion-.*\.apk$/i
  const signed = assets.find((a: any) => /signed/i.test(a.name) && re.test(a.name))
  const any = assets.find((a: any) => re.test(a.name))
  return signed || any || assets.find((a: any) => String(a.name).toLowerCase().endsWith('.apk')) || null
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export default function CompanionUpdateCard() {
  const [isNative, setIsNative] = useState(false)
  const [info, setInfo] = useState<any>(null)
  const [release, setRelease] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    try {
      const cap = (window as any).Capacitor
      const native = Boolean(cap?.isNativePlatform?.())
      setIsNative(native)
      if (!native) return
      // Try modern import first, fallback to window plugins
      import('@capacitor/app')
        .then(({ App }) => App.getInfo())
        .then((i) => setInfo(i))
        .catch(() => {
          const plugins = (window as any).CapacitorPlugins
          plugins?.App?.getInfo?.()
            .then((i: any) => setInfo(i))
            .catch(() => {})
        })
    } catch {
      setIsNative(false)
    }
  }, [])

  const check = async (manual = false) => {
    setChecking(true)
    try {
      const cap = (window as any).Capacitor
      const native = cap?.isNativePlatform?.() || false
      if (!native) {
        if (manual) toast.info('Updates are only available in the installed Android app')
        return
      }
      let appInfo = info
      if (!appInfo) {
        try {
          const { App } = await import('@capacitor/app')
          appInfo = await App.getInfo()
          setInfo(appInfo)
        } catch {
          appInfo = await (window as any).CapacitorPlugins?.App?.getInfo?.()
        }
      }
      const currentVersion = appInfo?.version || '0.0.0'
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=12`, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const releases = await res.json()
      const list = Array.isArray(releases) ? releases : []
      const ch =
        (typeof window !== 'undefined' && localStorage.getItem('hyperfamily.update.channel')) || 'main'
      const candidates = list.filter((r: any) => {
        if (r.draft) return false
        if (ch === 'main' && r.prerelease) return false
        return true
      })
      candidates.sort(
        (a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      )
      let found: any = null
      let asset: any = null
      for (const rel of candidates) {
        const ver = rel.tag_name || rel.name || ''
        if (!newerThan(ver, currentVersion)) continue
        const a = pickAsset(rel)
        if (!a) continue
        found = rel
        asset = a
        break
      }
      if (!found || !asset) {
        if (manual) toast.success(`You are on the latest version (v${currentVersion})`)
        setRelease(null)
        return
      }
      setRelease({ ...found, asset, currentVersion })
      if (manual) toast.success(`Update available: ${found.tag_name}`)
    } catch (e: any) {
      toast.error(`Update check failed: ${e.message}`)
    } finally {
      setChecking(false)
    }
  }

  const downloadAndInstall = async () => {
    if (!release?.asset) return
    setDownloading(true)
    try {
      const asset = release.asset
      toast.message('Downloading update…', { description: asset.name })
      const fileName = String(asset.name || 'HyperFamily-Companion-update.apk').split('?')[0]

      let fileUri: string | null = null

      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        try {
          if ((Filesystem as any).downloadFile) {
            const dl = await (Filesystem as any).downloadFile({
              url: asset.browser_download_url,
              path: fileName,
              directory: Directory.Cache
            })
            fileUri = dl.path || dl.uri || null
          } else {
            throw new Error('downloadFile unavailable')
          }
        } catch {
          const resp = await fetch(asset.browser_download_url)
          if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`)
          const buf = await resp.arrayBuffer()
          const out = await Filesystem.writeFile({
            path: fileName,
            data: toBase64(buf),
            directory: Directory.Cache
          })
          fileUri = out.uri
        }
        if (!fileUri) {
          const uriRes = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })
          fileUri = uriRes.uri
        }
      } catch {
        // Fallback to legacy window plugins
        const Filesystem = (window as any).CapacitorPlugins?.Filesystem
        const Directory = (window as any).CapacitorPlugins?.Directory || { Cache: 'CACHE' }
        if (Filesystem) {
          try {
            const dl = await Filesystem.downloadFile({
              url: asset.browser_download_url,
              path: fileName,
              directory: Directory.Cache
            })
            fileUri = dl.path || dl.uri
          } catch {
            const resp = await fetch(asset.browser_download_url)
            if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`)
            const out = await Filesystem.writeFile({
              path: fileName,
              data: toBase64(await resp.arrayBuffer()),
              directory: Directory.Cache
            })
            fileUri = out.uri
          }
        }
      }

      if (!fileUri) throw new Error('Could not prepare APK file')

      toast.message('Opening installer…', { description: 'Tap Install in the Android dialog' })

      try {
        const { FileOpener } = await import('@capawesome-team/capacitor-file-opener')
        await FileOpener.open({ filePath: fileUri, contentType: 'application/vnd.android.package-archive' })
      } catch {
        try {
          const { FileOpener } = await import('@capacitor-community/file-opener')
          await (FileOpener as any).open({
            filePath: fileUri,
            contentType: 'application/vnd.android.package-archive'
          } as any)
        } catch {
          const FileOpener = (window as any).CapacitorPlugins?.FileOpener
          if (!FileOpener) throw new Error('FileOpener plugin not found')
          await FileOpener.open({
            filePath: fileUri,
            contentType: 'application/vnd.android.package-archive',
            openWithDefault: true
          })
        }
      }
    } catch (e: any) {
      toast.error(`Update failed: ${e.message}`)
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    if (isNative) check(false)
  }, [isNative])

  if (!isNative) return null

  return (
    <Card className="overflow-hidden border-[rgb(var(--primary)/.25)]">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Smartphone size={15} className="text-[rgb(var(--primary))]" /> Companion app updates
        </CardTitle>
        <CardDescription className="text-xs">
          Updates for the Android companion app from GitHub Releases.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="flex min-h-[72px] flex-col rounded-xl border bg-[rgb(var(--surface)/.45)] p-2.5">
          <div className="flex items-center justify-between gap-3">
            <span>
              <small className="block text-2xs uppercase tracking-wider text-[rgb(var(--muted))]">
                Installed
              </small>
              <b className="font-mono text-sm">v{info?.version || '—'}</b>
            </span>
            <span className="text-right">
              <small className="block text-2xs uppercase tracking-wider text-[rgb(var(--muted))]">
                Latest
              </small>
              <b className={`font-mono text-sm ${release ? 'text-[rgb(var(--primary))]' : ''}`}>
                {release ? release.tag_name : '—'}
              </b>
            </span>
          </div>
          {release ? (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-nord-14">
              <Download size={12} /> Update available: {release.asset?.name || 'APK'} •{' '}
              {(release.asset?.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-[rgb(var(--muted))]">
              <CheckCircle2 size={12} /> {info ? 'You are on the latest version' : 'Checking...'}
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => check(true)}
            disabled={checking || downloading}
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />{' '}
            {checking ? 'Checking...' : 'Check for updates'}
          </Button>
          {release && (
            <Button size="sm" onClick={downloadAndInstall} disabled={downloading}>
              <Download size={14} className={downloading ? 'animate-pulse' : ''} />{' '}
              {downloading ? 'Downloading...' : 'Download & install'}
            </Button>
          )}
        </div>

        {!release && !checking && info && (
          <p className="mt-2 text-2xs text-[rgb(var(--muted))]">
            The companion app updates itself from GitHub Releases, even without a workstation connection.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
