'use client'

import {
  CloudUpload,
  FileUp,
  HardDriveDownload,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X
} from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'

/** Toolbar: update file, import-agent-to-all, update selected/all, recheck, deploy. */
export default function UpdateToolbar({
  file,
  settings,
  versions,
  selectedCount,
  checkoutCount,
  anyDeployRunning,
  onPickFile,
  onClearFile,
  onImportAll,
  onUpdateSelected,
  onUpdateAll,
  onRecheckAll,
  onDeployAll
}: any) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--primary)/.13)] text-[rgb(var(--primary))]">
            <HardDriveDownload size={18} />
          </span>
          <div className="min-w-0 flex-1">
            {file ? (
              <>
                <div className="truncate text-sm font-bold text-[rgb(var(--text))]">{file.name}</div>
                <div className="truncate font-mono text-xs text-[rgb(var(--muted))]" title={file.path}>
                  {file.path}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-bold text-[rgb(var(--text))]">No update file selected</div>
                <div className="text-xs text-[rgb(var(--muted))]">
                  Destination on every checkout:{' '}
                  <span className="font-mono">{settings?.store_update_path || '…'}</span>
                </div>
              </>
            )}
          </div>
          {file && (
            <button
              type="button"
              aria-label="Clear selected file"
              onClick={onClearFile}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.55)] hover:text-nord-11"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onImportAll}
            disabled={anyDeployRunning || !checkoutCount}
          >
            <ShieldCheck size={14} /> Import Agent to all
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onUpdateSelected}
            disabled={anyDeployRunning || selectedCount === 0}
            title="Run the Store Commerce update pipeline on the ticked checkouts"
          >
            <ListChecks size={14} /> Update selected{selectedCount ? ` (${selectedCount})` : ''}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onUpdateAll}
            disabled={anyDeployRunning || !checkoutCount}
            title="Run the Store Commerce update pipeline on every checkout, one after another"
          >
            <Wrench size={14} /> Update all
          </Button>
          <Button variant="secondary" size="sm" onClick={onPickFile} disabled={anyDeployRunning}>
            <FileUp size={14} />
            {file ? 'Change file…' : 'Select file…'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRecheckAll}
            disabled={
              anyDeployRunning ||
              !checkoutCount ||
              (Object.values(versions) as any[]).some((v) => v.state === 'checking')
            }
          >
            <RefreshCw size={14} />
            Recheck all
          </Button>
          <Button size="sm" onClick={onDeployAll} disabled={anyDeployRunning || !file || !checkoutCount}>
            <CloudUpload size={14} />
            Deploy to all
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
