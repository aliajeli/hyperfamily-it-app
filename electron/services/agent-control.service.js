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

function runSc(host, args, allowed = []) {
  return new Promise((resolve, reject) => {
    execFile('sc.exe', [`\\\\${normalizeHost(host)}`, ...args], { timeout: 20000, windowsHide: true, encoding: 'utf8' }, (error, stdout = '', stderr = '') => {
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
    return JSON.parse(String(await this.runPs(script, 15000)).trim())
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
    // Only Administrators/SYSTEM can replace binaries. LocalService can READ
    // the executable and MODIFY data, but cannot replace the executable.
    const script = `
$ErrorActionPreference = 'Stop'
$root = ${psLiteral(root)}
foreach ($entry in @(@{ Path = $root; AgentRights = 'ReadAndExecute' }, @{ Path = "$root\\data"; AgentRights = 'Modify' })) {
  $item = Get-Item -LiteralPath $entry.Path -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Agent directory must not be a reparse point' }
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($grant in @(@{ Sid='S-1-5-18'; Rights='FullControl' }, @{ Sid='S-1-5-32-544'; Rights='FullControl' }, @{ Sid='S-1-5-19'; Rights=$entry.AgentRights })) {
    $sid = New-Object System.Security.Principal.SecurityIdentifier($grant.Sid)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, $grant.Rights, 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $entry.Path -AclObject $acl
}
# Reset the executable's own ACL as well if it already existed with explicit
# grants. It must inherit only the now-protected parent directory's rules.
$exe = Join-Path $root '${AGENT_EXE}'
if (Test-Path -LiteralPath $exe) {
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($false, $false)
  Set-Acl -LiteralPath $exe -AclObject $acl
}
`
    await this.runPs(script, 20000)
  }

  async waitFor(host, state, timeoutMs = 45000) {
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
    await this.sc(host, [exists ? 'config' : 'create', SERVICE_NAME,
      'binPath=', `"${AGENT_PATH}"`, 'start=', 'auto', 'type=', 'own',
      'obj=', 'NT AUTHORITY\\LocalService', 'password=', '',
      'DisplayName=', 'HyperFamily Store Inventory Agent'])
    await this.sc(host, ['description', SERVICE_NAME, 'Read-only local software inventory for HyperFamily Branch Monitor.'])
    await this.sc(host, ['failure', SERVICE_NAME, 'reset=', '86400', 'actions=', 'restart/5000/restart/15000/restart/60000'])
  }

  async start(host) {
    await this.sc(host, ['start', SERVICE_NAME], [1056])
    await this.waitFor(host, 'Running')
  }

  async remove(host) { await this.sc(host, ['delete', SERVICE_NAME], [1060]) }
}

module.exports = { AgentControl, SERVICE_NAME, AGENT_EXE, AGENT_PATH, normalizeHost }
