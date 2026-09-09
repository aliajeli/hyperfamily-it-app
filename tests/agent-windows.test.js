const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs/promises')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { StoreAgentService } = require('../electron/services/store-agent.service')
const { AgentControl, AGENT_EXE } = require('../electron/services/agent-control.service')

// Explicit opt-in: creates a real Windows Service on an ephemeral CI runner.
// Never run against a user's existing agent installation or network checkout.
const enabled = process.platform === 'win32' && process.env.HF_AGENT_WINDOWS_TEST === '1'
test('Windows EXE: self-test, real LocalService install, heartbeat, hash skip and stop detection', { skip: !enabled, timeout: 180000 }, async () => {
  const source = path.join(__dirname, '../agent/build', AGENT_EXE)
  await promisify(execFile)(source, ['--self-test'], { timeout: 30000 })
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
    assert.equal((await control.query('localhost')).startup, 'Automatic')
    const data = await agent.inspect('localhost')
    assert.equal(data.running, true, data.reason)
    assert.equal(data.inventoryError, null)
    assert.ok(Array.isArray(data.programs))
    const qc = await control.sc('localhost', ['qc', 'HyperFamilyStoreAgent'])
    assert.match(qc.stdout, /LocalService/i)
    const again = await agent.importOne({ id: 1, hostname: 'localhost' })
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.equal(again.copied, false)
    await control.stop('localhost')
    assert.equal((await agent.inspect('localhost')).running, false)
  } finally {
    await control.stop('localhost').catch(() => {})
    await control.remove('localhost').catch(() => {})
    await fs.rm('C:\\Agent', { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  }
})
