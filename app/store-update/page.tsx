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
import { EmptyState } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getApi } from '@/lib/api'
import { formatDuration } from '@/lib/utils'

// Stable empty set so rows do not re-render on a fresh object each pass.
const EMPTY_ID_SET = new Set()

/** Checkout devices grouped and ordered under their branch name. */
function groupCheckouts(branches, devices) {
  const byBranch = new Map<any, any>(branches.map((branch) => [branch.id, branch]))
  const groups = new Map<any, any>()
  for (const device of devices) {
    if (device.device_type !== 'Checkout') continue
    const branch = byBranch.get(device.branch_id) || { id: 0, name: 'Unassigned', code: '—' }
    if (!groups.has(branch.id)) groups.set(branch.id, { branch, checkouts: [] })
    groups.get(branch.id).checkouts.push(device)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      checkouts: group.checkouts.sort(
        (a, b) => (a.checkout_number ?? 999) - (b.checkout_number ?? 999) || a.name.localeCompare(b.name)
      )
    }))
    .sort((a, b) => a.branch.name.localeCompare(b.branch.name))
}

export default function StoreUpdatePage() {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [settings, setSettings] = useState<any>(null)
  // checkoutId → { state: checking|ok|offline|not-found|error|no-host, version?, pingTime?, … }
  const [versions, setVersions] = useState<any>({})
  const [file, setFile] = useState<any>(null) // { path, name }
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
  // The run the Stop button addresses; kept in a ref so the cancel call always
  // targets the run that is actually in flight.
  const agentRunIdRef = useRef(null)
  const [dialog, setDialog] = useState<any>({ open: false, run: null })
  // Update Store Commerce: selection, live run, and the last result per checkout.
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
  const installRunIdRef = useRef(null)
  // Diagnostic list of everything installed on one checkout.
  const [inspect, setInspect] = useState<any>({ open: false, checkout: null })
  // Live deploy narration: checkoutId → step list / progress
  const [steps, setSteps] = useState<any>({})
  const [progress, setProgress] = useState<any>({})
  const dialogRef = useRef(dialog)
  dialogRef.current = dialog

  const allCheckouts = useMemo(() => groups.flatMap((group) => group.checkouts), [groups])
  const anyDeployRunning = deploying || agentRun.running || installRun.running

  /* ------------------------------------------------ data + subscriptions */
  useEffect(() => {
    let alive = true
    const api = getApi()
    const unsubs = [
      api.storeUpdate.onAgentStep((entry) => {
        setAgentRun((previous) => {
          const entries = previous.steps[entry.checkoutId] || []
          const next =
            entry.progress && entries.at(-1)?.progress && entries.at(-1).step === entry.step
              ? [...entries.slice(0, -1), entry]
              : [...entries, entry]
          return { ...previous, steps: { ...previous.steps, [entry.checkoutId]: next } }
        })
      }),
      api.storeUpdate.onVersion((result) => {
        setVersions((previous) => ({ ...previous, [result.checkoutId]: result }))
      }),
      api.storeUpdate.onStep((entry) => {
        setSteps((previous) => ({
          ...previous,
          [entry.checkoutId]: [...(previous[entry.checkoutId] || []), entry]
        }))
      }),
      api.storeUpdate.onProgress((entry) => {
        setProgress((previous) => ({ ...previous, [entry.checkoutId]: entry }))
      }),
      api.storeUpdate.onInstallStep((entry) => {
        setInstallRun((previous) => {
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
      .catch((error) => {
        if (!alive) return
        toast.error(error.message)
        setLoading(false)
      })
    return () => {
      alive = false
      unsubs.forEach((unsub) => unsub?.())
    }
  }, [])

  /* -------------------------------------------------------- version scan */
  const runSweep = useCallback((checkouts) => {
    if (!checkouts.length) return
    setVersions((previous) => {
      const next = { ...previous }
      for (const checkout of checkouts) next[checkout.id] = { state: 'checking' }
      return next
    })
    getApi()
      .storeUpdate.versions({ checkouts })
      .then(() => toast.success(`Version sweep finished for ${checkouts.length} checkout(s)`))
      .catch((error) => {
        setVersions((previous) => {
          const next = { ...previous }
          for (const checkout of checkouts)
            if (next[checkout.id]?.state === 'checking')
              next[checkout.id] = { state: 'error', error: error.message }
          return next
        })
        toast.error(error.message)
      })
  }, [])

  // Opening the page shows the cached answers — filled by the sweep that runs
  // at application startup and by every earlier recheck — instead of scanning
  // the whole estate again on each visit. Fresh data comes only from Recheck
  // all, the branch Recheck, or a single checkout's Recheck.
  useEffect(() => {
    let alive = true
    getApi()
      .storeUpdate.versionCache?.()
      .then((cache) => {
        if (alive && cache) setVersions((previous) => ({ ...cache, ...previous }))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  /** Adopt the exact program name an operator picked from the diagnostic list. */
  const adoptProgramName = useCallback(
    async (name) => {
      try {
        const next = await getApi().settings.save({ store_program_name: name })
        setSettings(next)
        setInspect({ open: false, checkout: null })
        toast.success(`Now looking for “${name}” — rechecking every checkout`)
        runSweep(allCheckouts)
      } catch (error) {
        toast.error(error.message)
      }
    },
    [allCheckouts, runSweep]
  )

  const recheck = useCallback(
    async (checkout) => {
      if (!settings) return
      setVersions((previous) => ({ ...previous, [checkout.id]: { state: 'checking' } }))
      try {
        const result = await getApi().storeUpdate.version({ checkout })
        setVersions((previous) => ({ ...previous, [checkout.id]: result }))
        if (result.state === 'ok') toast.success(`${checkout.name}: Store Commerce v${result.version}`)
        else if (result.state === 'offline') toast.error(`${checkout.name} is offline`)
      } catch (error) {
        setVersions((previous) => ({ ...previous, [checkout.id]: { state: 'error', error: error.message } }))
        toast.error(error.message)
      }
    },
    [settings]
  )

  const importAgents = async (targets, all = false) => {
    if (agentBusyRef.current || deploying || !targets.length) return
    const accepted = await confirm({
      title: all
        ? `Import Agent to all ${targets.length} checkout(s)?`
        : `Import Agent to ${targets[0].name}?`,
      description:
        'The bundled EXE will be compared using SHA-256 and copied to C:\\Agent only if missing or different. A Windows Service will be installed/started with Automatic startup before Login. Existing agents are briefly restarted. Target access must have administrator permissions. The import can be stopped at any time.',
      confirmLabel: all ? 'Import Agent to all' : 'Import Agent',
      destructive: false
    })
    if (!accepted || agentBusyRef.current) return
    agentBusyRef.current = true
    // One id per run: the Stop button and the batch share it, so a single Stop
    // reaches the checkout in flight and every checkout still waiting.
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
        : await api.importAgent({ checkout: targets[0], runId }).then((result) => ({
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
      setAgentRun((previous) => ({
        ...previous,
        running: false,
        cancelling: false,
        cancelled: Boolean(summary.cancelledByOperator),
        results: summary.results,
        summary: {
          ...summary,
          durationMs:
            summary.durationMs ?? summary.results?.reduce((sum, row) => sum + (row.durationMs || 0), 0)
        }
      }))
      if (summary.cancelledByOperator)
        toast.info('Agent import stopped', {
          description: 'Every stopped checkout was rolled back to its previous agent.'
        })
      else if (summary.failed) toast.error(`${summary.failed} agent import(s) failed — see details`)
      else toast.success(`Agent is running on ${summary.ok} checkout(s)`)
      runSweep(targets)
    } catch (error) {
      setAgentRun((previous) => ({
        ...previous,
        running: false,
        cancelling: false,
        results: targets.map((checkout) => ({ checkoutId: checkout.id, ok: false, error: error.message })),
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

  /**
   * Stop button of the Import Agent dialog. The main process aborts the
   * in-flight transfer, rolls the checkout back to its previous executable and
   * service, and skips the checkouts that had not started yet.
   */
  const stopAgentImport = async () => {
    const runId = agentRunIdRef.current
    if (!runId || !agentRun.running || agentRun.cancelling) return
    const accepted = await confirm({
      title: 'Stop the agent import?',
      description:
        'The checkout in progress is rolled back to its previous agent executable and service, and the remaining checkouts are skipped. Nothing is left half-installed.',
      confirmLabel: 'Stop import',
      destructive: true
    })
    if (!accepted) return
    setAgentRun((previous) => ({ ...previous, cancelling: true }))
    try {
      const state = await getApi().storeUpdate.cancelAgentImport({ runId })
      if (!state?.cancelled) toast.info('That import had already finished')
      else
        toast.info('Stopping the import…', {
          description: 'The current checkout is being rolled back first.'
        })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAgentRun((previous) => (previous.running ? previous : { ...previous, cancelling: false }))
    }
  }

  /* -------------------------------------------- update Store Commerce */
  /**
   * One, several (the selected checkboxes) or all checkouts: the guided
   * pipeline closes Store Commerce, runs the deployed installer with its `install` argument
   * through the agent and reports the resulting version per checkout.
   */
  const startInstall = async (targets, { all = false } = {}) => {
    if (installBusyRef.current || anyDeployRunning || !targets.length || !settings) return
    const accepted = await confirm({
      title: all
        ? `Update Store Commerce on all ${targets.length} checkout(s)?`
        : targets.length === 1
          ? `Update Store Commerce on ${targets[0].name}?`
          : `Update Store Commerce on ${targets.length} selected checkout(s)?`,
      description: `Per checkout: connection check → is Store Commerce open? → close it → verify it is closed → look for Hyper.StoreCommerce.Installer.exe in ${settings.store_update_path} → run it with the install argument using system rights through the agent → report the new version. Checkouts are updated strictly one after another and the batch can be stopped at any time.`,
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
      setInstallRun((previous) => ({
        ...previous,
        running: false,
        cancelling: false,
        results: summary.results,
        summary: {
          ...summary,
          durationMs:
            summary.durationMs ?? summary.results?.reduce((sum, row) => sum + (row.durationMs || 0), 0)
        }
      }))
      setInstallResults((previous) => {
        const next = { ...previous }
        for (const row of summary.results) next[row.checkoutId] = row
        return next
      })
      if (summary.cancelledByOperator)
        toast.info('Store Commerce update stopped', { description: 'Remaining checkouts were skipped.' })
      else if (summary.failed)
        toast.error(
          `${summary.failed} of ${summary.total} checkout(s) failed — click the red info for details`
        )
      else toast.success(`Store Commerce updated on ${summary.ok} checkout(s)`)
      runSweep(targets)
    } catch (error) {
      setInstallRun((previous) => ({
        ...previous,
        running: false,
        cancelling: false,
        results: targets.map((checkout) => ({
          checkoutId: checkout.id,
          ok: false,
          error: error.message,
          steps: []
        })),
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
      description:
        'The checkout in progress finishes its current step, every remaining checkout is skipped. An installer that is already running on a checkout is not interrupted mid-install.',
      confirmLabel: 'Stop update',
      destructive: true
    })
    if (!accepted) return
    setInstallRun((previous) => ({ ...previous, cancelling: true }))
    try {
      const state = await getApi().storeUpdate.cancelInstall({ runId })
      if (!state?.cancelled) toast.info('That update had already finished')
      else toast.info('Stopping the update…')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setInstallRun((previous) => (previous.running ? previous : { ...previous, cancelling: false }))
    }
  }

  const toggleSelect = (checkout) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(checkout.id)) next.delete(checkout.id)
      else next.add(checkout.id)
      return next
    })
  }

  /** Selects or clears a whole branch from the card header checkbox. */
  const selectMany = (ids, value) => {
    setSelected((previous) => {
      const next = new Set(previous)
      for (const id of ids) {
        if (value) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  /** Green/red info on a card: reopen that checkout's result dialog. */
  const showInstallResult = (checkout) => setInstallView({ open: true, checkout })

  /* --------------------------------------------------------- file picker */
  const pickFile = async () => {
    try {
      const picked = await getApi().dialog.selectFile({ title: 'Choose the update file to deploy' })
      if (picked) {
        setFile({ path: picked, name: picked.split(/[\\/]/).pop() })
        toast.success(`Selected ${picked.split(/[\\/]/).pop()}`)
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  /* ------------------------------------------------------------ deploys */
  const beginRun = (mode, checkouts) => {
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

  const finishRun = (summary) => {
    setDeploying(false)
    setDialog((previous) => (previous.run ? { open: true, run: { ...previous.run, summary } } : previous))
    if (summary.failed > 0)
      toast.error(`${summary.failed} of ${summary.total} checkout(s) failed — see the summary for details`)
    else
      toast.success(
        `Deployment finished: ${summary.ok}/${summary.total} checkout(s) updated in ${formatDuration(summary.durationMs)}`
      )
  }

  const deployOne = async (checkout) => {
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
    } catch (error) {
      setDeploying(false)
      setDialog((previous) => ({ ...previous, open: false }))
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
      toast.error('No checkout is registered in the directory')
      return
    }
    const onlineTargets = allCheckouts.filter((checkout) => checkout.hostname || checkout.ip)
    const accepted = await confirm({
      title: `Deploy to ${onlineTargets.length} checkout(s)?`,
      description: `“${file.name}” will be sent to ${settings.store_update_path} on every checkout — strictly one after another. Existing files are kept as a Jalali-dated backup (14050617-name).`,
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
    } catch (error) {
      setDeploying(false)
      setDialog((previous) => ({ ...previous, open: false }))
      toast.error(error.message)
    }
  }

  // Track which checkout is currently receiving (the one with the newest step).
  useEffect(() => {
    if (!deploying) return
    const ids = Object.keys(steps)
    if (!ids.length) return
    const activeId = Number(ids[ids.length - 1])
    setDialog((previous) =>
      previous.run && previous.run.activeId !== activeId
        ? { ...previous, run: { ...previous.run, activeId } }
        : previous
    )
  }, [steps, deploying])

  /* ----------------------------------------------------------------- UI */
  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <div>
          <h1 className="page-title">Update Store App</h1>
          <p className="page-subtitle">
            Store Commerce versions across every checkout, and verified file deployment with Jalali-dated
            backups.
          </p>
        </div>

        {/* Toolbar: update file, recheck-all and deploy-to-all. */}
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
              allCheckouts.filter((checkout) => selected.has(checkout.id)),
              {}
            )
          }
          onUpdateAll={() => startInstall(allCheckouts, { all: true })}
          onRecheckAll={() => runSweep(allCheckouts)}
          onDeployAll={deployAll}
        />

        <HowItWorks settings={settings} />

        {loading ? (
          <CheckoutsSkeleton />
        ) : allCheckouts.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={26} />}
            title="No checkout registered"
            description="Add checkout devices under Branches &amp; devices first — every registered checkout then appears here grouped by its branch."
          />
        ) : (
          groups.map((group) => (
            <BranchCheckoutsCard
              key={group.branch.id}
              group={group}
              versions={versions}
              selected={selected}
              onSelectMany={selectMany}
              onToggleSelect={toggleSelect}
              onRecheckBranch={(checkouts) => runSweep(checkouts)}
              onUpdateBranch={(checkouts) => startInstall(checkouts)}
              onRecheck={recheck}
              onImportAgent={(target) => importAgents([target])}
              onDeploy={deployOne}
              onInspect={(target) => setInspect({ open: true, checkout: target })}
              onUpdateStore={(target) => startInstall([target])}
              onShowInstallResult={showInstallResult}
              installResults={installResults}
              agentBusyIds={
                agentRun.running ? new Set(agentRun.targets.map((target) => target.id)) : EMPTY_ID_SET
              }
              anyDeployRunning={anyDeployRunning}
              hasFile={Boolean(file)}
            />
          ))
        )}
      </div>

      {/* A minimized update keeps running; this pill brings the narration back. */}
      {installRun.running && !installRun.open && (
        <RunningPill
          kind="install"
          label={`Store Commerce update running — ${installRun.targets.length} checkout(s)`}
          onClick={() => setInstallRun((previous) => ({ ...previous, open: true }))}
        />
      )}

      {/* A minimized import keeps running; this pill brings the narration back. */}
      {agentRun.running && !agentRun.open && (
        <RunningPill
          kind="agent"
          label={`Agent import running — ${agentRun.targets.length} checkout(s)`}
          onClick={() => setAgentRun((previous) => ({ ...previous, open: true }))}
        />
      )}

      <AgentImportDialog
        run={agentRun}
        onCancel={stopAgentImport}
        onClose={() => setAgentRun((previous) => ({ ...previous, open: false }))}
      />

      <InstalledProgramsDialog
        open={inspect.open}
        onOpenChange={(open) => setInspect((previous) => ({ ...previous, open }))}
        checkout={inspect.checkout}
        onAdopt={adoptProgramName}
      />

      <DeployDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((previous) => ({ ...previous, open }))}
        run={dialog.run ? { ...dialog.run, steps, progress } : null}
        running={deploying}
        onClose={() => setDialog((previous) => ({ ...previous, open: false }))}
      />

      <StoreInstallDialog
        open={installRun.open}
        onOpenChange={(open) => setInstallRun((previous) => ({ ...previous, open }))}
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
        onClose={() => setInstallRun((previous) => ({ ...previous, open: false }))}
      />

      {/* The green/red info of a single card reopens just that checkout's answer. */}
      <StoreInstallDialog
        open={Boolean(installView.open && installView.checkout && installResults[installView.checkout.id])}
        onOpenChange={(open) => setInstallView((previous) => ({ ...previous, open }))}
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
        onClose={() => setInstallView((previous) => ({ ...previous, open: false }))}
      />
    </AppShell>
  )
}
