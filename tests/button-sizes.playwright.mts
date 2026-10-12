import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  await context.addInitScript(() => {
    sessionStorage.setItem(
      'hyperfamily-session',
      JSON.stringify({ state: { user: { username: 'Admin', role: 'admin' } }, version: 0 })
    )
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/store-update/', { waitUntil: 'networkidle' })
  const toolbar = page.getByRole('button', { name: 'Import Agent all', exact: true })
  await expect(toolbar).toBeVisible({ timeout: 20000 })
  const toolbarHeight = await toolbar.evaluate((element) => parseFloat(getComputedStyle(element).height))
  expect(toolbarHeight, 'desktop toolbar buttons should be compact').toBeLessThanOrEqual(30)
  const notice = page.getByRole('button', { name: /Notifications/ })
  const noticeHeight = await notice.evaluate((element) => parseFloat(getComputedStyle(element).height))
  expect(noticeHeight, 'header icon buttons should be compact').toBeLessThanOrEqual(38)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileNav = page.getByRole('button', { name: 'More sections' })
  await expect(mobileNav).toBeVisible()
  // Motion briefly scales the whole nav on mount; check the untransformed CSS size.
  expect(
    await mobileNav.evaluate((element) => parseFloat(getComputedStyle(element).height)),
    'phone navigation keeps a usable touch target'
  ).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)

  const login = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await login.goto('http://127.0.0.1:3000/login/', { waitUntil: 'networkidle' })
  const submit = login.getByRole('button', { name: 'Sign in securely' })
  await expect(submit).toBeVisible({ timeout: 15000 })
  expect(
    await submit.evaluate((element) => parseFloat(getComputedStyle(element).height)),
    'the sign-in button should be compact'
  ).toBeLessThanOrEqual(42)
  console.log(
    `PASS: toolbar ${toolbarHeight}px, notification ${noticeHeight}px, mobile touch target and sign-in button`
  )
} finally {
  await browser.close()
}
