// Optional browser UX test: npm install --no-save @playwright/test;
// npm run build; serve out/ on port 3000; node tests/store-agent.playwright.mjs
import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  await context.addInitScript(() => {
    sessionStorage.setItem('hyperfamily-session', JSON.stringify({ state: { user: { username: 'Admin', role: 'admin' } }, version: 0 }))
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:3000/store-update/', { waitUntil: 'networkidle' })
  await expect(page.getByText('Agent is not running', { exact: true }).first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Import Agent to all', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import Agent', exact: true })).toHaveCount(16)
  await page.getByRole('button', { name: 'Import Agent', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toContainText('Automatic startup before Login')
  await page.getByRole('dialog').getByRole('button', { name: 'Import Agent', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('1 successful', { timeout: 15000 })
  await expect(page.getByRole('dialog')).toContainText('Copied and verified')
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
  await page.getByRole('button', { name: 'Import Agent', exact: true }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Import Agent', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('SHA-256 matches — copy skipped', { timeout: 15000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
  await page.getByRole('button', { name: 'Import Agent to all', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Import Agent to all', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('16 successful', { timeout: 45000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
  for (const width of [1366, 900, 600]) {
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, `horizontal overflow at ${width}px`).toBe(false)
  }
  expect(errors).toEqual([])
  console.log('PASS: missing-agent label, single/bulk Import, confirmation, hash skip, summaries, responsive layout and no browser exceptions')
} finally { await browser.close() }
