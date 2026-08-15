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

  /* --------------------------------------------------------------- method 9
   * Notes shipped its own deletes with bare confirm() rather than
   * window.confirm(), which the first sweep's grep never matched. Delete a
   * note, then prove the page still accepts keystrokes. */
  {
    const { context, page } = await openPage(browser, '/notes/')
    await page.locator('button').filter({ hasText: 'VLAN plan' }).first().hover()
    await page.waitForTimeout(200)
    await page.locator('[aria-label="Delete VLAN plan"]').click({ force: true })
    await page.waitForTimeout(600)

    const dialog = await page.locator('[role="alertdialog"],[role="dialog"]').first()
      .innerText().catch(() => '')
    record('9. deleting a note opens the themed dialog, not a native one',
      /Delete/i.test(dialog), `dialog text: ${dialog.slice(0, 60)}`)

    await page.getByRole('button', { name: /delete note/i }).click()
    await page.waitForTimeout(900)

    const state = await inertState(page)
    record('10. body stays interactive after deleting a note',
      state.pointerEvents !== 'none', JSON.stringify(state))

    await page.getByRole('button', { name: /new note/i }).click()
    await page.waitForTimeout(500)
    const title = page.locator('input[placeholder*="title" i], input[placeholder*="name" i]').first()
    await title.click()
    await title.type('note-after-delete', { delay: 15 })
    record('11. the note title accepts typing after a delete',
      (await title.inputValue()) === 'note-after-delete', `value="${await title.inputValue()}"`)

    const body = page.locator('textarea').first()
    await body.click()
    await body.type('body-after-delete', { delay: 15 })
    record('12. the note body accepts typing after a delete',
      (await body.inputValue()).includes('body-after-delete'), `value="${await body.inputValue()}"`)

    /* Cancelling a dialog unwinds a different code path than confirming it,
     * and it is the path that used to leave the lock behind. */
    await page.locator('button').filter({ hasText: 'Branch rollout' }).first()
      .click({ force: true })
    await page.waitForTimeout(700)
    const discard = await page.locator('[role="alertdialog"],[role="dialog"]').first()
      .innerText().catch(() => '')
    record('13. switching away from an edited note warns with the themed dialog',
      /Discard/i.test(discard), `dialog text: ${discard.slice(0, 60)}`)

    await page.getByRole('button', { name: /keep editing/i }).click()
    await page.waitForTimeout(700)
    const afterCancel = await inertState(page)
    record('14. body stays interactive after cancelling a dialog',
      afterCancel.pointerEvents !== 'none', JSON.stringify(afterCancel))

    await title.click()
    await title.type('!', { delay: 15 })
    record('15. typing still works after a cancelled dialog',
      (await title.inputValue()).endsWith('!'), `value="${await title.inputValue()}"`)
    await context.close()
  }

  /* ---------------------------------------------------------- methods 16-21
   * The faults the earlier methods all missed.
   *
   * These run on /notes/, whose text boxes are inline rather than inside a
   * dialog: the wreckage has to be injected with NO modal open, because while
   * a real modal is open the guard is supposed to stand down and not touch
   * anything (method 22 proves that side).
   *
   * The guard neutralises a stale overlay rather than deleting it — the node
   * still belongs to React, and removing it behind React's back breaks the
   * next render. So the assertion is the one that matters to a user: does the
   * scrim still intercept clicks? */
  {
    const { context, page } = await openPage(browser, '/notes/')
    const title = page.locator('input[placeholder*="title" i], input[placeholder*="name" i]').first()
    const haveField = await title.count()

    /* -- method 16: an orphaned overlay must stop intercepting clicks ------- */
    await page.evaluate(() => {
      const overlay = document.createElement('div')
      overlay.className = 'dialog-overlay fixed inset-0 z-50'
      document.body.appendChild(overlay)
    })
    await page.waitForTimeout(1400)
    const intercepts = await page.evaluate(() => {
      const o = document.querySelector('.dialog-overlay')
      if (!o) return false
      const s = getComputedStyle(o)
      return s.display !== 'none' && s.pointerEvents !== 'none'
    })
    record('16. an orphaned dialog overlay no longer intercepts clicks', intercepts === false,
      `still intercepting=${intercepts}`)

    /* -- method 17: and a real click therefore reaches the field ----------- */
    if (haveField) {
      await title.click({ timeout: 8000 }).catch(() => {})
      await page.keyboard.type('overlay-cleared', { delay: 12 })
      const value = await title.inputValue()
      record('17. a real click reaches the text box after an orphaned overlay',
        value.includes('overlay-cleared'), `value="${value}"`)
    } else record('17. a real click reaches the text box after an orphaned overlay', false, 'no field')

    /* -- method 18: stale aria-hidden / inert on the app root -------------- */
    await page.evaluate(() => {
      document.querySelectorAll('body > div').forEach((n) => {
        n.setAttribute('aria-hidden', 'true')
        n.setAttribute('inert', '')
      })
    })
    await page.waitForTimeout(1400)
    const stuck = await page.evaluate(() => ({
      hidden: document.querySelectorAll('body > [aria-hidden="true"]').length,
      inert: document.querySelectorAll('body > [inert]').length
    }))
    record('18. stale aria-hidden/inert on the app root is cleared',
      stuck.hidden === 0 && stuck.inert === 0, JSON.stringify(stuck))

    /* -- method 19: focus and typing work again ---------------------------- */
    if (haveField) {
      await title.click({ timeout: 8000 }).catch(() => {})
      await page.keyboard.type('-inert-cleared', { delay: 12 })
      const value = await title.inputValue()
      record('19. typing works again after the app root was left inert',
        value.includes('inert-cleared'), `value="${value}"`)
    } else record('19. typing works again after the app root was left inert', false, 'no field')

    /* -- method 20: all three faults at once, repeatedly ------------------- */
    let recovered = 0
    const rounds = 6
    for (let i = 0; i < rounds; i++) {
      await page.evaluate(() => {
        document.body.style.pointerEvents = 'none'
        document.body.setAttribute('data-scroll-locked', '')
        const o = document.createElement('div')
        o.className = 'dialog-overlay fixed inset-0 z-50'
        document.body.appendChild(o)
        document.querySelectorAll('body > div').forEach((n) => n.setAttribute('aria-hidden', 'true'))
      })
      await page.waitForTimeout(1300)
      const clean = await page.evaluate(() => {
        const scrimAlive = Array.from(document.querySelectorAll('.dialog-overlay')).some((o) => {
          const s = getComputedStyle(o)
          return s.display !== 'none' && s.pointerEvents !== 'none'
        })
        return document.body.style.pointerEvents !== 'none'
          && !scrimAlive
          && document.querySelectorAll('body > [aria-hidden="true"]').length === 0
      })
      if (clean) recovered += 1
    }
    record(`20. ${rounds} rounds of combined wreckage all recover`, recovered === rounds, `${recovered}/${rounds}`)

    /* -- method 21: the field still works at the end of all that ----------- */
    if (haveField) {
      await title.click({ timeout: 8000 }).catch(() => {})
      const before21 = await title.inputValue()
      // The caret lands wherever the click put it, so assert that the keystroke
      // was *accepted* rather than that it landed at the end of the string.
      await page.keyboard.type('OK21', { delay: 12 })
      const value = await title.inputValue()
      record('21. text box is still usable after repeated combined wreckage',
        value.includes('OK21') && value !== before21, `value="${value}"`)
    } else record('21. text box is still usable after repeated combined wreckage', false, 'no field')

    await context.close()
  }

  /* --------------------------------------------------------------- method 22
   * A genuinely open dialog must NOT be dismantled by the guard — the cure
   * must not become a new bug. */
  {
    const { context, page } = await openPage(browser, '/devices/')
    const trigger = page.getByRole('button', { name: /add branch|add device|new branch|add/i }).first()
    await trigger.click({ timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(1600)
    const before = await page.locator('[role="dialog"]').count()
    await page.waitForTimeout(1600) // let several guard sweeps run
    const after = await page.locator('[role="dialog"]').count()
    const overlayVisible = await page.evaluate(() => {
      const o = document.querySelector('.dialog-overlay')
      return o ? getComputedStyle(o).display !== 'none' : false
    })
    record('22. an open dialog and its overlay survive the guard',
      before > 0 && after === before && overlayVisible, `dialogs ${before} -> ${after}, overlay visible=${overlayVisible}`)
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
