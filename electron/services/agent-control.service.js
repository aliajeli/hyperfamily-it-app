const { execFile } = require('child_process')
const { defaultRunPs, psLiteral } = require('./software.service')
const { setTimeout: delay } = require('node:timers/promises')

const SERVICE_NAME = 'HyperFamilyStoreAgent'
const AGENT_EXE = 'HyperFamilyStoreAgent.exe'
const AGENT_PATH = `C:\\Agent\\${AGENT_EXE}`

function normalizeHost(host) {
  const clean = String(host || '').trim()
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(clean)) throw new Error('Invalid agent target hostname or IP')
  return clean
}

// Every sc.exe/OpenSCManager hop negotiates RPC-over-SMB with the remote
// Service Control Manager; over a slow VPN that handshake alone can stretch
// past the old 20 s cap. 45 s stays far below any human attention span yet
// comfortably covers a lossy branch link.
const SC_TIMEOUT_MS = 45000

function runSc(host, args, allowed = []) {
  return new Promise((resolve, reject) => {
    execFile('sc.exe', [`\\\\${normalizeHost(host)}`, ...args], { timeout: SC_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' }, (error, stdout = '', stderr = '') => {
      if (error && !allowed.includes(Number(error.code))) {
        reject(new Error(`Agent service control failed on ${host} — ${String(stderr || stdout || 'Allow Remote Service Management and check Target access administrator permissions').trim()}`))
      } else resolve({ code: Number(error?.code || 0), stdout: String(stdout) })
    })
  })
}

class AgentControl {
  constructor(options = {}) {
    this.runPs = options.runPs || defaultRunPs
    this.sc = options.sc || runSc
  }

  async query(host) {
    normalizeHost(host)
    const probe = await this.sc(host, ['query', SERVICE_NAME], [1060])
    if (probe.code === 1060) return { exists: false, state: 'Missing' }
    // ServiceController uses SCM, not WMI, WinRM or Remote Registry. Its enum
    // names are invariant, unlike localized sc.exe table headings.
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.ServiceProcess
$service = New-Object System.ServiceProcess.ServiceController('${SERVICE_NAME}', ${psLiteral(host)})
try {
  @{ exists = $true; state = $service.Status.ToString() } | ConvertTo-Json -Compress
} catch {
  $cause = $_.Exception
  while ($cause.InnerException) { $cause = $cause.InnerException }
  if ($cause.NativeErrorCode -eq 1060) { '{"exists":false,"state":"Missing"}' }
  else { throw 'Cannot query the agent service. Check Target access and Remote Service Management firewall permissions.' }
} finally { $service.Dispose() }
`
    return JSON.parse(String(await this.runPs(script, SC_TIMEOUT_MS)).trim())
  }

  async assertOwnedService(host) {
    const result = await this.sc(host, ['qc', SERVICE_NAME], [1060])
    if (result.code === 1060) return
    // Refuse to repurpose an unrelated pre-existing service with the same name.
    if (!/^\s*[^:\r\n]+:\s*"?C:\\Agent\\HyperFamilyStoreAgent\.exe"?\s*$/im.test(result.stdout)) {
      throw new Error('An existing HyperFamilyStoreAgent service points outside the expected agent executable; it was not changed')
    }
  }

  async secureDirectories(host) {
    const root = `\\\\${normalizeHost(host)}\\C$\\Agent`
    // The service runs as LocalSystem, so only SYSTEM (S-1-5-18) and local
    // Administrators (S-1-5-32-544) need access. LocalService is deliberately
    // NOT granted anything: it must never be able to plant command files that
    // the SYSTEM-level agent would then execute.
    const script = `
$ErrorActionPreference = 'Stop'
$root = ${psLiteral(root)}
foreach ($path in @($root, "$root\\data")) {
  $item = Get-Item -LiteralPath $path -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Agent directory must not be a reparse point' }
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sidText in @('S-1-5-18', 'S-1-5-32-544')) {
    $sid = New-Object System.Security.Principal.SecurityIdentifier($sidText)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  (New-Object System.IO.DirectoryInfo($path)).SetAccessControl($acl)
}
# Reset the executable's own ACL as well if it already existed with explicit
# grants. It must inherit only the now-protected parent directory's rules.
$exe = Join-Path $root '${AGENT_EXE}'
if (Test-Path -LiteralPath $exe) {
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($false, $false)
  (New-Object System.IO.FileInfo($exe)).SetAccessControl($acl)
}
`
    // ACL work is many small SMB transactions — allow extra time on WAN/VPN.
    await this.runPs(script, 60000)
  }

  async waitFor(host, state, timeoutMs = 120000) {
    const end = Date.now() + timeoutMs
    do {
      const status = await this.query(host)
      if (status.state === state) return status
      await delay(500)
    } while (Date.now() < end)
    throw new Error(`Agent service did not reach ${state} on ${host} in time`)
  }

  async stop(host) {
    await this.sc(host, ['stop', SERVICE_NAME], [1062, 1060])
    const status = await this.query(host)
    if (status.exists) await this.waitFor(host, 'Stopped')
  }

  async configure(host, exists) {
    // LocalSystem is required: the agent closes Store Commerce processes that
    // belong to other sessions and runs the Store Commerce installer, which
    // writes to C:\Program Files. LocalService can do neither.
    await this.sc(host, [exists ? 'config' : 'create', SERVICE_NAME,
      'binPath=', `"${AGENT_PATH}"`, 'start=', 'auto', 'type=', 'own',
      'obj=', 'LocalSystem',
      'DisplayName=', 'HyperFamily Store Inventory Agent'])
    await this.sc(host, ['description', SERVICE_NAME, 'Store Commerce update agent for HyperFamily Branch Monitor: inventory, Store Commerce close and installer execution.'])
    await this.sc(host, ['failure', SERVICE_NAME, 'reset=', '86400', 'actions=', 'restart/5000/restart/15000/restart/60000'])
  }

  async start(host) {
    await this.sc(host, ['start', SERVICE_NAME], [1056])
    await this.waitFor(host, 'Running')
  }

  async remove(host) { await this.sc(host, ['delete', SERVICE_NAME], [1060]) }
}

module.exports = { AgentControl, SERVICE_NAME, AGENT_EXE, AGENT_PATH, normalizeHost }
