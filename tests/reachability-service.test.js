const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const { checkReachable, probePort } = require('../electron/services/reachability.service')

/**
 * The bug these guard: gating the app on ICMP. A domain workstation running
 * the default Windows firewall drops echo requests while happily serving SMB,
 * so "did not answer the ping" was being reported for healthy checkouts.
 */

const noPing = async () => ({ status: 'offline', ping_time: null })
const goodPing = async () => ({ status: 'online', ping_time: 5 })

test('a host that serves SMB is online even when ICMP is filtered', async () => {
  const result = await checkReachable('st10007r02', {
    probePort: async () => ({ open: true, ms: 4 }),
    ping: noPing
  })
  assert.equal(result.status, 'online')
  assert.equal(result.smb, true)
  assert.equal(result.icmp, false)
  assert.match(result.detail, /ICMP is filtered/)
  // With no ICMP reply the handshake time stands in, so the UI still has a number.
  assert.equal(result.ping_time, 4)
})

test('a normal host reports the true ICMP latency', async () => {
  const result = await checkReachable('CO-01', { probePort: async () => ({ open: true, ms: 40 }), ping: goodPing })
  assert.equal(result.status, 'online')
  assert.equal(result.ping_time, 5)
  assert.equal(result.icmp, true)
})

test('ping answering but SMB closed is offline, and says why', async () => {
  const result = await checkReachable('CO-02', {
    probePort: async () => ({ open: false, ms: 3000, error: 'timed out' }),
    ping: goodPing
  })
  assert.equal(result.status, 'offline')
  assert.equal(result.icmp, true)
  assert.match(result.detail, /file sharing.*closed|closed.*file sharing/i)
})

test('nothing answering at all is reported as powered off', async () => {
  const result = await checkReachable('CO-03', {
    probePort: async () => ({ open: false, ms: 3000, error: 'EHOSTUNREACH' }),
    ping: noPing
  })
  assert.equal(result.status, 'offline')
  assert.match(result.detail, /powered off/)
})

test('a throwing ping never breaks the verdict', async () => {
  const result = await checkReachable('CO-04', {
    probePort: async () => ({ open: true, ms: 7 }),
    ping: async () => { throw new Error('ping.exe missing') }
  })
  assert.equal(result.status, 'online')
})

test('probePort detects an open port and a closed one', async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const open = await probePort('127.0.0.1', port, 2000)
  assert.equal(open.open, true)
  await new Promise((resolve) => server.close(resolve))

  const closed = await probePort('127.0.0.1', port, 2000)
  assert.equal(closed.open, false)
  assert.ok(closed.error)
})

test('probePort gives up at the deadline instead of hanging', async () => {
  // 203.0.113.0/24 is TEST-NET-3: routable-looking but black-holed.
  const started = Date.now()
  const result = await probePort('203.0.113.1', 445, 400)
  assert.equal(result.open, false)
  assert.ok(Date.now() - started < 3000, 'must respect its own timeout')
})
