// Optional: npm install --no-save --package-lock=false @playwright/test
// Build, serve out/ on port 3000, then node tests/settings-about.playwright.mjs.
import { chromium, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const stack = JSON.parse(readFileSync(new URL('../lib/technology-stack.json', import.meta.url)))
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000'
const screenshots = process.env.TEST_SCREENSHOTS || 'test-artifacts/settings-about'
mkdirSync(screenshots, { recursive: true })
const LAUNCH = { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--js-flags=--max-old-space-size=320', '--renderer-process-limit=1', '--disable-background-networking', '--disable-features=Translate,BackForwardCache,MediaRouter'] }
const errors = []
// Software-GL, memory-starved containers randomly kill renderers mid-suite
// (reproduced identically against unmodified main); retry a crashed run so
// harness instability is not misread as a Settings/About regression.
for (let attempt = 1; attempt <= 4; attempt++) {
  errors.length = 0
  let browser = await chromium.launch(LAUNCH)
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
    await context.addInitScript(() => {
      sessionStorage.setItem('hyperfamily-session', JSON.stringify({ state: { user: { username: 'Admin', role: 'admin' } }, version: 0 }))
      if (!localStorage.getItem('hyperfamily.browser.demo.v2')) localStorage.setItem('hyperfamily.browser.demo.v2', JSON.stringify({ settings: {
        store_program_name: 'Previously selected product', store_update_path: 'D:\\Updates',
        target_domain: 'test-domain', target_admin_user: 'administrator', target_admin_password: 'fixture-secret'
      } }))
    })
    let page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/settings/`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Administrator account', { exact: true })).toBeVisible()
    await expect(page.getByText('Product name in Programs and Features', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Deploy destination folder', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${screenshots}/general-light.png`, fullPage: true })
    await page.getByRole('tab', { name: 'Store App', exact: true }).click()
    const destination = page.getByLabel('Deploy destination folder', { exact: true })
    const password = page.getByLabel('Password', { exact: true })
    await expect(destination).toHaveValue('D:\\Updates')
    await expect(password).toHaveValue('')
    await expect(password).toHaveAttribute('placeholder', 'Stored — leave empty to keep it')
    await destination.fill('relative/path')
    await page.getByRole('button', { name: 'Save deploy destination', exact: true }).click()
    await expect(page.getByText('The deploy destination must look like', { exact: false })).toBeVisible()
    await destination.fill('  E:\\Checkout Updates\\  ')
    await page.getByRole('button', { name: 'Save deploy destination', exact: true }).click()
    await expect(destination).toHaveValue('E:\\Checkout Updates')
    await page.getByLabel('Target domain', { exact: true }).fill('new-domain')
    await page.getByRole('button', { name: 'Save target access', exact: true }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hyperfamily.browser.demo.v2')).settings)
    expect(saved.store_program_name).toBe('Previously selected product')
    expect(saved.target_admin_password).toBe('fixture-secret')
    expect(saved.target_domain).toBe('new-domain')
    await page.getByRole('tab', { name: 'General', exact: true }).click()
    await page.getByRole('tab', { name: 'Store App', exact: true }).click()
    await expect(destination).toHaveValue('E:\\Checkout Updates')
    await expect(password).toHaveValue('')
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Store App', exact: true }).click()
    await expect(destination).toHaveValue('E:\\Checkout Updates')
    await expect(page.getByLabel('Target domain', { exact: true })).toHaveValue('new-domain')
    await password.fill('replacement-fixture')
    await page.getByRole('button', { name: 'Save target access', exact: true }).click()
    await expect(password).toHaveValue('')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hyperfamily.browser.demo.v2')).settings.target_admin_password)).toBe('replacement-fixture')
    await page.screenshot({ path: `${screenshots}/store-app-light.png`, fullPage: true })

    // Instrument the IPC boundary: verify omission of blank secrets and product keys,
    // typed/stored access-test payloads, failure feedback, and busy interlocks.
    await page.evaluate(() => {
      window.testCalls = []
      window.failNext = false
      window.hyperfamily = {
        settings: { save: async (patch) => {
          window.testCalls.push({ kind: 'save', patch })
          await new Promise((resolve) => setTimeout(resolve, 400))
          if (window.failNext) { window.failNext = false; throw new Error('Fixture save failed') }
          const state = JSON.parse(localStorage.getItem('hyperfamily.browser.demo.v2'))
          state.settings = { ...state.settings, ...patch }
          localStorage.setItem('hyperfamily.browser.demo.v2', JSON.stringify(state))
          return state.settings
        } },
        storeUpdate: { testAccess: async (payload) => {
          window.testCalls.push({ kind: 'test', payload })
          await new Promise((resolve) => setTimeout(resolve, 400))
          return { host: payload.host, user: 'new-domain\\administrator', durationMs: 400 }
        } }
      }
    })
    await page.getByLabel('Test against one checkout', { exact: true }).fill('CO-01')
    await page.getByRole('button', { name: 'Test access', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save target access', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save deploy destination', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Test access', exact: true })).toBeEnabled()
    await password.fill('typed-test-fixture')
    await page.getByRole('button', { name: 'Test access', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Test access', exact: true })).toBeEnabled()
    await password.fill('')
    await page.getByRole('button', { name: 'Save target access', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save target access', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Save deploy destination', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save deploy destination', exact: true })).toBeEnabled()
    const calls = await page.evaluate(() => window.testCalls)
    expect(calls[0].payload.password).toBeUndefined()
    expect(calls[1].payload.password).toBe('typed-test-fixture')
    expect(calls[2].patch).toEqual({ target_domain: 'new-domain', target_admin_user: 'administrator' })
    expect(calls[3].patch).toEqual({ store_update_path: 'E:\\Checkout Updates' })
    await page.evaluate(() => { window.failNext = true })
    await page.getByRole('button', { name: 'Save deploy destination', exact: true }).click()
    await expect(page.getByText('Fixture save failed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save deploy destination', exact: true })).toBeEnabled()

    // The About checks run in a FRESH browser per theme: software-GL containers
    // occasionally crash a renderer that has already chewed through the Settings
    // page, and that instability must not masquerade as an About regression.
    const seed = (theme) => `
      sessionStorage.setItem('hyperfamily-session', JSON.stringify({ state: { user: { username: 'Admin', role: 'admin' } }, version: 0 }))
      localStorage.setItem('hyperfamily.browser.demo.v2', JSON.stringify({ settings: {
        theme: ${JSON.stringify(theme)}, store_program_name: 'Previously selected product', store_update_path: 'D:\\\\Updates',
        target_domain: 'test-domain', target_admin_user: 'administrator', target_admin_password: 'fixture-secret'
      } }))`
    for (const theme of ['aurora', 'polar']) {
      await browser.close()
      browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--js-flags=--max-old-space-size=320', '--renderer-process-limit=1', '--disable-background-networking', '--disable-features=Translate,BackForwardCache,MediaRouter'] })
      const themeBrowser = browser
      const themeContext = await themeBrowser.newContext({ viewport: { width: 1366, height: 768 } })
      await themeContext.addInitScript(seed(theme))
      page = await themeContext.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base}/about/`, { waitUntil: 'networkidle' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const hero = page.getByLabel('Product overview', { exact: true })
      await expect(hero).toContainText(`v${pkg.version}`)
      await expect(hero.getByText(`v${pkg.version}`, { exact: true })).toHaveCount(1)
      await expect(page.locator('.tech-tile')).toHaveCount(stack.length)
      for (const entry of stack) {
        const version = pkg.dependencies[entry.package] || pkg.devDependencies[entry.package]
        const name = entry.showMajor ? `${entry.name} ${version.match(/\d+/)[0]}` : entry.name
        await expect(page.getByText(name, { exact: true })).toBeVisible()
      }
      await expect(page.getByText('shadcn/ui', { exact: true })).toHaveCount(0)
      const extraHeight = await hero.evaluate((el) => el.clientHeight - el.firstElementChild.nextElementSibling.getBoundingClientRect().height)
      expect(extraHeight).toBeLessThan(4)
      await page.getByRole('button', { name: 'Check for updates', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeEnabled()
      await page.screenshot({ path: `${screenshots}/about-${theme}.png`, fullPage: true })
      for (const width of [1366, 900, 600]) {
        await page.setViewportSize({ width, height: 768 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `About overflow ${theme}/${width}`).toBe(false)
      }
      await page.setViewportSize({ width: 1366, height: 768 })
      await page.goto(`${base}/settings/`, { waitUntil: 'networkidle' })
      await page.getByRole('tab', { name: 'Store App', exact: true }).click()
      for (const width of [1366, 900, 600]) {
        await page.setViewportSize({ width, height: 768 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `Settings overflow ${theme}/${width}`).toBe(false)
      }
      await page.setViewportSize({ width: 1366, height: 768 })
      await expect(page.getByRole('tab', { name: 'Store App', exact: true })).toHaveAttribute('data-state', 'active')
      await expect.poll(() => page.getByRole('tabpanel').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1)
      await page.screenshot({ path: `${screenshots}/store-app-${theme}.png`, fullPage: true })
      await themeBrowser.close()
    }
    // A fresh profile must supply a password; test and domain errors stay local.
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('hyperfamily.browser.demo.v2'))
      state.settings.target_admin_password = ''
      localStorage.setItem('hyperfamily.browser.demo.v2', JSON.stringify(state))
    })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Store App', exact: true }).click()
    await page.getByRole('button', { name: 'Save target access', exact: true }).click()
    await expect(page.getByText('Enter the password for the target account', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Test access', exact: true }).click()
    await expect(page.getByText('Enter the hostname or IP of one checkout to test against', { exact: true })).toBeVisible()
    await page.getByLabel('Target domain', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Save target access', exact: true }).click()
    await expect(page.getByText('Enter the domain of the target machines', { exact: false })).toBeVisible()
    expect(errors).toEqual([])
  
console.log('PASS: Settings relocation, validation, save/reload/tab switch, product and password preservation, IPC payloads, busy/error states, About version/stack/compact card, light/dark responsive layout, no browser exceptions')
    await browser.close()
    break
  } catch (error) {
    await browser.close().catch(() => {})
    const harnessCrash = /Page crashed|Target page, context or browser has been closed/i.test(String(error && error.message))
    if (!harnessCrash || attempt === 4) throw error
    console.log(`- renderer died during attempt ${attempt}; retrying the suite`)
  }
}
