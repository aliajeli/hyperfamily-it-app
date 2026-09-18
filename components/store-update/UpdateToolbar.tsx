'use client'

import { CloudUpload, FileUp, HardDriveDownload, ListChecks, RefreshCw, ShieldCheck, Wrench, X, FolderOpen } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'

export default function UpdateToolbar({ file, settings, versions, selectedCount, checkoutCount, anyDeployRunning, onPickFile, onClearFile, onImportAll, onUpdateSelected, onUpdateAll, onRecheckAll, onDeployAll, onBrowseServer }: any) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:flex-wrap md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border bg-[rgb(var(--surface)/.6)] p-2.5 md:border-0 md:bg-transparent md:p-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--primary)/.13)] text-[rgb(var(--primary))]">
            <HardDriveDownload size={18} />
          </span>
          <div className="min-w-0 flex-1">
            {file ? (
              <>
                <div className="truncate text-sm font-black">{file.name}</div>
                <div className="truncate font-mono text-2xs text-[rgb(var(--muted))]" title={file.path}>{file.path}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-bold">No update file selected</div>
                <div className="truncate text-2xs text-[rgb(var(--muted))]">Dest: <span className="font-mono">{settings?.store_update_path || '…'}</span></div>
              </>
            )}
          </div>
          {file && <button type="button" onClick={onClearFile} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[rgb(var(--border)/.5)]"><X size={14} /></button>}
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
          <Button variant="secondary" size="sm" onClick={onPickFile} disabled={anyDeployRunning} className="col-span-1">
            <FileUp size={14} /> {file ? 'Change…' : 'Select file'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onBrowseServer} disabled={anyDeployRunning} className="col-span-1">
            <FolderOpen size={14} /> Browse server
          </Button>
          <Button variant="secondary" size="sm" onClick={onImportAll} disabled={anyDeployRunning || !checkoutCount} className="col-span-2 md:col-span-1">
            <ShieldCheck size={14} /> Import Agent all
          </Button>
          <Button variant="secondary" size="sm" onClick={onUpdateSelected} disabled={anyDeployRunning || selectedCount === 0} className="col-span-1">
            <ListChecks size={14} /> Selected{selectedCount ? ` (${selectedCount})` : ''}
          </Button>
          <Button variant="secondary" size="sm" onClick={onUpdateAll} disabled={anyDeployRunning || !checkoutCount} className="col-span-1">
            <Wrench size={14} /> Update all
          </Button>
          <Button variant="ghost" size="sm" onClick={onRecheckAll} disabled={anyDeployRunning || !checkoutCount || (Object.values(versions) as any[]).some((v: any) => v.state === 'checking')} className="hidden md:flex">
            <RefreshCw size={14} /> Recheck all
          </Button>
          <Button size="sm" onClick={onDeployAll} disabled={anyDeployRunning || !file || !checkoutCount} className="col-span-2 md:col-span-1">
            <CloudUpload size={14} /> Deploy to all
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
