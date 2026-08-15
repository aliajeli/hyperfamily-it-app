const { execFile } = require('child_process')

function pingHost(host, timeoutMs = 1000) {
  const isWindows = process.platform === 'win32'
  const args = isWindows ? ['-n', '1', '-w', String(timeoutMs), host] : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host]
  return new Promise((resolve) => {
    execFile('ping', args, { timeout: timeoutMs + 750, windowsHide: true, encoding: 'utf8' }, (error, stdout = '') => {
      if (error) return resolve({ status: 'offline', ping_time: null })
      const match = stdout.match(/(?:time|zeit|temps|tiempo)[=<]\s*(\d+(?:\.\d+)?)\s*ms/i)
      const lessThanOne = /(?:time|zeit|temps|tiempo)<\s*1\s*ms/i.test(stdout)
      const pingTime = lessThanOne ? 1 : match ? Math.max(1, Math.round(Number(match[1]))) : 1
      resolve({ status: pingTime <= 300 ? 'online' : 'warning', ping_time: pingTime })
    })
  })
}

class PingMonitor {
  constructor(database, sendEvent) {
    this.database = database
    this.sendEvent = sendEvent
    this.timer = null
    this.running = false
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

  async tick() {
    try {
      const devices = this.database.listMonitoredDevices()
      if (devices.length) {
        const settled = await Promise.allSettled(devices.map(async (device) => ({ device_id: device.id, ...(await this.probe(device)) })))
        const results = settled.map((item, index) => item.status === 'fulfilled' ? item.value : { device_id: devices[index].id, status: 'offline', ping_time: null })
        this.database.recordPingBatch(results)
      }
      const settings = this.database.getSettings()
      this.sendEvent('monitor:update', this.database.getMonitorSnapshot(settings.ping_history_count || 30))
      this.schedule(Math.max(1, Number(settings.ping_interval) || 3) * 1000)
    } catch (error) {
      this.database.audit('System', 'PING_SERVICE_ERROR', 'Monitoring', error.message)
      this.schedule(5000)
    }
  }
}

module.exports = { PingMonitor, pingHost }
