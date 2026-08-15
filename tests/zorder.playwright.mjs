/**
 * Item 8 regression suite: nothing may ever render above the VPN or
 * Notification panels.
 *
 * The check is done the way a user perceives it — by asking the browser which
 * element actually receives the pixel (elementFromPoint) at many points across
 * the open panel, while the interface is put into the states that used to
 * break it (hovered branch cards, hovered device cards, scrolled content).
 */
import { chromium } from '/tmp/node_modules/playwright/index.mjs'

const BASE = 'http://localhost:3000'
const SESSION = '{"state":{"user":{"username":"Admin","role":"admin","display_name":"Admin"}},"version":0}'
const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

async function openPage(browser, path) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.addInitScript((s) => sessionStorage.setItem('hyperfamily-session', s), SESSION)
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1800)
  return page
}

/** Samples a grid of points over `selector` and reports any point where the
 *  topmost painted element is not the panel or one of its descendants. */
async function coverageBreaches(page, selector) {
  return page.evaluate((sel) => {
    const panel = document.querySelector(sel)
    if (!panel) return { missing: true }
    const r = panel.getBoundingClientRect()
    const breaches = []
    const cols = 7, rows = 9
    for (let i = 1; i < cols; i++) {
      for (let j = 1; j < rows; j++) {
        const x = r.left + (r.width * i) / cols
        const y = r.top + (r.height * j) / rows
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
        const top = document.elementFromPoint(x, y)
        if (!top) continue
        if (!panel.contains(top) && top !== panel) {
          breaches.push({ x: Math.round(x), y: Math.round(y), tag: top.tagName, cls: String(top.className).slice(0, 70) })
        }
      }
    }
    return { missing: false, breaches, rect: { w: Math.round(r.width), h: Math.round(r.height) } }
  }, selector)
}

const run = async () => {
  const browser = await chromium.launch()

  // ---------- Notification panel ----------
  {
    const page = await openPage(browser, '/devices/')
    const bell = page.locator('button[aria-label*="otification"], button:has(svg.lucide-bell)').first()
    await bell.click({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(900)
    const visible = await page.locator('.notification-popup').isVisible().catch(() => false)
    record('Notification panel opens', visible)

    if (visible) {
      let res = await coverageBreaches(page, '.notification-popup')
      record('Notification panel: nothing covers it at rest', !res.missing && res.breaches.length === 0,
        res.missing ? 'panel not found' : `${res.breaches.length} breach(es) ${JSON.stringify(res.breaches.slice(0, 3))}`)

      // Hover every branch card behind the panel — the reported failure.
      const cards = page.locator('.directory-branch-card')
      const n = Math.min(await cards.count(), 6)
      let worst = []
      for (let i = 0; i < n; i++) {
        await cards.nth(i).hover({ force: true }).catch(() => {})
        await page.waitForTimeout(220)
        const r = await coverageBreaches(page, '.notification-popup')
        if (!r.missing && r.breaches.length) worst = worst.concat(r.breaches)
      }
      record(`Notification panel: survives hovering ${n} branch card(s)`, worst.length === 0,
        worst.length ? JSON.stringify(worst.slice(0, 3)) : 'no element ever painted over the panel')

      // Hover device cards too.
      const dev = page.locator('.directory-device-card, .device-card')
      const dn = Math.min(await dev.count(), 5)
      let devBreach = []
      for (let i = 0; i < dn; i++) {
        await dev.nth(i).hover({ force: true }).catch(() => {})
        await page.waitForTimeout(200)
        const r = await coverageBreaches(page, '.notification-popup')
        if (!r.missing && r.breaches.length) devBreach = devBreach.concat(r.breaches)
      }
      record(`Notification panel: survives hovering ${dn} device card(s)`, devBreach.length === 0,
        devBreach.length ? JSON.stringify(devBreach.slice(0, 3)) : 'clean')

      // Computed stacking sanity.
      const z = await page.evaluate(() => {
        const p = document.querySelector('.notification-popup')
        const h = document.querySelector('.app-header')
        return { panel: getComputedStyle(p).zIndex, header: h ? getComputedStyle(h).zIndex : null }
      })
      record('Notification panel z-index is the top layer', Number(z.panel) >= 90, `panel=${z.panel} header=${z.header}`)
    }
    await page.close()
  }

  // ---------- VPN panel ----------
  {
    const page = await openPage(browser, '/devices/')
    const vpn = page.locator('button[aria-label*="VPN"], button:has-text("VPN")').first()
    await vpn.click({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(900)
    const visible = await page.locator('.vpn-popup').isVisible().catch(() => false)
    record('VPN panel opens', visible)

    if (visible) {
      const rest = await coverageBreaches(page, '.vpn-popup')
      record('VPN panel: nothing covers it at rest', !rest.missing && rest.breaches.length === 0,
        rest.missing ? 'panel not found' : JSON.stringify(rest.breaches.slice(0, 3)))

      const cards = page.locator('.directory-branch-card')
      const n = Math.min(await cards.count(), 6)
      let worst = []
      for (let i = 0; i < n; i++) {
        await cards.nth(i).hover({ force: true }).catch(() => {})
        await page.waitForTimeout(220)
        const r = await coverageBreaches(page, '.vpn-popup')
        if (!r.missing && r.breaches.length) worst = worst.concat(r.breaches)
      }
      record(`VPN panel: survives hovering ${n} branch card(s)`, worst.length === 0,
        worst.length ? JSON.stringify(worst.slice(0, 3)) : 'no element ever painted over the panel')

      const z = await page.evaluate(() => getComputedStyle(document.querySelector('.vpn-popup')).zIndex)
      record('VPN panel z-index is the top layer', Number(z) >= 90, `z=${z}`)
    }
    await page.close()
  }

  await browser.close()

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) { console.log('FAILURES:'); failed.forEach((f) => console.log(' - ' + f.name + ' :: ' + f.detail)); process.exitCode = 1 }
}

run().catch((e) => { console.error(e); process.exitCode = 1 })
