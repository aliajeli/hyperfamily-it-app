const { execFile } = require('child_process')

// Hard cap on simultaneous ping.exe processes. Probing in bounded waves keeps
// CPU and process churn flat no matter how many devices are monitored.
const PING_CONCURRENCY = 12
const DEFAULT_INTERVAL_SECONDS = 5

function pingHost(host, timeoutMs = 1000) {
  const isWindows = process.platform === 'win32'
  const args = isWindows
    ? ['-n', '1', '-w', String(timeoutMs), host]
    : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host]
  return new Promise((resolve) => {
    execFile(
      'ping',
      args,
      { timeout: timeoutMs + 750, windowsHide: true, encoding: 'utf8' },
      (error, stdout = '') => {
        if (error) return resolve({ status: 'offline', ping_time: null })
        const match = stdout.match(/(?:time|zeit|temps|tiempo)[=<]\s*(\d+(?:\.\d+)?)\s*ms/i)
        const lessThanOne = /(?:time|zeit|temps|tiempo)<\s*1\s*ms/i.test(stdout)
        const pingTime = lessThanOne ? 1 : match ? Math.max(1, Math.round(Number(match[1]))) : 1
        resolve({ status: pingTime <= 300 ? 'online' : 'warning', ping_time: pingTime })
      }
    )
  })
}

class PingMonitor {
  constructor(database, sendEvent) {
    this.database = database
    this.sendEvent = sendEvent
    this.timer = null
    this.running = false
    // Last emitted result fingerprint. The renderer only needs a snapshot when
    // something it displays actually changed — re-sending identical data every
    // tick was a major source of UI re-renders.
    this.lastFingerprint = ''
  }

  /**
   * Reaches a device.
   *
   * Global (FortiClient) mode routes at the operating-system level, so an
   * ordinary ICMP ping already travels through the tunnel — no application
   * -level detour is needed. The former proxy-aware branch was removed with
   * the in-app tunnel it depended on.
   */
  async probe(device) {
    return pingHost(device.ip)
  }

  start() {
    if (this.running) return
    this.running = true
    this.schedule(250)
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  schedule(delay) {
    if (!this.running) return
    this.timer = setTimeout(() => this.tick(), delay)
  }

  /** Probes every device in waves of PING_CONCURRENCY instead of all at once. */
  async probeAll(devices) {
    const results = new Array(devices.length)
    for (let start = 0; start < devices.length; start += PING_CONCURRENCY) {
      const wave = devices.slice(start, start + PING_CONCURRENCY)
      const settled = await Promise.allSettled(wave.map((device) => this.probe(device)))
      settled.forEach((item, offset) => {
        const device = wave[offset]
        results[start + offset] =
          item.status === 'fulfilled'
            ? { device_id: device.id, ...item.value }
            : { device_id: device.id, status: 'offline', ping_time: null }
      })
    }
    return results
  }

  async tick() {
    try {
      const devices = this.database.listMonitoredDevices()
      if (devices.length) {
        const results = await this.probeAll(devices)
        this.database.recordPingBatch(results)
        // Emit only when a displayed value changed; the database keeps the
        // full history either way.
        const fingerprint = results
          .map((item) => `${item.device_id}:${item.status}:${item.ping_time}`)
          .join('|')
        if (fingerprint !== this.lastFingerprint) {
          this.lastFingerprint = fingerprint
          const settings = this.database.getSettings()
          this.sendEvent(
            'monitor:update',
            this.database.getMonitorSnapshot(settings.ping_history_count || 30)
          )
        }
      } else {
        // No monitored devices: still refresh so removals reach the UI once.
        if (this.lastFingerprint !== 'empty') {
          this.lastFingerprint = 'empty'
          const settings = this.database.getSettings()
          this.sendEvent(
            'monitor:update',
            this.database.getMonitorSnapshot(settings.ping_history_count || 30)
          )
        }
      }
      const settings = this.database.getSettings()
      this.schedule(Math.max(1, Number(settings.ping_interval) || DEFAULT_INTERVAL_SECONDS) * 1000)
    } catch (error) {
      this.database.audit('System', 'PING_SERVICE_ERROR', 'Monitoring', error.message)
      this.schedule(5000)
    }
  }
}

module.exports = { PingMonitor, pingHost, PING_CONCURRENCY }
