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
import { chromium } from '@playwright/test'

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

// CI-hardened flags: the container's /dev/shm and software GL crash a shared
// renderer while viewports change mid-run, which is a harness problem, not an
// application fault — a fresh browser per viewport keeps the runs independent.
const LAUNCH_ARGS = { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--js-flags=--max-old-space-size=320', '--renderer-process-limit=1', '--disable-background-networking', '--disable-features=Translate,BackForwardCache,MediaRouter'] }

// Software rasterizers (SwiftShader/llvmpipe) die above a ~4096px raster:
// 2560x1440 at the app's 1.75x zoom needs 4480px and reliably kills the
// renderer. Skip exactly those viewports on such machines, and say so.
const detectBrowser = await chromium.launch(LAUNCH_ARGS)
const probePage = await (await detectBrowser.newContext({ viewport: { width: 200, height: 200 } })).newPage()
await probePage.goto(BASE + '/login/', { waitUntil: 'domcontentloaded' })
const rasterizer = await probePage.evaluate(() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return 'none'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    // The masked RENDERER is always generic; the unmasked string names the
    // real driver (e.g. SwiftShader in headless containers).
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  } catch {
    return 'none'
  }
})
const softwareRasterizer = /swiftshader|llvmpipe|software|angle \(/i.test(rasterizer)
await detectBrowser.close()

let checks = 0
let failures = 0

for (const viewport of VIEWPORTS) {
  const zoom = Math.min(2.5, Math.max(0.5, Math.round(Math.min(viewport.width / 1366, viewport.height / 768) * 4) / 4))
  if (softwareRasterizer && viewport.width * zoom > 4000) {
    console.log(`- skipped ${viewport.name}: software rasterizer (${rasterizer}) cannot paint a ${Math.round(viewport.width * zoom)}px canvas`)
    continue
  }
  for (const path of PAGES) {
    // Memory-constrained containers leak renderer state across SPA
    // navigations (view-transition snapshots); a dedicated browser per page
    // keeps every measurement independent and the suite deterministic.
    const browser = await chromium.launch(LAUNCH_ARGS)
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    await context.addInitScript((session) => {
      window.sessionStorage.setItem('hyperfamily-session', session)
    }, SESSION)
    const page = await context.newPage()
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
    await browser.close()
  }
}

console.log(`\n${checks - failures}/${checks} page/viewport combinations have no horizontal scroll`)
if (failures) {
  console.log(`FAIL: ${failures} combination(s) scroll sideways`)
  process.exit(1)
}
console.log('PASS')
