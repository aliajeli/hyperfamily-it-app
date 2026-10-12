const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { AgentCommands } = require('../../electron/services/agent-commands')

/**
 * The desktop whitelist and the agent's whitelist must never drift apart:
 * v3.10.3-beta.1 shipped an agent that hashes deploy payloads ON the checkout
 * (action `sha256`), but the desktop refused to send it, so every deploy
 * silently fell back to the slow full read-back hash. These tests pin the
 * contract both sides of the SMB share rely on, using a real temporary
 * directory as the stand-in for `\\host\C$\Agent`.
 */
async function makeCommands(overrides = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'agent-commands-'))
  const published = []
  const commands = new AgentCommands({
    agentPathMapper: (host, relative = '') => path.join(root, String(relative).replace(/\//g, path.sep)),
    delay: async () => {}, // fast polling; real deadlines are covered by the timeout tests below
    writeFile: async (file, data) => {
      published.push([file, String(data)])
      await fsp.writeFile(file, data)
    },
    ...overrides
  })
  return { root, commands, published }
}

test('sha256 is an accepted agent command and round-trips to the answer file', async () => {
  const id = 'aabbccddeeff0011'
  const answer = {
    protocolVersion: 1,
    id,
    action: 'sha256',
    ok: true,
    running: false,
    closed: true,
    processes: [],
    version: null,
    output: null,
    exitCode: null,
    timedOut: false,
    error: null,
    sha256: 'ab'.repeat(32),
    at: new Date().toISOString()
  }
  const { root, commands, published } = await makeCommands({ randomId: () => id })
  // The agent's answer appears in data/results while the loop polls.
  await fsp.mkdir(path.join(root, 'data', 'results'), { recursive: true })
  await fsp.writeFile(path.join(root, 'data', 'results', `${id}.json`), JSON.stringify(answer))

  const result = await commands.sendCommand('co-01', { action: 'sha256', path: 'D:\\Store\\app.exe' })
  assert.equal(result.sha256, 'ab'.repeat(32))

  // The command payload is published as <id>.tmp and renamed to <id>.cmd, so
  // the recorded write carries the .tmp name — the content is what matters.
  const commandFile = published.find(([file]) => file.endsWith(`${id}.tmp`))
  assert.ok(commandFile, 'the command payload was written')
  assert.match(commandFile[1], /action=sha256/)
  assert.match(commandFile[1], /path=D:\\Store\\app\.exe/)
  // …and the command (renamed to .cmd) plus the answer are cleaned up after a successful run.
  assert.equal(fs.existsSync(path.join(root, 'data', 'commands', `${id}.cmd`)), false)
  assert.equal(fs.existsSync(path.join(root, 'data', 'results', `${id}.json`)), false)
  await fsp.rm(root, { recursive: true, force: true })
})

test('sha256 requires a full local path on the checkout', async () => {
  const { commands } = await makeCommands()
  await assert.rejects(
    () => commands.sendCommand('co-01', { action: 'sha256', path: 'Store/app.exe' }),
    /full local path/
  )
  await assert.rejects(() => commands.sendCommand('co-01', { action: 'sha256' }), /full local path/)
})

test('install still requires a full local path', async () => {
  const { commands } = await makeCommands()
  await assert.rejects(
    () => commands.sendCommand('co-01', { action: 'install', path: 'installer.exe' }),
    /full local path/
  )
})

test('unknown actions are still refused before anything touches the wire', async () => {
  const { root, commands, published } = await makeCommands()
  await assert.rejects(() => commands.sendCommand('co-01', { action: 'reboot' }), /Unsupported agent command/)
  assert.equal(published.length, 0, 'nothing was published for a refused action')
  await fsp.rm(root, { recursive: true, force: true })
})

test('status and close stay accepted', async () => {
  const { root, commands } = await makeCommands()
  // No answer file will ever appear, so both must run the poll loop and time
  // out with the "did not answer" diagnostic — proving the whitelist accepted
  // them instead of refusing them.
  await assert.rejects(
    () => commands.sendCommand('co-01', { action: 'status' }, { timeoutMs: 20 }),
    /did not answer/
  )
  await assert.rejects(
    () => commands.sendCommand('co-01', { action: 'close' }, { timeoutMs: 20 }),
    /did not answer/
  )
  await fsp.rm(root, { recursive: true, force: true })
})
