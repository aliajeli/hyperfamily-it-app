'use client'

import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Download,
  Github,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  ScrollText,
  Square
} from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { formatBytes, formatDuration, REPO } from '@/lib/about-presentation'

/**
 * The application-updates card: installed vs latest, channel radios,
 * download progress and the action row. All update state and callbacks are
 * owned by the About page; this panel only renders and reports intent.
 */
export default function UpdatePanel({
  info,
  update,
  checking,
  downloading,
  paused,
  downloaded,
  progress,
  transfer,
  installing,
  channel,
  onCheck,
  onSelectChannel,
  onDownload,
  onPause,
  onResume,
  onStop,
  onInstall,
  onOpenChangelog,
  onExternal
}: any) {
  return (
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
              <b className={`font-mono text-sm ${update?.hasUpdate ? 'text-[rgb(var(--primary))]' : ''}`}>
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
                  Download size <b className="text-[rgb(var(--text))]">{formatBytes(update.downloadSize)}</b>
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
                  {downloaded ? 'Update ready to install' : paused ? 'Download paused' : 'Downloading update'}
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
                        <b className="text-[rgb(var(--text))]">{formatBytes(transfer.bytesPerSecond)}/s</b>
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
              onChange={() => onSelectChannel('main')}
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
              onChange={() => onSelectChannel('beta')}
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
            v{update.latestVersion} is a beta preview — the newest main release stays on the Main channel.
          </p>
        )}

        {/* Pinned to the bottom of the card, so the rare beta/downgrade
            notice above it can appear without moving anything. */}
        <div className="mt-auto flex min-h-[38px] flex-wrap items-center gap-1.5 pt-2">
          <Button size="sm" onClick={onCheck} disabled={checking} variant="secondary">
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking…' : 'Check for updates'}
          </Button>
          {update?.hasUpdate && !downloaded && !downloading && !paused && (
            <Button size="sm" onClick={onDownload}>
              <Download size={14} />
              Download v{update.latestVersion}
              {update.downloadSize > 0 ? ` (${formatBytes(update.downloadSize)})` : ''}
            </Button>
          )}
          {downloading && !paused && (
            <>
              <Button size="sm" variant="secondary" onClick={onPause}>
                <Pause size={14} />
                Pause
              </Button>
              <Button size="sm" variant="ghost" onClick={onStop}>
                <Square size={14} />
                Stop
              </Button>
            </>
          )}
          {paused && (
            <>
              <Button size="sm" onClick={onResume}>
                <Play size={14} />
                Resume
              </Button>
              <Button size="sm" variant="ghost" onClick={onStop}>
                <Square size={14} />
                Stop
              </Button>
            </>
          )}
          {downloaded && (
            <Button size="sm" variant="success" onClick={onInstall} disabled={installing}>
              <Rocket size={14} />
              {installing ? 'Installing…' : 'Install and restart'}
            </Button>
          )}
          {update?.hasUpdate && update.releaseNotes && (
            <Button size="sm" variant="ghost" onClick={onOpenChangelog}>
              <ScrollText size={14} />
              View changelog
            </Button>
          )}
          {update?.hasUpdate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onExternal(update.downloadUrl || `${REPO}/releases/latest`)}
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
  )
}
