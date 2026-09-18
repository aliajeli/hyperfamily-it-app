/**
 * Companion regression sweep (v3.9.1).
 *
 * Boots the REAL companion server (dependency-injected, no Electron) against
 * the REAL static export in out/ and walks every page through the injected
 * bridge, exactly like the phone does. Pins down the class of bug where an
 * "unavailable in the companion" rejection escaped as an unhandled promise
 * and Next's error boundary replaced the page with
 * "Application error: a client-side exception has occurred".
 *
 * Run after a build:  node tests/companion-pages.playwright.mjs
 */
import { createRequire } from 'module'
import path from 'node:path'
const require = createRequire(path.join(process.cwd(), 'package.json'))
const { createCompanionServer } = require('./electron/services/companion-server.service.js')
const { chromium } = require('playwright')

const notes = []
const fakeDb = {
  settings: { ping_history_count: 30, companion_server: JSON.stringify({ token: 'sweep-token', port: 0 }) },
  getSettings() {
    return { ...this.settings }
  },
  saveSettings: (p) => p,
  authenticate: (u) => ({ id: 1, username: u }),
  getMonitorSnapshot: () => ({ branches: [], devices: [], generated_at: 'x' }),
  listBranches: () => [],
  listDevices: () => [
    {
      id: 9,
      name: 'CO-01',
      device_type: 'Checkout',
      branch_name: 'Main',
      branch_code: 'M1',
      ip: '172.18.168.10',
      status: 'online',
      model: 'POS-X'
    }
  ],
  saveBranch: (d) => d,
  saveDevice: (d) => d,
  deleteBranch: (id) => ({ deleted: id }),
  deleteDevice: (id) => ({ deleted: id }),
  listNotes: () => notes,
  saveNote: (p) => {
    notes.push({ id: 1, ...p })
    return p
  },
  deleteNote: (id) => ({ deleted: id }),
  listSnippets: () => [],
  saveSnippet: (p) => p,
  deleteSnippet: (id) => ({ deleted: id }),
  listInventory: () => [],
  listCredentials: () => [],
  getCredentialMap: () => ({}),
  listDeviceCredentialOverview: () => []
}

const server = createCompanionServer({
  database: fakeDb,
  exportRoot: path.join(process.cwd(), 'out'),
  appVersion: '0.0.0-sweep'
})
const state = await server.start()
const PORT = state.port

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 420, height: 860 } })
// The sweep must exercise the real shell, not the login screen: seed the
// persisted session exactly like a signed-in user's browser would.
const seedSession = () => {
  sessionStorage.setItem(
    'hyperfamily-session',
    JSON.stringify({ state: { user: { username: 'sweep', role: 'Admin' } }, version: 0 })
  )
}
await context.addInitScript(seedSession)
const page = await context.newPage()
let failures = 0
page.on('pageerror', (e) => {
  failures++
  console.log('PAGEERROR:', String(e.message).slice(0, 160))
})

try {
  await page.goto(`http://127.0.0.1:${PORT}/?companion=sweep-token`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const targets = [
    'dashboard',
    'devices',
    'inventory',
    'notes',
    'terminal',
    'store-update',
    'settings',
    'about'
  ]
  for (const route of targets) {
    const link = page.locator(`a[href*="${route}"]`).first()
    try {
      await link.click({ timeout: 5000 })
    } catch {
      await page.goto(`http://127.0.0.1:${PORT}/${route}/`, { waitUntil: 'networkidle' })
    }
    await page.waitForTimeout(1800)
    const broken = (await page.content()).includes('Application error')
    console.log(`${route}: ${broken ? 'APPLICATION ERROR' : 'ok'}`)
    if (broken) failures++
  }

  // Phone pass (v3.10.0): one-row bottom bar, cards instead of the wide table.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(seedSession)
  const mobile = await phone.newPage()
  mobile.on('pageerror', (e) => {
    failures++
    console.log('MOBILE PAGEERROR:', String(e.message).slice(0, 160))
  })
  await mobile.goto(`http://127.0.0.1:${PORT}/?companion=sweep-token`, { waitUntil: 'networkidle' })
  await mobile.waitForTimeout(1200)
  const nav = mobile.locator('nav[aria-label="Mobile navigation"]')
  const navMetrics = await nav.evaluate((el) => ({
    cells: el.children.length,
    height: el.getBoundingClientRect().height
  }))
  console.log(`bottom nav: ${navMetrics.cells} cells, ${Math.round(navMetrics.height)}px`)
  if (navMetrics.cells !== 5 || navMetrics.height > 90) failures++
  await mobile.goto(`http://127.0.0.1:${PORT}/inventory/`, { waitUntil: 'networkidle' })
  await mobile.waitForTimeout(1500)
  const inventoryLayout = await mobile.evaluate(() => {
    const table = document.querySelector('table')
    const cards = document.getElementsByClassName('md:hidden')[0]
    return {
      tableHidden: !table || getComputedStyle(table.closest('div')).display === 'none',
      cardsVisible: Boolean(cards) && getComputedStyle(cards).display !== 'none'
    }
  })
  console.log('inventory mobile:', JSON.stringify(inventoryLayout))
  if (!inventoryLayout.tableHidden || !inventoryLayout.cardsVisible) failures++
  if ((await mobile.content()).includes('Application error')) failures++
  await phone.close()
} finally {
  await browser.close()
  await server.stop()
}

if (failures) {
  console.error(`FAIL: ${failures} companion page problem(s)`)
  process.exit(1)
}
console.log(
  'PASS: every companion page renders without client-side exceptions; phone layout is one-row nav + card lists'
)
