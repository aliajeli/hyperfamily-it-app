const test = require('node:test')
const assert = require('node:assert/strict')
const { StoreInstallService, INSTALLER_FILE } = require('../electron/services/store-install.service')

/**
 * The whole Update Store Commerce pipeline with every OS-shaped dependency
 * injected: reachability, the SMB session, the agent heartbeat, the command
 * channel and the installer file probe are all fakes, so the exact step order
 * and the per-checkout answer are provable on any platform.
 */
function harness(overrides = {}) {
  const events = []
  const sent = []
  const state = {
    reachStatus: 'online',
    agentRunning: true,
    agentVersion: '3.1.4',
    storeRunning: true,
    closeOk: true,
    fileExists: true,
    installer: { ok: true, exitCode: 0, output: 'Installed successfully', version: '9.60.24100.1', timedOut: false, error: '' },
    versionBefore: '9.52.24020.3'
  }
  Object.assign(state, overrides)
  const service = new StoreInstallService(
    (channel, payload) => events.push({ channel, payload }),
    {
      platform: 'win32',
      reach: async () => (state.reachStatus === 'offline'
        ? { status: 'offline', detail: 'SMB did not answer' }
        : { status: 'online', host: '10.0.0.5', ping_time: 6, detail: 'SMB answered in 6 ms' }),
      reachTimeoutMs: 50,
      stepTimeoutMs: 200,
      smb: { withHost: async (_host, _credentials, task) => task() },
      agent: { inspect: async () => (state.agentRunning ? { running: true, agentVersion: state.agentVersion } : { running: false, reason: 'Agent service is Stopped' }) },
      commands: {
        sendCommand: async (_host, command) => {
          sent.push(command)
          if (command.action === 'status') {
            return { protocolVersion: 1, id: 'x', action: 'status', ok: true, running: state.storeRunning, processes: state.storeRunning ? [{ name: 'StoreCommerce.exe', pid: 4242 }] : [], version: state.versionBefore }
          }
          if (command.action === 'close') {
            state.storeRunning = false
            return { protocolVersion: 1, id: 'x', action: 'close', ok: state.closeOk, running: !state.closeOk, processes: state.closeOk ? [] : [{ name: 'StoreCommerce.exe', pid: 4242 }], version: state.versionBefore, error: state.closeOk ? '' : 'still running' }
          }
          if (command.action === 'install') {
            return { protocolVersion: 1, id: 'x', action: 'install', ok: state.installer.ok, exitCode: state.installer.exitCode, output: state.installer.output, version: state.installer.version, timedOut: state.installer.timedOut, error: state.installer.error, processes: [] }
          }
          throw new Error(`unexpected command ${command.action}`)
        }
      },
      probe: async () => ({ reachable: true, exists: state.fileExists, size: 4812032 }),
      destinationMapper: (_host, local) => `\\\\10.0.0.5\\C$\\${local.replace(/^C:\\/, '')}`,
      getCredentials: () => ({ domain: 'okcs', username: 'administrator', password: 'x' })
    }
  )
  const checkout = { id: 7, name: 'st10007r02', hostname: 'st10007r02', ip: '10.0.0.5' }
  const stepStatuses = (result, step) => result.steps.filter((entry) => entry.step === step).map((entry) => entry.status)
  return { service, checkout, events, sent, state, stepStatuses }
}

const DEST = 'C:\\Updates'

test('happy path: close → verify → installer /install → version, with the full answer', async () => {
  const { service, checkout, events, sent, stepStatuses } = harness()
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, true)
  assert.equal(result.exitCode, 0)
  assert.equal(result.version, '9.60.24100.1')
  assert.equal(result.versionBefore, '9.52.24020.3')
  assert.match(result.output, /Installed successfully/)
  // the exact step order the operators asked for
  assert.deepEqual(result.steps.map((entry) => `${entry.step}:${entry.status}`).filter((row) => !row.endsWith(':running')), [
    'reachability:done', 'agent:done', 'running-check:done', 'close:done', 'verify-closed:done',
    'file-check:done', 'install:done', 'version:done'
  ])
  // every step is narrated live for the dialog
  const installSteps = events.filter((event) => event.channel === 'store-update:install-step')
  assert.ok(installSteps.length >= 8)
  assert.equal(installSteps.at(-1).payload.step, 'version')
  // the installer is executed with the checkout-local path
  const install = sent.find((command) => command.action === 'install')
  assert.equal(install.path, `${DEST}\\${INSTALLER_FILE}`)
  assert.equal(stepStatuses(result, 'close').includes('done'), true)
})

test('Store Commerce already closed: the close step is skipped, not failed', async () => {
  const { service, checkout } = harness({ storeRunning: false })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, true)
  const close = result.steps.filter((entry) => entry.step === 'close')
  assert.equal(close.at(-1).status, 'skipped')
  assert.match(close.at(-1).detail, /already closed/)
})

test('offline checkout fails at the connection check and touches nothing else', async () => {
  const { service, checkout, sent } = harness({ reachStatus: 'offline' })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'Checkout unreachable')
  assert.equal(result.steps.at(-1).step, 'reachability')
  assert.equal(sent.length, 0, 'no command may be sent to an offline checkout')
})

test('missing agent fails with the Import Agent hint before any command', async () => {
  const { service, checkout, sent } = harness({ agentRunning: false })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, false)
  assert.match(result.error, /Import Agent/)
  assert.equal(sent.length, 0)
})

test('an agent older than the command channel is rejected with a clear upgrade hint', async () => {
  const { service, checkout } = harness({ agentVersion: '3.1.2' })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, false)
  assert.match(result.error, /too old — run Import Agent/)
})

test('missing installer fails the file check but STILL reports the version', async () => {
  const { service, checkout } = harness({ fileExists: false })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, false)
  assert.match(result.error, /not found — deploy it first/)
  assert.equal(result.version, '9.52.24020.3', 'the version is shown on failure too')
  const version = result.steps.filter((entry) => entry.step === 'version')
  assert.equal(version.at(-1).status, 'done')
})

test('a failing installer is red, carries exit code and output, and shows the final version', async () => {
  const { service, checkout } = harness({
    installer: { ok: false, exitCode: 1603, output: 'Fatal error during installation', version: '9.52.24020.3', timedOut: false, error: 'The installer exited with code 1603' }
  })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 1603)
  assert.match(result.output, /Fatal error/)
  assert.equal(result.version, '9.52.24020.3')
  assert.equal(result.steps.filter((entry) => entry.step === 'install').at(-1).status, 'failed')
  assert.equal(result.steps.filter((entry) => entry.step === 'version').at(-1).status, 'done')
})

test('a Store Commerce that refuses to die stops the pipeline before the file check', async () => {
  const { service, checkout, sent } = harness({ closeOk: false })
  const result = await service.installOne(checkout, { destinationPath: DEST })
  assert.equal(result.ok, false)
  assert.match(result.error, /could not be closed/)
  assert.equal(sent.some((command) => command.action === 'install'), false, 'the installer must never run while Store Commerce lives')
})

test('installAll runs strictly serially and emits the finished summary', async () => {
  const { service, events } = harness()
  const checkouts = [
    { id: 1, name: 'co-1', hostname: 'co-1', ip: '10.0.0.1' },
    { id: 2, name: 'co-2', hostname: 'co-2', ip: '10.0.0.2' }
  ]
  const summary = await service.installAll(checkouts, { destinationPath: DEST })
  assert.equal(summary.total, 2)
  assert.equal(summary.ok, 2)
  assert.equal(summary.failed, 0)
  const finished = events.filter((event) => event.channel === 'store-update:install-finished')
  assert.equal(finished.length, 1)
  assert.equal(finished[0].payload.runId, summary.runId)
})

test('Stop skips the remaining checkouts and flags the batch as cancelled', async () => {
  const { service } = harness()
  const checkouts = [
    { id: 1, name: 'co-1', hostname: 'co-1', ip: '10.0.0.1' },
    { id: 2, name: 'co-2', hostname: 'co-2', ip: '10.0.0.2' },
    { id: 3, name: 'co-3', hostname: 'co-3', ip: '10.0.0.3' }
  ]
  const runId = `install-test-${Date.now()}`
  const run = service.installAll(checkouts, { destinationPath: DEST, runId })
  // Stop the moment the batch is registered: the first checkout is already in
  // flight, every later one must be skipped.
  assert.equal(service.cancel(runId).cancelled, true)
  const summary = await run
  assert.equal(summary.cancelledByOperator, true)
  const skipped = summary.results.filter((row) => row.skipped)
  assert.ok(skipped.length >= 1, 'at least one checkout must be skipped after Stop')
  assert.ok(summary.results.every((row) => row.ok || row.cancelled), 'nothing may report a hard failure after a Stop')
})

test('a missing destination folder is refused before anything is sent', async () => {
  const { service, checkout } = harness()
  await assert.rejects(() => service.installOne(checkout, {}), /Set the deploy destination folder/)
})
