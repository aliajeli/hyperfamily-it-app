const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs/promises')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { randomUUID } = require('crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { verifyNativeAgent } = require('../electron/scripts/verify-agent')
const { validateSnapshot } = require('../electron/services/store-agent.service')
const appVersion = require('../package.json').version
const { StoreAgentService } = require('../electron/services/store-agent.service')
const { AgentControl, AGENT_EXE } = require('../electron/services/agent-control.service')

// Explicit opt-in: creates a real Windows Service on an ephemeral CI runner.
// Never run against a user's existing agent installation or network checkout.
const enabled = process.platform === 'win32' && process.env.HF_AGENT_WINDOWS_TEST === '1'
test('native EXE is small, standalone, and reads Unicode plus both registry views', { skip: !enabled, timeout: 90000 }, async () => {
  const source = path.join(__dirname, '../agent/build', AGENT_EXE)
  const binary = verifyNativeAgent(source)
  assert.ok(binary.size < 2 * 1024 * 1024)
  const exec = promisify(execFile)
  const versionInfo = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-Item -LiteralPath '${source.replace(/'/g, "''")}').VersionInfo | Select-Object FileVersion,ProductVersion,IsPreRelease | ConvertTo-Json -Compress`])
  const resource = JSON.parse(versionInfo.stdout)
  assert.equal(resource.FileVersion, appVersion)
  assert.equal(resource.ProductVersion, appVersion)
  assert.equal(resource.IsPreRelease, appVersion.includes('-'))
  const key = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\HyperFamilyNativeTest-${randomUUID()}`
  const names = { 64: 'HyperFamily Native x64 فارسی', 32: 'HyperFamily Native x86 日本語' }
  try {
    for (const view of [64, 32]) {
      for (const [name, type, value] of [
        ['DisplayName', 'REG_SZ', names[view]],
        ['DisplayVersion', 'REG_SZ', `8.${view}`],
        ['Publisher', 'REG_SZ', 'Publisher "quoted"'],
        ['InstallLocation', 'REG_EXPAND_SZ', '%WINDIR%\\HyperFamily']
      ]) await exec('reg.exe', ['add', key, '/v', name, '/t', type, '/d', value, '/f', `/reg:${view}`])
    }
    const result = await exec(source, ['--self-test'], { timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
    const snapshot = validateSnapshot(result.stdout)
    assert.equal(snapshot.agentVersion, appVersion)
    assert.equal(snapshot.sequence, 2)
    const sentinel = snapshot.programs.find((row) => row.key === 'SelfTest')
    assert.equal(sentinel.name, 'HyperFamily "Self-test" فارسی 😀')
    assert.equal(sentinel.publisher, 'line1\nline2\t')
    for (const view of [64, 32]) {
      const row = snapshot.programs.find((entry) => entry.name === names[view])
      assert.ok(row, `Missing ${view}-bit registry view`)
      assert.equal(row.version, `8.${view}`)
      assert.equal(row.publisher, 'Publisher "quoted"')
      assert.equal(row.installLocation.toLowerCase(), `${process.env.SystemRoot}\\HyperFamily`.toLowerCase())
    }
    console.log(`Native agent: ${binary.size} bytes; imports: ${binary.imports.join(', ')}`)
  } finally {
    for (const view of [64, 32]) await exec('reg.exe', ['delete', key, '/f', `/reg:${view}`]).catch(() => {})
  }
})

test('Windows EXE: self-test, real LocalService install, heartbeat, hash skip and stop detection', { skip: !enabled, timeout: 180000 }, async () => {
  const source = path.join(__dirname, '../agent/build', AGENT_EXE)
  await promisify(execFile)(source, ['--self-test'], { timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
  const control = new AgentControl()
  const existing = await control.query('localhost')
  assert.equal(existing.exists, false, 'Refuse to touch a pre-existing agent service')
  await assert.rejects(fs.stat('C:\\Agent'), { code: 'ENOENT' })
  const agent = new StoreAgentService({
    sourcePath: source,
    // Local paths exercise the same installer without relying on the runner's
    // administrative-share policy. SCM/ACL/startup/EXE are the real Windows APIs.
    agentPathMapper: (_host, relative = '') => path.join('C:\\Agent', relative),
    control,
    reach: async (host) => ({ status: 'online', host }),
    smb: { withHost: async (_host, _credentials, task) => task() }
  })
  // ACL code normally operates over C$. Substitute only the path for this
  // local smoke test, leaving the actual PowerShell ACL commands unchanged.
  const runPs = control.runPs
  const { psLiteral } = require('../electron/services/software.service')
  control.runPs = (script, timeout) => runPs(script.replace(psLiteral('\\\\localhost\\C$\\Agent'), psLiteral('C:\\Agent')), timeout)
  try {
    const first = await agent.importOne({ id: 1, hostname: 'localhost' })
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.copied, true)
    const data = await agent.inspect('localhost')
    assert.equal(data.running, true, data.reason)
    assert.equal(data.inventoryError, null)
    assert.ok(Array.isArray(data.programs))
    assert.equal(data.agentVersion, appVersion)
    assert.ok(!data.programs.some((row) => row.key === 'SelfTest'), 'Self-test fixture must never appear in live inventory')
    await delay(17000)
    const next = await agent.inspect('localhost')
    assert.equal(next.running, true, next.reason)
    assert.ok(next.sequence > data.sequence, 'Native service must keep publishing heartbeats')
    assert.equal(next.instanceId, data.instanceId)
    const qc = await control.sc('localhost', ['qc', 'HyperFamilyStoreAgent'])
    assert.match(qc.stdout, /LocalService/i)
    assert.match(qc.stdout, /:\s*2\s+AUTO_START/i)
    const again = await agent.importOne({ id: 1, hostname: 'localhost' })
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.equal(again.copied, false)
    assert.notEqual((await agent.inspect('localhost')).instanceId, data.instanceId)
    await control.stop('localhost')
    assert.equal((await agent.inspect('localhost')).running, false)
  } finally {
    await control.stop('localhost').catch(() => {})
    await control.remove('localhost').catch(() => {})
    await fs.rm('C:\\Agent', { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  }
})
