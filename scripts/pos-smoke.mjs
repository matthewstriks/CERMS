import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { completeSale, savePosSettings } from '../functions/pos.mjs'
import { posFixture, owner as uid, business as club, registerId } from './fixtures/pos-server.mjs'
import { membershipProduct } from './fixtures/catalog.mjs'
import { emptyCounts } from './fixtures/registers.mjs'
const fixture = posFixture(),
  docs = fixture.docs,
  base = 'projects/cerms-7af24/databases/cerms/documents',
  time = '2026-10-01T12:00:00Z'
docs.get('users/' + uid).email = 'matthew@striks.com'
docs.set(`system/${club}/products/retail`, {
  ...membershipProduct(),
  ...docs.get(`system/${club}/products/retail`),
  membership: false,
  updatedBy: uid,
  updatedAt: { timestampValue: time },
})
docs.set(`system/${club}/categories/retail`, {
  name: 'Retail',
  desc: '',
  color: '#abc123',
  version: 1,
  updatedBy: uid,
  updatedAt: { timestampValue: time },
})
Object.assign(docs.get(`system/${club}/registers/${registerId}`), {
  schemaVersion: 1,
  ownerName: 'Matthew Test Striks',
  openingCounts: { ...emptyCounts(), bill20: 5 },
  openedAt: { timestampValue: time },
  closingCounts: null,
  closingTotalCents: null,
  closedAt: null,
  closeNote: '',
})
const encode = (v) =>
  v === null
    ? { nullValue: null }
    : typeof v === 'string'
      ? { stringValue: v }
      : typeof v === 'boolean'
        ? { booleanValue: v }
        : typeof v === 'number'
          ? { integerValue: String(v) }
          : v.timestampValue
            ? v
            : Array.isArray(v)
              ? { arrayValue: { values: v.map(encode) } }
              : {
                  mapValue: {
                    fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])),
                  },
                }
const document = (p) => ({
  name: base + '/' + p,
  fields: Object.fromEntries(Object.entries(docs.get(p)).map(([k, v]) => [k, encode(v)])),
  createTime: time,
  updateTime: time,
})
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 20000 }),
  errors = []
let saleCalls = 0,
  dropFirstResponse = true
try {
  const admissions = await readFile(
    new URL('./fixtures/admissions-module.mjs', import.meta.url),
    'utf8',
  )
  await app
    .context()
    .route('cerms://app/assets/firebase-admissions-*.js', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: admissions }),
    )
  await app.context().route('https://**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      respond = (d) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) })
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (url.pathname.endsWith(':signInWithPassword')) {
        const now = Math.floor(Date.now() / 1000),
          payload = Buffer.from(
            JSON.stringify({
              sub: uid,
              user_id: uid,
              aud: 'cerms-7af24',
              iss: 'https://securetoken.google.com/cerms-7af24',
              iat: now,
              exp: now + 3600,
              auth_time: now,
              firebase: { sign_in_provider: 'password' },
            }),
          ).toString('base64url')
        return respond({
          localId: uid,
          email: 'matthew@striks.com',
          idToken: `eyJhbGciOiJSUzI1NiJ9.${payload}.fixture`,
          refreshToken: 'fixture-only',
          expiresIn: '3600',
        })
      }
      if (url.pathname.endsWith(':lookup'))
        return respond({
          users: [
            {
              localId: uid,
              email: 'matthew@striks.com',
              emailVerified: true,
              displayName: 'Matthew Example Striks',
              providerUserInfo: [
                {
                  providerId: 'password',
                  email: 'matthew@striks.com',
                  federatedId: 'matthew@striks.com',
                },
              ],
            },
          ],
        })
    }

    if (url.hostname === 'us-central1-cerms-7af24.cloudfunctions.net') {
      const { data } = request.postDataJSON()
      try {
        let result
        if (url.pathname === '/completeSale') {
          saleCalls++
          result = await completeSale({ auth: { uid }, data }, fixture.deps)
          if (dropFirstResponse) {
            dropFirstResponse = false
            return route.abort('failed')
          }
        } else if (url.pathname === '/savePosSettings')
          result = await savePosSettings({ auth: { uid }, data }, fixture.deps)
        else throw Error('Unexpected function')
        return respond({ result })
      } catch (e) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              status: String(e.code || 'invalid-argument')
                .replaceAll('-', '_')
                .toUpperCase(),
              message: e.message,
            },
          }),
        })
      }
    }
    if (url.hostname === 'firestore.googleapis.com') {
      assert.ok(url.pathname.startsWith('/v1/' + base), 'Only cerms')
      const body = request.postDataJSON()
      if (url.pathname.endsWith(':batchGet'))
        return respond(
          body.documents.map((name) => {
            const p = name.slice(base.length + 1)
            return docs.has(p) ? { found: document(p) } : { missing: name, readTime: time }
          }),
        )
      if (url.pathname.endsWith(':runQuery')) {
        const collection = body.structuredQuery.from[0].collectionId
        return respond(
          [...docs.keys()]
            .filter((p) => p.startsWith(`system/${club}/${collection}/`))
            .map((p) => ({ document: document(p) })),
        )
      }
      if (url.pathname.endsWith(':commit')) {
        for (const w of body.writes) {
          const p = w.update.name.slice(base.length + 1)
          assert.ok(p.startsWith(`system/${club}/registers/`))
          for (const [k, v] of Object.entries(w.update.fields)) {
            const decode = (v) =>
              'integerValue' in v
                ? Number(v.integerValue)
                : 'stringValue' in v
                  ? v.stringValue
                  : 'nullValue' in v
                    ? null
                    : 'mapValue' in v
                      ? Object.fromEntries(
                          Object.entries(v.mapValue.fields).map(([k, v]) => [k, decode(v)]),
                        )
                      : v
            docs.get(p)[k] = decode(v)
          }
          for (const t of w.updateTransforms ?? [])
            docs.get(p)[t.fieldPath] = { timestampValue: time }
        }
        return respond({
          writeResults: body.writes.map(() => ({ updateTime: time })),
          commitTime: time,
        })
      }
    }
    errors.push('Unexpected ' + url.hostname + url.pathname)
    return route.abort()
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.message))
  await app.evaluate(({ app, BrowserWindow }) => {
    globalThis.receiptPrints = []
    const stub = (wc) => {
      wc.getPrintersAsync = async () => [
        { name: 'Synthetic RP326', displayName: 'Synthetic RP326' },
      ]
      wc.print = (options, callback) => {
        globalThis.receiptPrints.push(options)
        callback(true, '')
      }
    }
    BrowserWindow.getAllWindows().forEach((w) => stub(w.webContents))
    app.on('web-contents-created', (_e, wc) => stub(wc))
  })
  await page.getByLabel('Email', { exact: true }).fill('matthew@striks.com')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.evaluate(() => (location.hash = 'registers'))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close my register' })).toBeVisible()
  await expect
    .poll(() =>
      app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('new-order').enabled),
    )
    .toBe(true)
  assert.equal(
    await app.evaluate(
      ({ Menu }) => Menu.getApplicationMenu().getMenuItemById('new-order').accelerator,
    ),
    'CommandOrControl+Shift+O',
  )
  // Chromium's synthetic key events do not dispatch macOS native menu accelerators.
  // Verify the accelerator above, then invoke its native menu callback.
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().getMenuItemById('new-order')
    item.click()
  })
  await expect(page.getByText('Your register is open')).toBeVisible()
  await page.getByLabel('Product category').selectOption('retail')
  await page.getByLabel('Search or scan products').fill('12345')
  await page.getByLabel('Search or scan products').press('Enter')
  await page.getByLabel('Quantity for Test retail').fill('2')
  await page.getByRole('button', { name: 'Take payment', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
  await payment.getByLabel('Payment amount 1').fill('10.00')
  await payment.getByLabel('Cash received', { exact: true }).fill('20.00')
  await payment.getByRole('button', { name: 'Add payment method' }).click()
  await payment.getByLabel('Payment reference 2').fill('terminal-123')
  await expect(payment.getByText('$10.00', { exact: true })).toBeVisible()
  await payment.getByRole('checkbox').check()
  await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
  await expect(payment.getByRole('button', { name: 'Retry same sale' })).toBeVisible()
  await page.evaluate(() => {
    location.hash = 'registers'
  })
  await expect(page.getByRole('button', { name: 'Close my register' })).toBeVisible()
  await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
  await page.getByRole('button', { name: 'Retry / retrieve saved receipt' }).click()
  const receipt = page.getByRole('dialog', { name: 'Sale receipt', exact: true })
  await expect(receipt).toBeVisible()
  await expect(receipt.locator('pre')).toContainText('Change: $10.00')
  await expect(receipt.locator('pre')).toContainText('Card paid: $11.60')
  await receipt.getByLabel('Receipt printer', { exact: true }).selectOption('Synthetic RP326')
  await receipt.getByRole('button', { name: 'Print receipt', exact: true }).click()
  await expect(receipt.getByText('Receipt sent to the printer.')).toBeVisible()
  assert.equal(await app.evaluate(() => globalThis.receiptPrints.length), 1)
  assert.equal(saleCalls, 2)
  assert.equal(fixture.commits(), 1)
  assert.equal(docs.get(`system/${club}/registerTotals/${registerId}`).expectedCashCents, 11000)
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/pos-receipt.png' })
  await receipt.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByText(/Expected cash \$110.00/)).toBeVisible()
  await page.getByRole('button', { name: 'Sales & payments', exact: true }).click()
  await expect(page.getByText('terminal-123', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'View / print' }).click()
  await expect(page.getByRole('dialog', { name: 'Sale receipt' })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Tax & receipts', exact: true }).click()
  await page.getByLabel('Sales tax (%)', { exact: true }).fill('7.25')
  await page.getByRole('button', { name: 'Save POS settings' }).click()
  await expect(page.getByText('Tax and receipt settings saved.')).toBeVisible()
  assert.equal(docs.get(`system/${club}/posSettings/default`).taxRateBps, 725)
  await page.getByRole('link', { name: 'Registers', exact: true }).click()
  await page.getByRole('button', { name: 'Close my register' }).click()
  const closing = page.getByRole('dialog', { name: 'Close register', exact: true })
  await closing.getByLabel('$20 bills', { exact: true }).fill('5')
  await closing.getByLabel('$10 bills', { exact: true }).fill('1')
  await expect(closing.getByText('Expected cash', { exact: true })).toBeVisible()
  await closing.getByRole('button', { name: 'Save ending count and close' }).click()
  await expect(
    page.getByText('Register closed. Your ending count is saved in Closed registers.'),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
  await expect(
    page.getByText('Open your register before checkout.', { exact: false }),
  ).toBeVisible()
  await page.screenshot({ path: 'artifacts/pos-workspace.png' })
  assert.deepEqual(errors, [])
  console.log(
    'POS smoke passed: barcode, split payment/change, uncertain-save retry, receipt printing/reopen, tax settings and register close. All HTTPS intercepted; no real payments, writes or print jobs.',
  )
} finally {
  await app.close()
}
