'use strict'

const fs = require('fs')
const fsp = fs.promises
const { execFile } = require('child_process')

const { checkReachable } = require('./reachability.service')
const { SmbSessionManager } = require('./smb.service')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** UNC form of a local Windows path on a remote machine (C:\x → \\host\C$\x). */
function unc(host, localPath) {
  const clean = String(localPath || '').replace(/\//g, '\\')
  if (/^[A-Za-z]:\\/.test(clean)) return `\\\\${host}\\${clean.slice(0, 1)}$${clean.slice(2)}`
  return `\\\\${host}\\${clean}`
}

/** Install locations to look for on the source workstation. */
const INSTALL_CANDIDATES = [
  'C:\\Program Files\\HyperFamily Branch Monitor\\HyperFamily Branch Monitor.exe',
  'C:\\Program Files (x86)\\HyperFamily Branch Monitor\\HyperFamily Branch Monitor.exe',
  'D:\\Program Files\\HyperFamily Branch Monitor\\HyperFamily Branch Monitor.exe'
]

// Launches the remote app's headless export through WMI (DCOM), the same
// transport the registry reader uses. The process runs as the connecting
// administrator account — the same account the application on that machine
// uses — so it can open its own encrypted database. Input (including
// credentials) travels over stdin, never command-line args, and errors are
// sanitised before they reach the UI.
const WMI_PROCESS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$session = $null
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $options = New-CimSessionOption -Protocol Dcom
  $connect = @{ ComputerName = [string]$request.host; SessionOption = $options; OperationTimeoutSec = 20 }
  if ($request.username) {
    $secure = ConvertTo-SecureString ([string]$request.password) -AsPlainText -Force
    $connect.Credential = New-Object System.Management.Automation.PSCredential ([string]$request.username, $secure)
  }
  $session = New-CimSession @connect
  $result = Invoke-CimMethod -CimSession $session -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = [string]$request.commandLine }
  if ($result.ReturnValue -ne 0) {
    throw "Remote process could not be started (Win32_Process returned $($result.ReturnValue))."
  }
  [Console]::Out.Write((ConvertTo-Json -InputObject @{ pid = [int]$result.ProcessId; status = 'started' } -Compress))
} catch {
  [Console]::Error.Write('Could not start the directory export on the remote workstation. Check Target access credentials, WMI permissions and the Windows Management Instrumentation firewall rules (DCOM).')
  exit 1
} finally {
  if ($null -ne $session) { Remove-CimSession $session -ErrorAction SilentlyContinue }
}
`.trim()

const ENCODED_WMI_SCRIPT = Buffer.from(WMI_PROCESS_SCRIPT, 'utf16le').toString('base64')

/**
 * Imports the directory (branches + devices) from another workstation by IP.
 *
 * The source database file is encrypted with a key that only the source
 * machine's OS keystore can unwrap, so the file itself is never copied.
 * Instead this service:
 *   1. checks SMB reachability and admin share access,
 *   2. locates the installed application on the source machine,
 *   3. launches its headless `--export-directory` mode over WMI, which writes
 *      a plain-JSON snapshot to C:\Windows\Temp on the source machine,
 *   4. reads the snapshot back over the admin share,
 *   5. merges it with the existing workbook-import merge rules, and
 *   6. deletes the remote snapshot.
 */
class DirectoryTransferService {
  constructor(options = {}) {
    this.database = options.database
    this.platform = options.platform || process.platform
    this.unc = options.unc || unc
    this.reach = options.reach || checkReachable
    this.smb = options.smb || new SmbSessionManager({ platform: this.platform })
    this.getCredentials = typeof options.getCredentials === 'function' ? options.getCredentials : () => null
    this.launch = options.launch || ((request, exec = execFile) => this.defaultLaunch(request, exec))
    this.pollIntervalMs = options.pollIntervalMs || 1500
    this.pollAttempts = options.pollAttempts || 40
    this.remoteTempDir = options.remoteTempDir || 'C:\\Windows\\Temp'
  }

  async importFromHost(host, actor = 'Admin') {
    const target = String(host || '').trim()
    if (!target) throw new Error('Enter the IP address or hostname of the source workstation')
    const credentials = this.getCredentials()
    const probe = await this.reach(target, { candidates: [target] }).catch(() => ({ status: 'offline', detail: 'Reachability probe failed' }))
    if (probe.status === 'offline') throw new Error(`${target} is not reachable over SMB — ${probe.detail || 'check the address and the network'}`)
    const address = probe.host || target

    return this.smb.withHost(address, credentials, async () => {
      const exe = await this.findRemoteApp(address)
      if (!exe) {
        throw new Error(`HyperFamily Branch Monitor was not found in Program Files on ${address} — the source workstation must run the same application (3.2.2 or newer).`)
      }
      const name = `hf-dir-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`
      const remoteFile = `${this.remoteTempDir}\\${name}`
      await this.launch({ host: address, credentials, commandLine: `"${exe}" --export-directory "${remoteFile}"` })
      const payload = await this.waitForExport(address, name)
      const summary = this.database.importDirectory(payload, actor)
      await fsp.unlink(this.unc(address, remoteFile)).catch(() => {})
      return { ...summary, host: address }
    })
  }

  /** Locate the installed application on the source machine via admin shares. */
  async findRemoteApp(address) {
    for (const candidate of INSTALL_CANDIDATES) {
      try {
        await fsp.stat(this.unc(address, candidate))
        return candidate
      } catch { /* keep looking */ }
    }
    return null
  }

  /** Wait for the headless export to appear on the admin share. */
  async waitForExport(address, name) {
    const remoteFile = this.unc(address, `${this.remoteTempDir}\\${name}`)
    for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
      let raw
      try {
        raw = await fsp.readFile(remoteFile, 'utf8')
      } catch (error) {
        if (error && error.code === 'ENOENT') { await delay(this.pollIntervalMs); continue }
        throw error
      }
      try {
        const payload = JSON.parse(raw)
        if (!payload || !Array.isArray(payload.branches) || !Array.isArray(payload.devices)) {
          throw new Error('The snapshot from the source workstation is not a valid directory export')
        }
        return payload
      } catch (error) {
        if (error instanceof SyntaxError) { await delay(this.pollIntervalMs); continue } // still being written
        throw error
      }
    }
    throw new Error(`The directory export from ${address} did not appear in time — make sure the application on that machine is running under the same administrator account.`)
  }

  defaultLaunch(request, exec) {
    return new Promise((resolve, reject) => {
      const child = exec('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', ENCODED_WMI_SCRIPT
      ], { timeout: 60000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message || '').trim()
          reject(new Error(detail || 'Could not start the directory export on the remote workstation.'))
          return
        }
        try {
          resolve(JSON.parse(String(stdout || '{}')))
        } catch {
          reject(new Error('Unexpected response from the remote workstation.'))
        }
      })
      try {
        child.stdin.end(JSON.stringify({
          host: request.host,
          username: request.credentials?.username || '',
          password: request.credentials?.password || '',
          commandLine: request.commandLine
        }))
      } catch { /* pipe already closed — surfaced by the callback */ }
    })
  }
}

module.exports = { DirectoryTransferService, unc, WMI_PROCESS_SCRIPT }
