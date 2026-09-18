// Start npm run dev:members first. All requests are restricted to localhost.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1050 } })
  const errors = [],
    external = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      external.push(route.request().url())
      return route.abort()
    }
    return route.continue()
  })
  await page.goto('http://127.0.0.1:5174/lab/index.html')
  await page.getByRole('option', { name: 'Annual membership' }).waitFor({ state: 'attached' })
  assert.equal(await page.getByLabel('ID state or type').locator('option').count(), 55)
  assert.equal(await page.getByLabel('Suffix', { exact: true }).locator('option').count(), 6)
  await page.getByRole('button', { name: 'Scan ID', exact: true }).click()
  await page.getByLabel('Scanned ID data').fill('invalid scan')
  await page.getByRole('button', { name: 'Apply scan' }).click()
  await page
    .getByRole('alert')
    .getByText(/Unable to read this scan/)
    .waitFor()
  assert.equal(await page.getByLabel('Scanned ID data').inputValue(), '')
  const unique = `FAKE-UI-${Date.now()}`
  await page
    .getByLabel('Scanned ID data')
    .fill(`DACSCANNED\nDADMIDDLE\nDCSGUEST\nDAEJR\nDBB01021990\nDAQ${unique}\nDAJNY`)
  await page.getByRole('button', { name: 'Apply scan' }).click()
  assert.equal(await page.getByLabel('First name', { exact: true }).inputValue(), 'SCANNED')
  assert.equal(await page.getByLabel('Date of birth').inputValue(), '1990-01-02')
  await page.getByLabel('Type of membership').selectOption('annual')
  await page.getByLabel('Date of birth').fill('2020-01-01')
  await page.getByRole('button', { name: 'Create membership', exact: true }).click()
  await page.getByRole('alert').getByText('Members must be at least 18 years old.').waitFor()
  await page.getByLabel('Date of birth').fill('1990-01-02')
  await page.getByLabel('Guest notes').fill('Synthetic UI verification')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/member-creation-local.png', fullPage: true })
  await page.getByRole('button', { name: 'Create membership', exact: true }).click()
  await page.getByText(/SCANNED GUEST created. Membership ID:/).waitFor()
  await page.getByRole('button', { name: 'Create another member' }).click()
  await page.getByLabel('First name', { exact: true }).fill('Duplicate')
  await page.getByLabel('Last name', { exact: true }).fill('Guest')
  await page.getByLabel('Date of birth').fill('1990-01-02')
  await page.getByLabel('ID number', { exact: true }).fill(unique)
  await page.getByLabel('Type of membership').selectOption('monthly')
  await page.getByRole('button', { name: 'Create membership', exact: true }).click()
  await page
    .getByRole('alert')
    .getByText(/already exists/)
    .waitFor()
  await page.getByLabel('ID number', { exact: true }).fill(`${unique}-IMPORT`)
  await page.getByLabel('Enter existing membership details').check()
  await page.getByLabel('Creation date', { exact: true }).fill('2020-01-01')
  await page.getByLabel('Expire date', { exact: true }).fill('2021-01-01')
  const number = String(1000000 + (Date.now() % 100000000))
  await page.getByLabel('Membership ID', { exact: true }).fill(number)
  await page.getByRole('button', { name: 'Create membership', exact: true }).click()
  await page
    .getByText(`Duplicate Guest created. Membership ID: ${number}.`, { exact: true })
    .waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  console.log(
    'Member form UI passed: field options, scan, age validation, save, duplicate rejection, import overrides, narrow layout, localhost-only requests.',
  )
} finally {
  await browser.close()
}
