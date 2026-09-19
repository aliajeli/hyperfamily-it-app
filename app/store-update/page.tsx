'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import BranchCheckoutsCard from '@/components/store-update/BranchCheckoutsCard'
import CheckoutsSkeleton from '@/components/store-update/CheckoutsSkeleton'
import HowItWorks from '@/components/store-update/HowItWorks'
import RunningPill from '@/components/store-update/RunningPill'
import UpdateToolbar from '@/components/store-update/UpdateToolbar'
import AgentImportDialog from '@/components/store-update/AgentImportDialog'
import DeployDialog from '@/components/store-update/DeployDialog'
import StoreInstallDialog from '@/components/store-update/StoreInstallDialog'
import InstalledProgramsDialog from '@/components/store-update/InstalledProgramsDialog'
import ServerFileBrowser from '@/components/store-update/ServerFileBrowser'
import { EmptyState } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getApi, isElectron } from '@/lib/api'
import { formatDuration } from '@/lib/utils'

const EMPTY_ID_SET = new Set()

function groupCheckouts(branches: any, devices: any) {
  const byBranch = new Map<any, any>(branches.map((branch: any) => [branch.id, branch]))
  const groups = new Map<any, any>()
  for (const device of devices) {
    if (device.device_type !== 'Checkout') continue
    const branch = (byBranch.get(device.branch_id) as any) || { id: 0, name: 'Unassigned', code: '—' }
    if (!groups.has((branch as any).id)) groups.set((branch as any).id, { branch, checkouts: [] })
    ;(groups.get((branch as any).id) as any).checkouts.push(device)
  }
  return [...groups.values()]
    .map((group: any) => ({
      ...group,
      checkouts: group.checkouts.sort(
        (a: any, b: any) =>
          (a.checkout_number ?? 999) - (b.checkout_number ?? 999) || a.name.localeCompare(b.name)
      )
    }))
    .sort((a: any, b: any) => a.branch.name.localeCompare(b.branch.name))
}

export default function StoreUpdatePage() {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<any>([])
  const [settings, setSettings] = useState<any>(null)
  const [versions, setVersions] = useState<any>({})
  const [file, setFile] = useState<any>(null)
  const [deploying, setDeploying] = useState(false)
  const [agentRun, setAgentRun] = useState<any>({
    open: false,
    running: false,
    cancelling: false,
    cancelled: false,
    runId: null,
    targets: [],
    results: [],
    steps: {},
    summary: null
  })
  const agentBusyRef = useRef(false)
  const agentRunIdRef = useRef<any>(null)
  const [dialog, setDialog] = useState<any>({ open: false, run: null })
  const [selected, setSelected] = useState(() => new Set())
  const [installRun, setInstallRun] = useState<any>({
    open: false,
    running: false,
    cancelling: false,
    runId: null,
    targets: [],
    results: [],
    steps: {},
    summary: null
  })
  const [installResults, setInstallResults] = useState<any>({})
  const [installView, setInstallView] = useState<any>({ open: false, checkout: null })
  const installBusyRef = useRef(false)
  const installRunIdRef = useRef<any>(null)
  const [inspect, setInspect] = useState<any>({ open: false, checkout: null })
  const [steps, setSteps] = useState<any>({})
  const [progress, setProgress] = useState<any>({})
  const [browserOpen, setBrowserOpen] = useState(false)

  const allCheckouts = useMemo(() => groups.flatMap((group: any) => group.checkouts), [groups])
  const anyDeployRunning = deploying || agentRun.running || installRun.running

  useEffect(() => {
    let alive = true
    const api = getApi()
    const unsubs = [
      api.storeUpdate.onAgentStep((entry: any) => {
        setAgentRun((previous: any) => {
          const entries = previous.steps[entry.checkoutId] || []
          const next =
            entry.progress && entries.at(-1)?.progress && entries.at(-1).step === entry.step
              ? [...entries.slice(0, -1), entry]
              : [...entries, entry]
          return { ...previous, steps: { ...previous.steps, [entry.checkoutId]: next } }
        })
      }),
      api.storeUpdate.onVersion((result: any) => {
        setVersions((previous: any) => ({ ...previous, [result.checkoutId]: result }))
      }),
      api.storeUpdate.onStep((entry: any) => {
        setSteps((previous: any) => ({
          ...previous,
          [entry.checkoutId]: [...(previous[entry.checkoutId] || []), entry]
        }))
      }),
      api.storeUpdate.onProgress((entry: any) => {
        setProgress((previous: any) => ({ ...previous, [entry.checkoutId]: entry }))
      }),
      api.storeUpdate.onInstallStep((entry: any) => {
        setInstallRun((previous: any) => {
          const entries = previous.steps[entry.checkoutId] || []
          return {
            ...previous,
            activeId: entry.checkoutId,
            steps: { ...previous.steps, [entry.checkoutId]: [...entries, entry] }
          }
        })
      })
    ]
    Promise.all([api.settings.get(), api.branches.list(), api.devices.list()])
      .then(([loadedSettings, branches, devices]) => {
        if (!alive) return
        setSettings(loadedSettings)
        setGroups(groupCheckouts(branches || [], devices || []))
        setLoading(false)
      })
      .catch((error: any) => {
        if (!alive) return
        toast.error(error.message)
        setLoading(false)
      })
    return () => {
      alive = false
      unsubs.forEach((unsub: any) => unsub?.())
    }
  }, [])

  const runSweep = useCallback((checkouts: any) => {
    if (!checkouts.length) return
    setVersions((previous: any) => {
      const next = { ...previous }
      for (const checkout of checkouts) next[checkout.id] = { state: 'checking' }
      return next
    })
    getApi()
      .storeUpdate.versions({ checkouts })
      .then(() => toast.success(`Version sweep finished for ${checkouts.length} checkout(s)`))
      .catch((error: any) => {
        setVersions((previous: any) => {
          const next = { ...previous }
          for (const checkout of checkouts)
            if (next[checkout.id]?.state === 'checking')
              next[checkout.id] = { state: 'error', error: error.message }
          return next
        })
        toast.error(error.message)
      })
  }, [])

  useEffect(() => {
    let alive = true
    getApi()
      .storeUpdate.versionCache?.()
      .then((cache: any) => {
        if (alive && cache) setVersions((previous: any) => ({ ...cache, ...previous }))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const adoptProgramName = useCallback(
    async (name: any) => {
      try {
        const next = await getApi().settings.save({ store_program_name: name })
        setSettings(next)
        setInspect({ open: false, checkout: null })
        toast.success(`Now looking for "${name}" — rechecking every checkout`)
        runSweep(allCheckouts)
      } catch (error: any) {
        toast.error(error.message)
      }
    },
    [allCheckouts, runSweep]
  )

  const recheck = useCallback(
    async (checkout: any) => {
      if (!settings) return
      setVersions((previous: any) => ({ ...previous, [checkout.id]: { state: 'checking' } }))
      try {
        const result = await getApi().storeUpdate.version({ checkout })
        setVersions((previous: any) => ({ ...previous, [checkout.id]: result }))
        if (result.state === 'ok') toast.success(`${checkout.name}: v${result.version}`)
        else if (result.state === 'offline') toast.error(`${checkout.name} is offline`)
      } catch (error: any) {
        setVersions((previous: any) => ({
          ...previous,
          [checkout.id]: { state: 'error', error: error.message }
        }))
        toast.error(error.message)
      }
    },
    [settings]
  )

  const importAgents = async (targets: any, all = false) => {
    if (agentBusyRef.current || deploying || !targets.length) return
    const accepted = await confirm({
      title: all
        ? `Import Agent to all ${targets.length} checkout(s)?`
        : `Import Agent to ${targets[0].name}?`,
      description:
        'The bundled EXE will be compared using SHA-256 and copied to C:\\Agent only if missing or different.',
      confirmLabel: all ? 'Import Agent to all' : 'Import Agent',
      destructive: false
    })
    if (!accepted || agentBusyRef.current) return
    agentBusyRef.current = true
    const runId = `agent-${Date.now()}`
    agentRunIdRef.current = runId
    setAgentRun({
      open: true,
      running: true,
      cancelling: false,
      cancelled: false,
      runId,
      targets,
      results: [],
      steps: {},
      summary: null
    })
    try {
      const api = getApi().storeUpdate
      const summary = all
        ? await api.importAgentAll({ checkouts: targets, runId })
        : await api.importAgent({ checkout: targets[0], runId }).then((result: any) => ({
            runId,
            total: 1,
            ok: result.ok ? 1 : 0,
            failed: result.ok && !result.cancelled ? 0 : result.cancelled ? 0 : 1,
            cancelled: result.cancelled && !result.skipped ? 1 : 0,
            skipped: result.skipped ? 1 : 0,
            cancelledByOperator: Boolean(result.cancelled),
            results: [result],
            durationMs: result.durationMs || 0
          }))
      setAgentRun((previous: any) => ({
        ...previous,
        running: false,
        cancelling: false,
        cancelled: Boolean(summary.cancelledByOperator),
        results: summary.results,
        summary: {
          ...summary,
          durationMs:
            summary.durationMs ??
            summary.results?.reduce((sum: any, row: any) => sum + (row.durationMs || 0), 0)
        }
      }))
      if (summary.cancelledByOperator) toast.info('Agent import stopped')
      else if (summary.failed) toast.error(`${summary.failed} agent import(s) failed`)
      else toast.success(`Agent is running on ${summary.ok} checkout(s)`)
      runSweep(targets)
    } catch (error: any) {
      setAgentRun((previous: any) => ({
        ...previous,
        running: false,
        cancelling: false,
        results: targets.map((c: any) => ({ checkoutId: c.id, ok: false, error: error.message })),
        summary: {
          total: targets.length,
          ok: 0,
          failed: targets.length,
          cancelled: 0,
          skipped: 0,
          cancelledByOperator: false,
          results: [],
          durationMs: 0
        }
      }))
      toast.error(error.message)
    } finally {
      agentBusyRef.current = false
      agentRunIdRef.current = null
    }
  }

  const stopAgentImport = async () => {
    const runId = agentRunIdRef.current
    if (!runId || !agentRun.running || agentRun.cancelling) return
    const accepted = await confirm({
      title: 'Stop the agent import?',
      description: 'Current checkout will be rolled back and remaining skipped.',
      confirmLabel: 'Stop import',
      destructive: true
    })
    if (!accepted) return
    setAgentRun((previous: any) => ({ ...previous, cancelling: true }))
    try {
      const state = await getApi().storeUpdate.cancelAgentImport({ runId })
      if (!state?.cancelled) toast.info('That import had already finished')
      else toast.info('Stopping the import…')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setAgentRun((previous: any) => (previous.running ? previous : { ...previous, cancelling: false }))
    }
  }

  const startInstall = async (targets: any, { all = false }: any = {}) => {
    if (installBusyRef.current || anyDeployRunning || !targets.length || !settings) return
    const accepted = await confirm({
      title: all
        ? `Update Store Commerce on all ${targets.length}?`
        : targets.length === 1
          ? `Update Store Commerce on ${targets[0].name}?`
          : `Update ${targets.length} selected?`,
      description: `Per checkout: connection → close Store Commerce → verify → look for installer in ${settings.store_update_path} → run install via agent → report version. One after another.`,
      confirmLabel: 'Update Store Commerce',
      destructive: false
    })
    if (!accepted || installBusyRef.current) return
    installBusyRef.current = true
    const runId = `install-${Date.now()}`
    installRunIdRef.current = runId
    setInstallRun({
      open: true,
      running: true,
      cancelling: false,
      runId,
      targets,
      results: [],
      steps: {},
      summary: null
    })
    try {
      const api = getApi().storeUpdate
      const payload = { checkouts: targets, destinationPath: settings.store_update_path, runId }
      const summary = await api.installAll(payload)
      setInstallRun((previous: any) => ({
        ...previous,
        running: false,
        cancelling: false,
        results: summary.results,
        summary: {
          ...summary,
          durationMs:
            summary.durationMs ??
            summary.results?.reduce((sum: any, row: any) => sum + (row.durationMs || 0), 0)
        }
      }))
      setInstallResults((previous: any) => {
        const next = { ...previous }
        for (const row of summary.results) next[row.checkoutId] = row
        return next
      })
      if (summary.cancelledByOperator) toast.info('Store Commerce update stopped')
      else if (summary.failed) toast.error(`${summary.failed} of ${summary.total} failed`)
      else toast.success(`Store Commerce updated on ${summary.ok} checkout(s)`)
      runSweep(targets)
    } catch (error: any) {
      setInstallRun((previous: any) => ({
        ...previous,
        running: false,
        cancelling: false,
        results: targets.map((c: any) => ({ checkoutId: c.id, ok: false, error: error.message, steps: [] })),
        summary: {
          total: targets.length,
          ok: 0,
          failed: targets.length,
          skipped: 0,
          cancelledByOperator: false,
          results: [],
          durationMs: 0
        }
      }))
      toast.error(error.message)
    } finally {
      installBusyRef.current = false
      installRunIdRef.current = null
    }
  }

  const stopInstall = async () => {
    const runId = installRunIdRef.current
    if (!runId || !installRun.running || installRun.cancelling) return
    const accepted = await confirm({
      title: 'Stop the Store Commerce update?',
      description: 'Current checkout finishes step, remaining skipped.',
      confirmLabel: 'Stop update',
      destructive: true
    })
    if (!accepted) return
    setInstallRun((previous: any) => ({ ...previous, cancelling: true }))
    try {
      const state = await getApi().storeUpdate.cancelInstall({ runId })
      if (!state?.cancelled) toast.info('Already finished')
      else toast.info('Stopping…')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setInstallRun((previous: any) => (previous.running ? previous : { ...previous, cancelling: false }))
    }
  }

  const toggleSelect = (checkout: any) => {
    setSelected((previous: any) => {
      const next = new Set(previous)
      if (next.has(checkout.id)) next.delete(checkout.id)
      else next.add(checkout.id)
      return next
    })
  }

  const selectMany = (ids: any, value: any) => {
    setSelected((previous: any) => {
      const next = new Set(previous)
      for (const id of ids) {
        if (value) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const showInstallResult = (checkout: any) => setInstallView({ open: true, checkout })

  const pickFile = async () => {
    try {
      if (isElectron()) {
        const picked = await getApi().dialog.selectFile({ title: 'Choose the update file to deploy' })
        if (picked) {
          setFile({ path: picked, name: picked.split(/[\\/]/).pop() })
          toast.success(`Selected ${picked.split(/[\\/]/).pop()}`)
        }
      } else {
        setBrowserOpen(true)
      }
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const beginRun = (mode: any, checkouts: any) => {
    setSteps({})
    setProgress({})
    setDialog({
      open: true,
      run: {
        mode,
        fileName: file.name,
        destinationPath: settings.store_update_path,
        checkouts,
        activeId: checkouts[0]?.id,
        summary: null
      }
    })
    setDeploying(true)
  }

  const finishRun = (summary: any) => {
    setDeploying(false)
    setDialog((previous: any) =>
      previous.run ? { open: true, run: { ...previous.run, summary } } : previous
    )
    if (summary.failed > 0) toast.error(`${summary.failed} of ${summary.total} failed`)
    else toast.success(`Deployed: ${summary.ok}/${summary.total} in ${formatDuration(summary.durationMs)}`)
  }

  const deployOne = async (checkout: any) => {
    if (anyDeployRunning) return
    if (!file) {
      toast.error('Choose the update file first')
      return
    }
    beginRun('single', [checkout])
    try {
      const result = await getApi().storeUpdate.deploy({
        checkout,
        source: file.path,
        destinationPath: settings.store_update_path
      })
      finishRun({
        runId: `single-${Date.now()}`,
        total: 1,
        ok: result.ok ? 1 : 0,
        failed: result.ok ? 0 : 1,
        results: [result],
        durationMs: result.durationMs || 0
      })
    } catch (error: any) {
      setDeploying(false)
      setDialog((previous: any) => ({ ...previous, open: false }))
      toast.error(error.message)
    }
  }

  const deployAll = async () => {
    if (anyDeployRunning) return
    if (!file) {
      toast.error('Choose the update file first')
      return
    }
    if (!allCheckouts.length) {
      toast.error('No checkout registered')
      return
    }
    const onlineTargets = allCheckouts.filter((checkout: any) => checkout.hostname || checkout.ip)
    const accepted = await confirm({
      title: `Deploy to ${onlineTargets.length} checkout(s)?`,
      description: `"${file.name}" will be sent to ${settings.store_update_path} on every checkout — one after another.`,
      confirmLabel: 'Deploy to all',
      destructive: false
    })
    if (!accepted) return
    beginRun('all', onlineTargets)
    try {
      const summary = await getApi().storeUpdate.deployAll({
        checkouts: onlineTargets,
        source: file.path,
        destinationPath: settings.store_update_path
      })
      finishRun(summary)
    } catch (error: any) {
      setDeploying(false)
      setDialog((previous: any) => ({ ...previous, open: false }))
      toast.error(error.message)
    }
  }

  useEffect(() => {
    if (!deploying) return
    const ids = Object.keys(steps)
    if (!ids.length) return
    const activeId = Number(ids[ids.length - 1])
    setDialog((previous: any) =>
      previous.run && previous.run.activeId !== activeId
        ? { ...previous, run: { ...previous.run, activeId } }
        : previous
    )
  }, [steps, deploying])

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-3 px-2 md:px-0">
        <div className="hidden md:block">
          <h1 className="page-title">Update Store App</h1>
          <p className="page-subtitle">
            Store Commerce versions across every checkout, and verified file deployment with Jalali-dated
            backups.
          </p>
        </div>

        <UpdateToolbar
          file={file}
          settings={settings}
          versions={versions}
          selectedCount={selected.size}
          checkoutCount={allCheckouts.length}
          anyDeployRunning={anyDeployRunning}
          onPickFile={pickFile}
          onClearFile={() => setFile(null)}
          onImportAll={() => importAgents(allCheckouts, true)}
          onUpdateSelected={() =>
            startInstall(
              allCheckouts.filter((c: any) => selected.has(c.id)),
              {}
            )
          }
          onUpdateAll={() => startInstall(allCheckouts, { all: true })}
          onRecheckAll={() => runSweep(allCheckouts)}
          onDeployAll={deployAll}
          onBrowseServer={() => setBrowserOpen(true)}
        />

        <HowItWorks settings={settings} />

        {loading ? (
          <CheckoutsSkeleton />
        ) : allCheckouts.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={26} />}
            title="No checkout registered"
            description="Add checkout devices under Branches & devices first."
          />
        ) : (
          groups.map((group: any) => (
            <BranchCheckoutsCard
              key={group.branch.id}
              group={group}
              versions={versions}
              selected={selected}
              onSelectMany={selectMany}
              onToggleSelect={toggleSelect}
              onRecheckBranch={(checkouts: any) => runSweep(checkouts)}
              onUpdateBranch={(checkouts: any) => startInstall(checkouts)}
              onRecheck={recheck}
              onImportAgent={(target: any) => importAgents([target])}
              onDeploy={deployOne}
              onInspect={(target: any) => setInspect({ open: true, checkout: target })}
              onUpdateStore={(target: any) => startInstall([target])}
              onShowInstallResult={showInstallResult}
              installResults={installResults}
              agentBusyIds={
                agentRun.running ? new Set(agentRun.targets.map((target: any) => target.id)) : EMPTY_ID_SET
              }
              anyDeployRunning={anyDeployRunning}
              hasFile={Boolean(file)}
            />
          ))
        )}
      </div>

      {installRun.running && !installRun.open && (
        <RunningPill
          kind="install"
          label={`Store Commerce update running — ${installRun.targets.length} checkout(s)`}
          onClick={() => setInstallRun((p: any) => ({ ...p, open: true }))}
        />
      )}
      {agentRun.running && !agentRun.open && (
        <RunningPill
          kind="agent"
          label={`Agent import running — ${agentRun.targets.length} checkout(s)`}
          onClick={() => setAgentRun((p: any) => ({ ...p, open: true }))}
        />
      )}

      <ServerFileBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={(path: any) => {
          setFile({ path, name: path.split(/[\\/]/).pop() })
          toast.success(`Selected ${path.split(/[\\/]/).pop()}`)
        }}
      />

      <AgentImportDialog
        run={agentRun}
        onCancel={stopAgentImport}
        onClose={() => setAgentRun((p: any) => ({ ...p, open: false }))}
      />
      <InstalledProgramsDialog
        open={inspect.open}
        onOpenChange={(open: any) => setInspect((p: any) => ({ ...p, open }))}
        checkout={inspect.checkout}
        onAdopt={adoptProgramName}
      />
      <DeployDialog
        open={dialog.open}
        onOpenChange={(open: any) => setDialog((p: any) => ({ ...p, open }))}
        run={dialog.run ? { ...dialog.run, steps, progress } : null}
        running={deploying}
        onClose={() => setDialog((p: any) => ({ ...p, open: false }))}
      />
      <StoreInstallDialog
        open={installRun.open}
        onOpenChange={(open: any) => setInstallRun((p: any) => ({ ...p, open }))}
        run={
          installRun.runId
            ? {
                mode: installRun.targets.length > 1 ? 'all' : 'single',
                checkouts: installRun.targets,
                steps: installRun.steps,
                activeId: installRun.activeId,
                summary: installRun.summary,
                cancelling: installRun.cancelling
              }
            : null
        }
        running={installRun.running}
        onCancel={stopInstall}
        onClose={() => setInstallRun((p: any) => ({ ...p, open: false }))}
      />
      <StoreInstallDialog
        open={Boolean(installView.open && installView.checkout && installResults[installView.checkout.id])}
        onOpenChange={(open: any) => setInstallView((p: any) => ({ ...p, open }))}
        run={
          installView.checkout && installResults[installView.checkout.id]
            ? {
                mode: 'single',
                checkouts: [installView.checkout],
                steps: { [installView.checkout.id]: installResults[installView.checkout.id].steps || [] },
                summary: {
                  total: 1,
                  ok: installResults[installView.checkout.id].ok ? 1 : 0,
                  failed: installResults[installView.checkout.id].ok ? 0 : 1,
                  skipped: 0,
                  results: [installResults[installView.checkout.id]],
                  durationMs: installResults[installView.checkout.id].durationMs || 0
                },
                cancelling: false
              }
            : null
        }
        running={false}
        onClose={() => setInstallView((p: any) => ({ ...p, open: false }))}
      />
    </AppShell>
  )
}
