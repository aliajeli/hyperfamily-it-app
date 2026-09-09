const { execFile } = require('child_process')
const { qualifyUser } = require('./smb.service')

// Read-only StdRegProv over DCOM: no RemoteRegistry or WinRM dependency and,
// unlike Win32_Product, no MSI consistency checks/repair side effects.
// Input (including credentials) travels over stdin, never command-line args.
const WMI_REGISTRY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$session = $null
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $options = New-CimSessionOption -Protocol Dcom
  $connect = @{ ComputerName = [string]$request.host; SessionOption = $options; OperationTimeoutSec = 15 }
  if ($request.username) {
    $secure = ConvertTo-SecureString ([string]$request.password) -AsPlainText -Force
    $connect.Credential = New-Object System.Management.Automation.PSCredential ([string]$request.username, $secure)
  }
  $session = New-CimSession @connect
  $provider = @{ CimSession = $session; Namespace = 'root/default'; ClassName = 'StdRegProv'; ErrorAction = 'Stop' }
  $roots = @('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
  $rows = New-Object 'System.Collections.Generic.List[object]'
  $readableRoots = 0
  foreach ($root in $roots) {
    $keys = Invoke-CimMethod @provider -MethodName EnumKey -Arguments @{ hDefKey = [uint32]2147483650; sSubKeyName = $root }
    if ($keys.ReturnValue -eq 2) { continue }
    if ($keys.ReturnValue -ne 0) { throw 'Registry enumeration denied or failed' }
    $readableRoots++
    foreach ($key in $keys.sNames) {
      $row = @{ key = "HKLM\$root\$key"; name = ''; version = ''; publisher = ''; installLocation = '' }
      $fields = [ordered]@{ DisplayName = 'name'; DisplayVersion = 'version'; Publisher = 'publisher'; InstallLocation = 'installLocation' }
      foreach ($field in $fields.Keys) {
        $value = Invoke-CimMethod @provider -MethodName GetStringValue -Arguments @{ hDefKey = [uint32]2147483650; sSubKeyName = "$root\$key"; sValueName = $field }
        if ($value.ReturnValue -eq 0) { $row[$fields[$field]] = [string]$value.sValue }
        elseif ($value.ReturnValue -ne 2) { throw 'Registry value read denied or failed' }
        if ($field -eq 'DisplayName' -and -not $row.name) { break }
      }
      if ($row.name) { $rows.Add([pscustomobject]$row) }
    }
  }
  if ($readableRoots -eq 0) { throw 'No readable uninstall registry keys' }
  $json = ConvertTo-Json -InputObject @($rows.ToArray()) -Compress -Depth 3
  [Console]::Out.Write($json)
} catch {
  # Never echo the request, password, invocation or raw exception to the UI.
  [Console]::Error.Write('WMI registry read failed. Check Target access credentials, WMI permissions and the Windows Management Instrumentation firewall rules (DCOM).')
  exit 1
} finally {
  if ($null -ne $session) { Remove-CimSession $session -ErrorAction SilentlyContinue }
}
`.trim()

function runWmiQuery(request, timeoutMs, exec = execFile) {
  return new Promise((resolve, reject) => {
    const child = exec('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(WMI_REGISTRY_SCRIPT, 'utf16le').toString('base64')
    ], { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        const failure = new Error(error.killed
          ? 'WMI registry query timed out — check the target WMI/DCOM firewall rules'
          : 'WMI registry read failed — check Settings → Store App → Target access, WMI permissions and WMI/DCOM firewall rules')
        failure.code = error.killed ? 'WMI_TIMEOUT' : 'WMI_UNAVAILABLE'
        reject(failure)
      } else resolve(String(stdout || ''))
    })
    // An early child exit can close the pipe before the input is consumed.
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(request), 'utf8')
  })
}

async function listProgramsViaWmi(host, options = {}) {
  const clean = String(host || '').trim().replace(/^\\+/, '')
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(clean)) throw new Error('Invalid WMI target host')
  const credentials = options.credentials || {}
  const request = {
    host: clean,
    username: qualifyUser(credentials.domain, credentials.username),
    password: String(credentials.password || '')
  }
  const raw = await (options.run || runWmiQuery)(request, options.timeoutMs || 30000)
  let rows
  try {
    rows = JSON.parse(String(raw).replace(/^\uFEFF/, '').trim())
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.name !== 'string')) throw new Error('Invalid rows')
  } catch {
    throw new Error('WMI returned an invalid installed-programs response')
  }
  const seen = new Set()
  return rows.filter((row) => {
    if (!row.name.trim()) return false
    const key = `${row.name.toLowerCase()}|${row.version || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.name.localeCompare(b.name))
}

module.exports = { listProgramsViaWmi, runWmiQuery, WMI_REGISTRY_SCRIPT }
