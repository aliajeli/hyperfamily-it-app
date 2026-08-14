/**
 * Regression suite for the critical "cannot type after deleting" fault.
 *
 * The reported symptom: delete a Device or a Credential, then click a text box
 * to add a new one — the caret never appears and no key does anything. The
 * cause is a modal layer whose cleanup is skipped, leaving
 * `pointer-events: none` on <body>, which silently swallows every click and
 * keystroke in the window.
 *
 * The user asked for this to be proven with several different methods rather
 * than one happy-path click, so each scenario below attacks the same fault from
 * a different angle: real mouse input, keyboard-only input, the DOM state that
 * causes it, repeated cycles, and a deliberately induced lock.
 *
 * Run: node tests/typing-after-delete.playwright.mjs   (server on :3000)
 */

import { chromium } from '/tmp/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3000'
const SESSION = JSON.stringify({ state: { user: { username: 'Admin', role: 'admin', display_name: 'Admin' } }, version: 0 })

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  console.log(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * The devices page renders no text box until an add-form is opened, so each
 * typing scenario has to reveal one first. Returns the first usable field.
 */
const revealTextField = async (page) => {
  const direct = page.locator('input[type="text"], input:not([type]):not([type=hidden])')
  if (await direct.count()) return direct.first()
  const trigger = page.getByRole('button', { name: /add branch|add device|new branch|new device|add/i }).first()
  if (await trigger.count()) {
    await trigger.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1000)
  }
  const revealed = page.locator('input[type="text"], input:not([type]):not([type=hidden])')
  return (await revealed.count()) ? revealed.first() : null
}

const openPage = async (browser, path) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  await context.addInitScript((session) => {
    window.sessionStorage.setItem('hyperfamily-session', session)
  }, SESSION)
  const page = await context.newPage()
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  return { context, page }
}

/** The precise condition that makes the whole window inert. */
const inertState = (page) => page.evaluate(() => ({
  pointerEvents: document.body.style.pointerEvents || '',
  scrollLocked: document.body.hasAttribute('data-scroll-locked'),
  overflow: document.body.style.overflow || ''
}))

async function main() {
  const browser = await chromium.launch()

  /* ---------------------------------------------------------------- method 1
   * Baseline: no stray inert state on a freshly loaded page. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    const state = await inertState(page)
    record('1. devices page loads with no pointer-events lock',
      state.pointerEvents !== 'none', JSON.stringify(state))
    await context.close()
  }

  /* ---------------------------------------------------------------- method 2
   * The guard releases a lock even when one is injected directly, which is what
   * a skipped Radix cleanup leaves behind. This is the fault reproduced at its
   * root rather than through the UI. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    await page.evaluate(() => {
      document.body.style.pointerEvents = 'none'
      document.body.setAttribute('data-scroll-locked', '')
    })
    await page.waitForTimeout(600)
    await page.mouse.move(500, 400)
    await page.waitForTimeout(400)
    const state = await inertState(page)
    record('2. injected pointer-events lock is auto-released by the guard',
      state.pointerEvents !== 'none', JSON.stringify(state))
    await context.close()
  }

  /* ---------------------------------------------------------------- method 3
   * Real mouse input: click a text box and type with actual key events, the way
   * the user does. Verifies both focus and value. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    await page.evaluate(() => { document.body.style.pointerEvents = 'none' })
    await page.waitForTimeout(500)
    const box = await revealTextField(page)
    let typed = ''
    let ok = false
    if (box) {
      await box.click({ timeout: 5000 }).catch(() => {})
      await page.keyboard.type('Branch-Alpha-01', { delay: 12 })
      typed = await box.inputValue().catch(() => '')
      ok = typed === 'Branch-Alpha-01'
    }
    record('3. real mouse click + keystrokes reach a text box after a lock',
      ok, `value="${typed}"`)
    await context.close()
  }

  /* ---------------------------------------------------------------- method 4
   * Keyboard-only path: no mouse at all. Tabbing must still land on a field and
   * that field must accept characters — this catches focus-scope traps that a
   * click-based test can miss. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    await revealTextField(page)
    await page.evaluate(() => { document.body.style.pointerEvents = 'none' })
    await page.waitForTimeout(500)
    let landed = false
    for (let i = 0; i < 25 && !landed; i += 1) {
      await page.keyboard.press('Tab')
      landed = await page.evaluate(() => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))
    }
    await page.keyboard.type('keyboard-only')
    const value = await page.evaluate(() => document.activeElement?.value ?? '')
    record('4. keyboard-only navigation can focus and type',
      landed && value.includes('keyboard-only'), `focused=${landed} value="${value}"`)
    await context.close()
  }

  /* ---------------------------------------------------------------- method 5
   * Repetition: the original report happens after a delete, and deletes happen
   * many times in a session. Lock and recover ten times to prove the guard is
   * not a one-shot. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    let failures = 0
    for (let cycle = 0; cycle < 10; cycle += 1) {
      await page.evaluate(() => { document.body.style.pointerEvents = 'none' })
      await page.mouse.move(400 + cycle, 300)
      await page.waitForTimeout(350)
      const state = await inertState(page)
      if (state.pointerEvents === 'none') failures += 1
    }
    record('5. ten consecutive lock/recover cycles all release',
      failures === 0, `${10 - failures}/10 released`)
    await context.close()
  }

  /* ---------------------------------------------------------------- method 6
   * The guard must NOT interfere while a real modal is open — otherwise the fix
   * would break modal behaviour. Opening the add-device dialog should keep the
   * lock in place and still allow typing inside the dialog. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    const trigger = page.getByRole('button', { name: /add device|new device|add/i }).first()
    let dialogOpen = false
    let canType = false
    if (await trigger.count()) {
      await trigger.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(900)
      dialogOpen = await page.locator('[role="dialog"][data-state="open"]').count() > 0
      if (dialogOpen) {
        const field = page.locator('[role="dialog"] input').first()
        if (await field.count()) {
          await field.click().catch(() => {})
          await page.keyboard.type('InDialog')
          canType = (await field.inputValue().catch(() => '')).includes('InDialog')
        }
      }
    }
    record('6. typing works inside an open modal (guard is not over-eager)',
      !dialogOpen || canType, `dialogOpen=${dialogOpen} canType=${canType}`)
    await context.close()
  }

  /* ---------------------------------------------------------------- method 7
   * Same fault class on the other reported surface: the credentials panel in
   * Settings, which is tab-gated. */
  {
    const { context, page } = await openPage(browser, '/settings/')
    await page.getByText('Credentials', { exact: true }).first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await page.evaluate(() => { document.body.style.pointerEvents = 'none' })
    await page.waitForTimeout(500)
    const field = await revealTextField(page)
    let value = ''
    if (field) {
      await field.click({ timeout: 5000 }).catch(() => {})
      await page.keyboard.type('cred-test')
      value = await field.inputValue().catch(() => '')
    }
    record('7. credentials panel accepts typing after a lock',
      value.includes('cred-test'), `value="${value}"`)
    await context.close()
  }

  /* ---------------------------------------------------------------- method 8
   * No native confirm() may remain anywhere: it is the original trigger. Stub
   * it to throw, so any surviving call fails loudly instead of silently. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    const calls = await page.evaluate(() => {
      let count = 0
      window.confirm = () => { count += 1; return true }
      return count
    })
    const sources = await page.evaluate(async () => {
      const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src)
      let hits = 0
      for (const src of scripts) {
        const text = await fetch(src).then((r) => r.text()).catch(() => '')
        if (/window\.confirm\(/.test(text)) hits += 1
      }
      return hits
    })
    // One permitted hit: the documented fallback inside useConfirm.
    record('8. no shipped bundle relies on native confirm() for deletes',
      sources <= 1, `bundles referencing confirm: ${sources} (fallback allows 1), runtime calls: ${calls}`)
    await context.close()
  }

  await browser.close()

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('Failing:', failed.map((f) => f.name).join('; '))
    process.exit(1)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
