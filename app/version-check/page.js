import AppShell from '@/components/layout/AppShell'
import VersionCheckPanel from '@/components/version-check/VersionCheckPanel'
import FileCopyPanel from '@/components/version-check/FileCopyPanel'

export default function VersionCheckPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <div>
          <h1 className="page-title">Version check &amp; file copy</h1>
          <p className="page-subtitle">Check the installed version of any program on this system, and copy files between locations with live progress and SHA-256 verification.</p>
        </div>
        <div className="grid items-start gap-3 xl:grid-cols-2">
          <VersionCheckPanel />
          <FileCopyPanel />
        </div>
      </div>
    </AppShell>
  )
}
