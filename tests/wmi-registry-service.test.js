const test = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('stream')
const { listProgramsViaWmi, runWmiQuery, WMI_REGISTRY_SCRIPT } = require('../electron/services/wmi-registry.service')

test('WMI uses explicit cross-domain credentials and normalizes the inventory', async () => {
  const rows = await listProgramsViaWmi('172.18.168.33', {
    credentials: { domain: 'okcs', username: 'admin', password: 'test-only' },
    timeoutMs: 321,
    run: async (request, timeout) => {
      assert.deepEqual(request, { host: '172.18.168.33', username: 'okcs\\admin', password: 'test-only' })
      assert.equal(timeout, 321)
      return '\uFEFF' + JSON.stringify([
        { name: 'Store Commerce', version: '9.52' },
        { name: 'Chrome', version: '1' },
        { name: 'Store Commerce', version: '9.52' },
        { name: 'Store Commerce', version: '9.51' }
      ])
    }
  })
  assert.equal(rows.length, 3)
  assert.equal(rows[0].name, 'Chrome')
})

test('WMI distinguishes an empty inventory from malformed/failed output', async () => {
  assert.deepEqual(await listProgramsViaWmi('CO-01', { run: async () => '[]' }), [])
  for (const raw of ['', 'garbage', 'null', '{}', '[null]', '[{}]']) {
    await assert.rejects(listProgramsViaWmi('CO-01', { run: async () => raw }), /invalid installed-programs response/)
  }
  await assert.rejects(listProgramsViaWmi('host;bad', { run: async () => { assert.fail() } }), /Invalid WMI target/)
})

test('WMI credentials are stdin JSON, never process arguments or script interpolation', async () => {
  const request = { host: 'CO-01', username: 'okcs\\admin', password: "p'\"$;秘密" }
  let input = ''
  const result = await runWmiQuery(request, 123, (command, args, options, callback) => {
    assert.equal(command, 'powershell.exe')
    assert.equal(options.timeout, 123)
    assert.equal(options.windowsHide, true)
    assert.ok(!args.join(' ').includes(request.password))
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le')
    assert.equal(script, WMI_REGISTRY_SCRIPT)
    assert.ok(!script.includes(request.username))
    const stdin = new Writable({ write(chunk, _encoding, done) { input += chunk.toString(); done() } })
    stdin.on('finish', () => callback(null, '[]'))
    return { stdin }
  })
  assert.deepEqual(JSON.parse(input), request)
  assert.equal(result, '[]')
})

test('process errors and timeouts never leak raw PowerShell diagnostics', async () => {
  for (const killed of [true, false]) {
    await assert.rejects(runWmiQuery({ password: 'secret-fixture' }, 10, (_command, _args, _options, callback) => {
      setImmediate(() => callback(Object.assign(new Error('secret-fixture'), { killed }), '', 'secret-fixture'))
      return { stdin: new Writable({ write(_chunk, _encoding, done) { done() } }) }
    }), (error) => {
      assert.ok(!error.message.includes('secret-fixture'))
      assert.equal(error.code, killed ? 'WMI_TIMEOUT' : 'WMI_UNAVAILABLE')
      return true
    })
  }
})

test('WMI script is read-only and does not require WinRM or RemoteRegistry', () => {
  assert.match(WMI_REGISTRY_SCRIPT, /New-CimSessionOption -Protocol Dcom/)
  assert.match(WMI_REGISTRY_SCRIPT, /StdRegProv/)
  assert.match(WMI_REGISTRY_SCRIPT, /WOW6432Node/)
  assert.match(WMI_REGISTRY_SCRIPT, /Remove-CimSession/)
  assert.doesNotMatch(WMI_REGISTRY_SCRIPT, /Win32_Product|Invoke-Command|Start-Service|Set-Service|SetStringValue/)
})

// Parse with the actual Windows PowerShell engine on CI/release builds.
test('WMI script parses in Windows PowerShell', { skip: process.platform !== 'win32' }, async () => {
  const { defaultRunPs, psLiteral } = require('../electron/services/software.service')
  const result = await defaultRunPs(`$tokens = $null; $errors = $null; [void][System.Management.Automation.Language.Parser]::ParseInput(${psLiteral(WMI_REGISTRY_SCRIPT)}, [ref]$tokens, [ref]$errors); if ($errors.Count) { throw ($errors | Out-String) }; 'ok'`)
  assert.equal(result.trim(), 'ok')
})
