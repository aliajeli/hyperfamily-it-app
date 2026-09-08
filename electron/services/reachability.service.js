const net = require('net')
const { pingHost } = require('./ping.service')

/**
 * "Can I actually work with this machine?" — answered by the port that the
 * work needs, not by ICMP.
 *
 * The previous implementation gated every version check and every deployment
 * behind an ICMP ping. That is the wrong question: the Windows Defender
 * Firewall profile applied to a domain workstation blocks "File and Printer
 * Sharing (Echo Request)" by default, so a perfectly healthy checkout that is
 * happily serving \\host\C$ on TCP 445 answers no ping at all. The app then
 * reported "Checkout unreachable" and refused to even try — which is exactly
 * the reported failure (st10007r02 failed in 2.3 s without one SMB packet).
 *
 * So: reachability is a TCP connect to 445 (SMB), the port that both the file
 * copy and the remote registry ride on. ICMP is still measured, but only to
 * show a latency number — it can never veto the operation.
 */

/** SMB. Everything this app does to a checkout goes through this port. */
const SMB_PORT = 445

/** Resolves `{ open, ms }` for one TCP port; never rejects. */
function probePort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = new net.Socket()
    let settled = false
    const done = (open, error) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ open, ms: Date.now() - startedAt, error: error || null })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false, 'timed out'))
    socket.once('error', (error) => done(false, error.code || error.message))
    socket.connect(port, host)
  })
}

/**
 * Decides whether `host` is usable, and why not when it is not.
 *
 * `status` is 'online' as soon as SMB answers. ICMP runs in parallel purely
 * for the latency badge, so a firewall that hides echo replies costs nothing.
 */
async function checkReachable(host, options = {}) {
  const port = options.port || SMB_PORT
  const timeoutMs = options.timeoutMs || 3000
  const probe = options.probePort || probePort
  const ping = options.ping || pingHost

  const [smb, icmp] = await Promise.all([
    probe(host, port, timeoutMs),
    // Best effort and short: purely cosmetic, never gates anything.
    ping(host, Math.min(1500, timeoutMs)).catch(() => ({ status: 'offline', ping_time: null }))
  ])

  if (smb.open) {
    return {
      status: 'online',
      // Prefer the true ICMP latency; fall back to how long the TCP handshake took.
      ping_time: icmp.ping_time ?? smb.ms,
      smb: true,
      icmp: icmp.status !== 'offline',
      detail: icmp.status === 'offline'
        ? `SMB (port ${port}) answered in ${smb.ms} ms; ICMP is filtered, which is normal on a firewalled domain`
        : `SMB (port ${port}) answered in ${smb.ms} ms`
    }
  }

  // SMB is shut. Distinguish "the machine is off" from "the machine is up but
  // file sharing is blocked", because the fix is completely different.
  const reachableByPing = icmp.status && icmp.status !== 'offline'
  return {
    status: 'offline',
    ping_time: icmp.ping_time ?? null,
    smb: false,
    icmp: Boolean(reachableByPing),
    detail: reachableByPing
      ? `${host} answers ping but port ${port} (file sharing) is closed — enable File and Printer Sharing on it`
      : `${host} did not answer on port ${port} (${smb.error || 'no route'}) and did not answer a ping — it looks powered off or off the network`
  }
}

module.exports = { checkReachable, probePort, SMB_PORT }
