/**
 * Responsiveness guard: NO PAGE MAY EVER SCROLL HORIZONTALLY.
 *
 * The application is deployed on 1366×768 branch machines, so that is the
 * primary viewport, but it must also hold together on smaller and much larger
 * displays. A sideways scrollbar is treated as a hard failure, not a cosmetic
 * one: it hides content behind the right edge on the exact screens the app is
 * used on.
 *
 * Two independent checks run on every page/viewport pair, because they catch
 * different faults:
 *
 *   A. Document overflow — `scrollWidth > clientWidth` on <html> and <body>.
 *      This is the symptom the user actually sees.
 *   B. The offending element — every element whose right edge lies beyond the
 *      viewport is reported by name. Without this a failure says "something is
 *      too wide" and the cause has to be hunted manually.
 *
 * Elements that are positioned outside the flow on purpose (menus, dialogs,
 * toasts, popovers) are excluded from B: they are portalled overlays and are
 * not part of the document's layout width.
 *
 * Usage: build, serve out/ on :3000, then `node tests/responsive.playwright.mjs`.
 */
import { chromium } from '/tmp/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3000'

const VIEWPORTS = [
  { name: '1366x768 (primary target)', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '1024x768 (rail collapses)', width: 1024, height: 768 },
  { name: '820x1180 (tablet)', width: 820, height: 1180 }
]

const PAGES = [
  '/dashboard/',
  '/devices/',
  '/inventory/',
  '/notes/',
  '/settings/',
  '/about/',
  '/terminal/'
]

const SESSION = JSON.stringify({
  state: { user: { username: 'Admin', role: 'admin', display_name: 'Admin' } },
  version: 0
})

/** Names the elements that stick out past the right edge. */
async function overflowReport(page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth
    const IGNORE = [
      '[role="dialog"]', '[role="alertdialog"]', '[role="menu"]', '[role="tooltip"]',
      '[role="listbox"]', '[data-radix-popper-content-wrapper]', '[data-sonner-toaster]',
      '.notification-popup', '.vpn-popup'
    ].join(',')

    // An element that overhangs the viewport is harmless when an ancestor
    // clips or scrolls it: a decorative blur inside `overflow-hidden`, or a
    // card inside a deliberate `overflow-x-auto` strip, is contained by
    // design. Only overhang that propagates all the way to <body> can widen
    // the document, so walk up and discard anything already contained.
    const isContained = (element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX
        if (overflowX !== 'visible') return true
      }
      return false
    }

    const offenders = []
    for (const element of document.querySelectorAll('body *')) {
      if (element.closest(IGNORE)) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      // Fixed decorations are painted, not laid out; they cannot widen the page.
      if (style.position === 'fixed') continue
      if (isContained(element)) continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      // 1px of tolerance absorbs sub-pixel rounding.
      if (rect.right > docWidth + 1) {
        offenders.push({
          tag: element.tagName.toLowerCase(),
          cls: (element.getAttribute('class') || '').slice(0, 80),
          right: Math.round(rect.right),
          overhang: Math.round(rect.right - docWidth)
        })
      }
    }
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: docWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      // Deepest offenders only: a wide child makes every ancestor look wide.
      offenders: offenders.filter((o) => o.overhang > 1).slice(0, 6)
    }
  })
}

const browser = await chromium.launch()
const context = await browser.newContext()
await context.addInitScript((session) => {
  window.sessionStorage.setItem('hyperfamily-session', session)
}, SESSION)

let checks = 0
let failures = 0

for (const viewport of VIEWPORTS) {
  const page = await context.newPage()
  await page.setViewportSize({ width: viewport.width, height: viewport.height })

  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
    // Let layout, fonts and animations settle before measuring.
    await page.waitForTimeout(700)

    const report = await overflowReport(page)
    checks += 1

    const scrolls =
      report.docScrollWidth > report.docClientWidth + 1 ||
      report.bodyScrollWidth > report.bodyClientWidth + 1

    if (scrolls || report.offenders.length) {
      failures += 1
      console.log(`✖ ${viewport.name}  ${path}`)
      console.log(`   html ${report.docScrollWidth}/${report.docClientWidth}` +
        `  body ${report.bodyScrollWidth}/${report.bodyClientWidth}`)
      for (const offender of report.offenders) {
        console.log(`   overhang +${offender.overhang}px  <${offender.tag} class="${offender.cls}">`)
      }
    } else {
      console.log(`✔ ${viewport.name}  ${path}`)
    }
  }
  await page.close()
}

await browser.close()

console.log(`\n${checks - failures}/${checks} page/viewport combinations have no horizontal scroll`)
if (failures) {
  console.log(`FAIL: ${failures} combination(s) scroll sideways`)
  process.exit(1)
}
console.log('PASS')
