import { seedReports, reportQuery } from './fixtures/reports.mjs'
import { memberNotes } from '../functions/member-notes.mjs'
import { saveThemePreference } from '../functions/theme.mjs'
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { getImage } from '../functions/product-images.mjs'
import { completeSale, savePosSettings, updateRental, checkOutRental } from '../functions/pos.mjs'
import { posFixture, owner as uid, registerId } from './fixtures/pos-server.mjs'
import { membershipProduct } from './fixtures/catalog.mjs'
import { emptyCounts } from './fixtures/registers.mjs'
const reportsSmoke = process.argv.includes('--reports')
let denyReportSales = false
const expiredCheckinSmoke = process.argv.includes('--expired-checkin')
const registerPromptSmoke = process.argv.includes('--register-prompt')
const notesSmoke = process.argv.includes('--notes')
const themeSmoke = process.argv.includes('--theme')
let failThemeNext = false
const catalogSmoke = process.argv.includes('--catalog')
const groupSmoke = process.argv.includes('--group')
const renewalSmoke = process.argv.includes('--membership-renewal')
const membershipSmoke =
  process.argv.includes('--members') ||
  groupSmoke ||
  renewalSmoke ||
  notesSmoke ||
  registerPromptSmoke ||
  expiredCheckinSmoke
const club = membershipSmoke ? 'dev' : 'club-a'
const fixture = posFixture(),
  docs = fixture.docs,
  base = 'projects/cerms-7af24/databases/cerms/documents',
  time = '2026-10-01T12:00:00Z'
if (membershipSmoke) {
  for (const [key, value] of [...docs])
    if (key.startsWith('system/club-a')) {
      docs.set(key.replace('system/club-a', 'system/dev'), value)
      docs.delete(key)
    }
  docs.get('users/' + uid).access = 'dev'
  const retail = docs.get('system/dev/products/retail')
  docs.set('system/dev/products/plan', {
    ...membershipProduct(),
    ...retail,
    membership: true,
    name: 'Monthly plan',
    membershipLengthRaw: 30,
    membershipLengthType: 'day',
    inventory: null,
  })
  docs.set('system/dev/products/room', {
    ...membershipProduct(),
    ...retail,
    membership: false,
    rental: true,
    name: 'Room rental',
    rentalLengthRaw: 2,
    rentalLengthType: 'hour',
    inventory: null,
  })
}
if (groupSmoke || renewalSmoke || notesSmoke || registerPromptSmoke || expiredCheckinSmoke) {
  for (const [id, name, number] of [
    ['buyer', 'Alex Buyer', 101],
    ['friend', 'Casey Friend', 102],
  ])
    docs.set('members/' + id, {
      access: 'dev',
      name,
      fname: name.split(' ')[0],
      lname: name.split(' ')[1],
      id_number: number,
      membership_type: 'Existing annual',
      id_expiration: Math.floor(Date.now() / 1000) + 86400,
      creation_time: { timestampValue: time },
      checkedIn: false,
      dna: false,
      notes: [],
      dob: '1990-01-02',
      email: '',
      idnum: 'FAKE-' + id,
      idstate: 'TX',
    })
}
if (notesSmoke) {
  docs.get('members/buyer').tag = true
  docs.get('members/buyer').notes = ['Original legacy note']
}
if (themeSmoke) docs.get('users/' + uid).themePreference = 'dark'
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
if (reportsSmoke) await seedReports({ fixture, uid, club, registerId })
const imageReads = new Map()
let catalogImage
if (catalogSmoke) {
  const sharp = createRequire(new URL('../functions/package.json', import.meta.url))('sharp')
  catalogImage = await sharp({
    create: { width: 160, height: 160, channels: 3, background: '#32876b' },
  })
    .webp()
    .toBuffer()
  Object.assign(docs.get(`system/${club}/products/retail`), {
    favorite: true,
    imagePath: `cerms5/catalog/${club}/products/retail/${'a'.repeat(64)}.webp`,
  })
  for (const [id, name] of [
    ['fallback', 'Text fallback'],
    ['broken', 'Unavailable image'],
  ])
    docs.set(`system/${club}/products/${id}`, {
      ...docs.get(`system/${club}/products/retail`),
      name,
      cat: 'rooms',
      barcode: id,
      favorite: false,
      imagePath:
        id === 'broken' ? `cerms5/catalog/${club}/products/broken/${'b'.repeat(64)}.webp` : null,
    })
  docs.set(`system/${club}/categories/rooms`, {
    name: 'Rooms',
    desc: '',
    color: '#f0dbaa',
    version: 1,
    updatedBy: uid,
    updatedAt: { timestampValue: time },
  })
}
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
async function expandCategories(page) {
  await page.locator('.pos-category summary').first().waitFor()
  for (const summary of await page.locator('.pos-category:not([open]) > summary').all())
    await summary.click()
}
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.', '--mute-audio'], env, timeout: 20000 }),
  errors = []
let originalDraft
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
  const messaging = await readFile(
    new URL('./fixtures/messaging-module.mjs', import.meta.url),
    'utf8',
  )
  await app
    .context()
    .route('cerms://app/assets/firebase-messaging-*.js', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: messaging }),
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
        } else if (url.pathname === '/saveThemePreference') {
          if (failThemeNext) {
            failThemeNext = false
            throw new Error('Synthetic appearance failure')
          }
          result = await saveThemePreference({ auth: { uid }, data }, fixture.deps)
        } else if (url.pathname === '/memberNotes') {
          result = await memberNotes({ auth: { uid }, data }, fixture.deps)
        } else if (url.pathname === '/checkOutRental') {
          result = await checkOutRental({ auth: { uid }, data }, fixture.deps)
        } else if (url.pathname === '/updateRental') {
          result = await updateRental({ auth: { uid }, data }, fixture.deps)
        } else if (catalogSmoke && url.pathname === '/getProductImage') {
          imageReads.set(data.productId, (imageReads.get(data.productId) ?? 0) + 1)
          result = await getImage(
            { auth: { uid }, data },
            {
              fail: fixture.deps.fail,
              db: {
                doc: (path) => ({
                  get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
                }),
              },
              bucket: {
                file: (path) => ({
                  getMetadata: async () => {
                    if (path.includes('/broken/'))
                      fixture.deps.fail('not-found', 'Synthetic missing image')
                    return [{ contentType: 'image/webp', size: catalogImage.length }]
                  },
                  download: async () => [catalogImage],
                }),
              },
            },
          )
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
        if (reportsSmoke) {
          if (denyReportSales && collection === 'sales')
            return route.fulfill({
              status: 403,
              contentType: 'application/json',
              body: JSON.stringify({
                error: {
                  code: 403,
                  status: 'PERMISSION_DENIED',
                  message: 'Synthetic report access unavailable',
                },
              }),
            })
          if (['sales', 'registers', 'members', 'activity'].includes(collection))
            assert.ok(body.structuredQuery.limit <= 50, `Bounded ${collection} queries`)
          const suffix = url.pathname
            .slice(('/v1/' + base).length)
            .replace(/:runQuery$/, '')
            .replace(/^\//, '')
          return respond(
            reportQuery(docs, body, base, suffix ? suffix + '/' : '').map((p) => ({
              document: document(p),
            })),
          )
        }

        return respond(
          [...docs.keys()]
            .filter((p) =>
              collection === 'members'
                ? p.startsWith('members/')
                : p.startsWith(`system/${club}/${collection}/`),
            )
            .map((p) => ({ document: document(p) })),
        )
      }
      if (url.pathname.endsWith(':commit')) {
        assert.ok(!reportsSmoke, 'Reports must never write Firestore documents')
        for (const w of body.writes) {
          const p = w.update.name.slice(base.length + 1)
          assert.ok(
            p.startsWith(`system/${club}/registers/`) ||
              p.startsWith(`system/${club}/registerOwners/`) ||
              p.startsWith(`system/${club}/memberLogs/`),
          )
          if (!docs.has(p)) docs.set(p, {})
          for (const [k, v] of Object.entries(w.update.fields)) {
            const decode = (v) =>
              'integerValue' in v
                ? Number(v.integerValue)
                : 'booleanValue' in v
                  ? v.booleanValue
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
  originalDraft = await page.evaluate(
    ({ uid, club }) => {
      const key = `cerms.pos.${uid}.${club}`,
        prior = localStorage.getItem(key)
      localStorage.removeItem(key)
      return prior
    },
    { uid, club },
  )
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
  if (reportsSmoke) {
    await page.getByRole('link', { name: 'Reports & analytics', exact: true }).click()
    const reportView = page.getByRole('group', { name: 'Report views', exact: true })
    await expect(reportView).toBeVisible()
    const metric = (label) =>
      page.locator('.report-metric').filter({ has: page.locator('span', { hasText: label }) })
    await expect(metric('Net sales before tax').locator('strong')).toHaveText('$1,038.00')
    await expect(metric('Completed transactions').locator('strong')).toHaveText('53')
    await expect(
      page.getByRole('img', { name: 'Daily net sales before tax', exact: true }),
    ).toBeVisible()
    await reportView.getByRole('button', { name: 'Sales & payments', exact: true }).click()
    const receipts = page.getByRole('table', { name: 'Receipt detail', exact: true })
    await expect(receipts.getByRole('row')).toHaveCount(16)
    await page
      .getByRole('group', { name: 'Receipt detail pages', exact: true })
      .getByRole('button', { name: 'Next', exact: true })
      .click()
    await expect(receipts.getByRole('row')).toHaveCount(16)
    await receipts
      .getByRole('button', { name: /View receipt/ })
      .first()
      .click()
    await expect(page.getByRole('dialog', { name: 'Sale receipt', exact: true })).toBeVisible()
    await page
      .getByRole('dialog', { name: 'Sale receipt', exact: true })
      .getByRole('button', { name: 'Done', exact: true })
      .click()
    await page.getByLabel('Report to export', { exact: true }).selectOption('receipts')
    const exportPath = '/private/tmp/cerms-report-smoke.csv'
    await app.evaluate(({ session }, path) => {
      globalThis.reportCsvState = 'waiting'
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(path)
        item.once('done', (_event, state) => {
          globalThis.reportCsvState = state
        })
      })
    }, exportPath)
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
    await expect.poll(() => app.evaluate(() => globalThis.reportCsvState)).toBe('completed')
    const csv = await readFile(exportPath, 'utf8')
    assert.equal(
      csv.trim().split('\r\n').length,
      54,
      'Every selected receipt is exported, beyond the first 50',
    )
    assert.ok(csv.includes("'=Saved Staff"), 'Spreadsheet formulas escaped')
    assert.ok(!csv.includes('PRIVATE-GOVERNMENT-ID'))
    await reportView.getByRole('button', { name: 'Memberships', exact: true }).click()
    await expect(metric('Active memberships now').locator('strong')).toHaveText('1')
    await expect(
      page.getByRole('table', { name: 'Memberships expiring in 30 days', exact: true }),
    ).toContainText('Upcoming Member')
    await expect(page.locator('.report-view')).not.toContainText('Foreign Member')
    await reportView.getByRole('button', { name: 'Rental activity', exact: true }).click()
    await expect(metric('Rental starts').locator('strong')).toHaveText('2')
    await expect(metric('Unique visiting members').locator('strong')).toHaveText('1')
    await reportView.getByRole('button', { name: 'Register closeouts', exact: true }).click()
    await expect(metric('Registers closed').locator('strong')).toHaveText('1')
    await expect(metric('Net cash over / short').locator('strong')).toHaveText('$1.00')
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: 'artifacts/reports-registers.png', fullPage: true })
    await reportView.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.screenshot({ path: 'artifacts/reports-overview-light.png', fullPage: true })
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await page.screenshot({ path: 'artifacts/reports-overview-dark.png', fullPage: true })
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.unmaximize()
      window.setSize(1100, 800)
    })
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(1100)
    await reportView.getByRole('button', { name: 'Register closeouts', exact: true }).click()
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Narrow report tables scroll within their panel',
    )
    await page.screenshot({ path: 'artifacts/reports-registers-narrow-dark.png', fullPage: true })
    await reportView.getByRole('button', { name: 'Memberships', exact: true }).click()
    await page.screenshot({ path: 'artifacts/reports-memberships-narrow-dark.png', fullPage: true })
    await reportView.getByRole('button', { name: 'Overview', exact: true }).click()
    // Financial failures remain explicit; current membership data is still usable.
    denyReportSales = true
    await page.getByRole('button', { name: 'Refresh reports', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Sales report unavailable', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByLabel('Report to export').locator('option[value="receipts"]'),
    ).toHaveCount(0)
    await reportView.getByRole('button', { name: 'Memberships', exact: true }).click()
    await expect(metric('Active memberships now').locator('strong')).toHaveText('1')
    denyReportSales = false
    await page.getByLabel('Report start date', { exact: true }).fill('2000-01-01')
    await page.getByLabel('Report end date', { exact: true }).fill('2000-01-02')
    await page.getByRole('button', { name: 'Apply dates', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Refresh reports', exact: true })).toBeEnabled()
    await reportView.getByRole('button', { name: 'Overview', exact: true }).click()
    await expect(metric('Completed transactions').locator('strong')).toHaveText('0')
    await expect(metric('Net sales before tax').locator('strong')).toHaveText('$0.00')
    assert.equal(saleCalls, 0)
    assert.deepEqual(errors, [])
    console.log(
      'Reports passed: complete scoped pagination, comparison and payout totals, all five views, receipts, complete safe CSV, current snapshots, empty ranges, per-source failures and light/dark layouts. All HTTPS intercepted; no production writes or print jobs.',
    )
  } else if (expiredCheckinSmoke) {
    const expired = Math.floor(Date.now() / 1000) - 86400
    docs.get('members/buyer').id_expiration = expired
    const before = structuredClone(docs.get('members/buyer'))
    // Selecting an expired member directly in POS also offers optional renewal.
    await page.getByRole('button', { name: 'Find existing member', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Choose existing member' })
      .getByRole('button', { name: /Alex Buyer/ })
      .click()
    const renewal = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
    await expect(renewal.getByRole('heading', { name: 'Renew expired membership' })).toBeVisible()
    await expect(renewal.getByLabel('Membership product')).toHaveValue('plan')
    await renewal.getByRole('button', { name: 'Continue without renewal', exact: true }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await page.getByRole('link', { name: 'Members', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: 'Alex Buyer' })
    await expect(row).toContainText('Expired')
    await expect(row.getByRole('button', { name: 'Check in', exact: true })).toBeEnabled()
    await row.getByRole('button', { name: 'Check in', exact: true }).click()
    await expect(renewal.getByRole('heading', { name: 'Renew expired membership' })).toBeVisible()
    await expect(renewal.getByLabel('Membership product')).toHaveValue('plan')
    await renewal.getByRole('button', { name: 'Continue without renewal', exact: true }).click()
    await expandCategories(page)
    await page.locator('.pos-product').filter({ hasText: 'Room rental' }).click()
    await page.getByLabel('Assigned Room/Number for Room rental', { exact: true }).fill('EX-1')
    await page.getByRole('button', { name: 'Continue to order', exact: true }).click()
    await expect(page.locator('.pos-cart')).not.toContainText('Monthly plan')
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    const payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByRole('button', { name: 'Back to cart' }).click()
    assert.deepEqual(docs.get('members/buyer'), before)
    assert.equal(fixture.commits(), 0)
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    await payment.getByRole('button', { name: 'Retry same sale', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Sale receipt', exact: true })).toBeVisible()
    assert.deepEqual(docs.get('members/buyer'), { ...before, checkedIn: true })
    assert.equal(fixture.commits(), 1)
    assert.equal([...docs.keys()].filter((p) => p.startsWith('activity/')).length, 1)
    assert.ok(docs.has(`system/${club}/memberVisits/buyer`))
    assert.deepEqual(errors, [])
    console.log(
      'Expired check-in passed: table and POS entry, optional renewal prompt/skip, rental checkout without renewal, canceled payment preserves member, atomic admission, lost-response retry and unchanged membership expiry. All HTTPS intercepted.',
    )
  } else if (registerPromptSmoke) {
    const prompt = page.getByRole('dialog', { name: 'Open register', exact: true })
    await expect(prompt).toHaveCount(0)
    const closeSyntheticRegister = () => {
      const id = docs.get(`system/${club}/registerOwners/${uid}`).registerId
      Object.assign(docs.get(`system/${club}/registers/${id}`), {
        status: 'closed',
        closingCounts: emptyCounts(),
        closingTotalCents: 0,
        closedAt: { timestampValue: time },
      })
    }
    closeSyntheticRegister()
    await expandCategories(page)
    await page.locator('.pos-product').filter({ hasText: 'Test retail' }).click()
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('.pos-cart')).toContainText('Test retail')
    await expect(page.getByRole('button', { name: 'Take payment', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Open register', exact: true }).click()
    await expect(prompt).toBeVisible()
    await prompt.getByLabel('$20 bills', { exact: true }).fill('3')
    await prompt.getByRole('button', { name: 'Open register', exact: true }).click()
    await expect(prompt).toHaveCount(0)
    await expect(page.getByText('Your register is open')).toBeVisible()
    const openedId = docs.get(`system/${club}/registerOwners/${uid}`).registerId
    assert.equal(docs.get(`system/${club}/registers/${openedId}`).openingTotalCents, 6000)
    await expect(page.getByRole('button', { name: 'Take payment', exact: true })).toBeEnabled()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    closeSyntheticRegister()
    // Existing-member check-in must prompt before selecting a rental.
    await page.getByRole('link', { name: 'Members', exact: true }).click()
    let row = page.getByRole('row').filter({ hasText: 'Alex Buyer' })
    await row.getByRole('button', { name: 'Check in', exact: true }).click()
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByLabel('Order linked to', { exact: true })).toContainText('Alex Buyer')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    // New-member details survive the prompt and remain unfulfilled.
    await page.getByRole('link', { name: 'Members', exact: true }).click()
    await page.getByRole('button', { name: 'Create membership', exact: true }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('First name', { exact: true }).fill('Synthetic')
    await form.getByLabel('Last name', { exact: true }).fill('Register Guest')
    await form.getByLabel('Date of birth', { exact: true }).fill('1990-01-02')
    await form.getByLabel('ID state or type', { exact: true }).selectOption('TX')
    await form.getByLabel('ID number', { exact: true }).fill('FAKE-REGISTER-PROMPT')
    await form.getByLabel('Type of membership', { exact: true }).selectOption('plan')
    await form.getByRole('button', { name: 'Continue to checkout' }).click()
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('.pos-cart')).toContainText('Monthly plan')
    await expect(page.getByLabel('Order linked to', { exact: true })).toContainText(
      'Synthetic Register Guest',
    )
    assert.equal([...docs.keys()].filter((p) => p.startsWith('members/')).length, 2)
    assert.equal(saleCalls, 0)
    assert.deepEqual(errors, [])
    console.log(
      'Order register prompt passed: empty POS stays quiet, fresh own-register check, retail/member check-in/new membership prompts, cancel preserves drafts, denomination opening and checkout readiness. All HTTPS intercepted.',
    )
  } else if (notesSmoke) {
    await page.getByRole('link', { name: 'Members', exact: true }).click()
    await page.getByRole('button', { name: 'View Alex Buyer', exact: true }).click()
    const details = page.getByRole('dialog', { name: 'Alex Buyer', exact: true })
    const notes = details.getByRole('region', { name: 'Member notes', exact: true })
    await expect(notes).toContainText('Original legacy note')
    await notes
      .getByLabel('Add member note', { exact: true })
      .fill('Please verify membership card at arrival.')
    await notes.getByRole('button', { name: 'Save note', exact: true }).click()
    const entry = notes.locator('article').filter({ hasText: 'Please verify membership card' })
    await expect(entry).toContainText('Matthew Test Striks')
    await expect(entry.locator('time')).toBeVisible()
    await notes.getByLabel('Do not admit (DNA)', { exact: true }).check()
    await expect(notes.getByRole('button', { name: 'Save DNA status' })).toBeDisabled()
    await notes.getByLabel('DNA reason', { exact: true }).fill('Synthetic incident reason')
    await notes.getByRole('button', { name: 'Save DNA status' }).click()
    await expect(notes.locator('article.member-note-dna')).toContainText(
      'Synthetic incident reason',
    )
    assert.equal(docs.get('members/buyer').dna, true)
    await mkdir('artifacts', { recursive: true })
    await details.screenshot({ path: 'artifacts/member-notes.png' })
    await notes.getByLabel('Do not admit (DNA)', { exact: true }).uncheck()
    await notes.getByRole('button', { name: 'Save DNA status' }).click()
    await expect(notes.locator('article').filter({ hasText: 'DNA cleared' })).toBeVisible()
    await entry.getByRole('button', { name: 'Remove note' }).click()
    await notes.getByRole('button', { name: 'Keep note' }).click()
    await expect(entry).toBeVisible()
    await entry.getByRole('button', { name: 'Remove note' }).click()
    await notes.getByRole('button', { name: 'Confirm remove note' }).click()
    await expect(entry).toHaveCount(0)
    await details.getByRole('button', { name: 'Close', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: 'Alex Buyer' })
    await row.getByRole('button', { name: 'Create order', exact: true }).click()
    let review = page.getByRole('dialog', { name: 'Read member notes', exact: true })
    await expect(review).toBeVisible()
    await expect(review).toContainText('Original legacy note')
    await review.screenshot({ path: 'artifacts/member-notes-review.png' })
    await expect(review).toContainText('Synthetic incident reason')
    await expect(review.getByRole('button', { name: 'Confirm read', exact: true })).toBeDisabled()
    await review.getByRole('button', { name: 'Cancel order action' }).click()
    await expandCategories(page)
    await page.locator('.pos-product').filter({ hasText: 'Test retail' }).click()
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    review = page.getByRole('dialog', { name: 'Read member notes', exact: true })
    await expect(review).toBeVisible()
    await review.getByLabel('I have read these member notes').check()
    await review.getByRole('button', { name: 'Confirm read', exact: true }).click()
    // Another staff note must invalidate the cashier's confirmation before payment.
    await memberNotes(
      {
        auth: { uid },
        data: {
          business: club,
          memberId: 'buyer',
          action: 'add',
          requestId: '99999999-0000-4000-8000-000000000001',
          text: 'New note after confirmation',
        },
      },
      fixture.deps,
    )
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    await expect(review).toContainText('New note after confirmation')
    await review.getByLabel('I have read these member notes').check()
    await review.getByRole('button', { name: 'Confirm read', exact: true }).click()
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    const payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    await page.getByRole('button', { name: 'Retry same sale', exact: true }).click()
    const receipt = page.getByRole('dialog', { name: 'Sale receipt', exact: true })
    await expect(receipt).toBeVisible()
    await expect(receipt).not.toContainText('Synthetic incident reason')
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: 'artifacts/member-notes-checkout.png' })
    assert.deepEqual(errors, [])
    console.log(
      'Member notes passed: saved actor/time, required DNA reason/highlight/clear, admin remove/cancel, tagged-order popup/cancel/read, fresh-note reconfirmation, sale retry and receipt privacy. All HTTPS intercepted.',
    )
  } else if (themeSmoke) {
    const profileBefore = structuredClone(docs.get('users/' + uid))
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
    const light = page.getByRole('button', { name: 'Switch to light mode' })
    await expect(light).toHaveAttribute('aria-pressed', 'true')
    await light.click()
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeEnabled()
    assert.deepEqual(docs.get('users/' + uid), { ...profileBefore, themePreference: 'light' })
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(light).toBeEnabled()
    assert.deepEqual(docs.get('users/' + uid), profileBefore)
    // A failed write must show an error and restore the prior appearance.
    failThemeNext = true
    await light.click()
    await expect(page.getByRole('alert')).toContainText('Synthetic appearance failure')
    await expect(light).toBeEnabled()
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
    assert.equal(fixture.commits(), 2)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('matthew@striks.com')
    await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
    await expect(light).toBeEnabled()
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
    assert.equal(fixture.commits(), 2, 'Sign-in must never write the preference')
    await mkdir('artifacts', { recursive: true })
    await expandCategories(page)
    await expect(page.getByRole('button', { name: 'Test retail', exact: true })).toBeVisible()
    await page.screenshot({ path: 'artifacts/dark-mode-pos.png' })
    await page.getByRole('link', { name: 'Registers', exact: true }).click()
    await page.getByRole('button', { name: 'Close my register', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const appearance = await dialog.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
      scheme: getComputedStyle(el).colorScheme,
    }))
    assert.equal(appearance.scheme, 'dark')
    assert.notEqual(appearance.bg, 'rgb(255, 255, 255)')
    await page.screenshot({ path: 'artifacts/dark-mode-dialog.png' })
    assert.deepEqual(errors, [])
    console.log(
      'Dark mode passed: saved-profile loading, both toggles, profile-only writes, failure rollback, sign-out/in persistence without sign-in writes, and dark POS/register dialog. All HTTPS intercepted.',
    )
  } else if (catalogSmoke) {
    const favorites = page.getByRole('region', { name: 'Favorites', exact: true })
    const tile = favorites.getByRole('button', { name: 'Test retail', exact: true })
    await expect(tile.locator('img')).toBeVisible()
    await expect(tile.locator('span')).toHaveCount(0)
    const retailCategory = page
      .locator('.pos-category')
      .filter({ has: page.locator('summary').filter({ hasText: 'Retail' }) })
    await expect(retailCategory).not.toHaveAttribute('open', '')
    await retailCategory.locator('summary').click()
    await expect(retailCategory).toHaveAttribute('open', '')
    await retailCategory.locator('summary').click()
    await expect(retailCategory).not.toHaveAttribute('open', '')
    await expect(tile).toBeVisible()
    await expect(retailCategory.getByRole('button')).toHaveCount(0)
    await page.getByLabel('Product category').selectOption('rooms')
    await expect(tile).toBeVisible()
    await expect(page.getByRole('button', { name: 'Text fallback', exact: true })).toBeVisible()
    await expect.poll(() => imageReads.get('broken') ?? 0).toBeGreaterThan(0)
    await expect(
      page.getByRole('button', { name: 'Unavailable image', exact: true }).locator('img'),
    ).toHaveCount(0)
    await page.getByLabel('Search or scan products').fill('no matching products')
    await expect(tile).toBeVisible()
    await expect(page.locator('.pos-category')).toHaveCount(0)
    await page.getByLabel('Search or scan products').fill('')
    await page.getByLabel('Product category').selectOption('')
    const rooms = page
      .locator('.pos-category')
      .filter({ has: page.locator('summary').filter({ hasText: 'Rooms' }) })
    await expect(rooms).not.toHaveAttribute('open', '')
    await rooms.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(rooms.getByRole('button')).toHaveCount(2)
    await page.keyboard.press('Enter')
    await expect(rooms.getByRole('button')).toHaveCount(0)
    await expect(tile).toBeVisible()
    await rooms.locator('summary').click()
    await page.getByRole('button', { name: 'Text fallback', exact: true }).click()
    await tile.click()
    await expect(page.locator('.pos-cart')).toContainText('Test retail')
    await expect(page.getByLabel('Quantity for Text fallback')).toHaveValue('1')
    assert.equal(
      imageReads.get('retail'),
      1,
      'Favorites and category reuse the same authenticated image read',
    )
    assert.equal(fixture.commits(), 0)
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: 'artifacts/pos-catalog-images.png' })
    assert.deepEqual(errors, [])
    console.log(
      'POS catalog passed: image tiles, accessible names, text/error fallback, collapsible categories, persistent top favorites, filtering, keyboard toggles, deduplicated image reads and cart additions. All HTTPS intercepted.',
    )
  } else if (renewalSmoke) {
    const oldExpiry = docs.get('members/buyer').id_expiration
    const memberBefore = structuredClone(docs.get('members/buyer'))
    async function createBuyerOrder() {
      await page.getByRole('link', { name: 'Members', exact: true }).click()
      const row = page.getByRole('row').filter({ hasText: 'Alex Buyer' })
      await row.getByRole('button', { name: 'Create order', exact: true }).click()
      await expect(page.getByText('Your register is open')).toBeVisible()
    }
    await createBuyerOrder()
    await expect(
      page.getByRole('dialog', { name: 'Add membership to order', exact: true }),
    ).toHaveCount(0)
    async function chooseMembership(mode) {
      await expandCategories(page)
      await page.locator('.pos-product').filter({ hasText: 'Monthly plan' }).click()
      const choice = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
      await choice.getByRole('button', { name: 'Find membership recipient', exact: true }).click()
      const picker = page.getByRole('dialog', { name: 'Choose existing member' })
      await picker.getByRole('button').filter({ hasText: 'Alex Buyer' }).click()
      await expect(choice.locator('.membership-renewal-options')).toBeVisible()
      await expect(choice.locator('.membership-renewal-option')).toHaveCount(2)
      const restartDate = await page.evaluate(
        (value) =>
          new Date(value).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        Date.now() + 30 * 86400000,
      )
      const extendDate = await page.evaluate(
        (value) =>
          new Date(value).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        docs.get('members/buyer').id_expiration * 1000 + 30 * 86400000,
      )
      await expect(choice.locator('.membership-renewal-option').first()).toContainText(restartDate)
      await expect(choice.locator('.membership-renewal-option').last()).toContainText(extendDate)
      await choice
        .getByRole('radio', {
          name: mode === 'restart' ? 'Start from today' : 'Add to existing expiration',
          exact: true,
        })
        .check()
      await mkdir('artifacts', { recursive: true })
      await choice.screenshot({ path: 'artifacts/membership-renewal-active.png' })
      await choice.getByRole('button', { name: 'Add membership to order', exact: true }).click()
      await expect(choice).toHaveCount(0)
    }
    await chooseMembership('extend')
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    let payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByRole('button', { name: 'Back to cart' }).click()
    assert.deepEqual(docs.get('members/buyer'), memberBefore)
    assert.equal(fixture.commits(), 0)
    // Draft survives leaving POS and retains its explicit recipient and mode.
    await page.getByRole('link', { name: 'Registers', exact: true }).click()
    await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
    await expect(page.getByText('Membership renewal for', { exact: false })).toContainText(
      'Alex Buyer',
    )
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    await expect(payment.getByRole('button', { name: 'Retry same sale' })).toBeVisible()
    await payment.getByRole('button', { name: 'Retry same sale' }).click()
    let receipt = page.getByRole('dialog', { name: 'Sale receipt', exact: true })
    await expect(receipt.locator('pre')).toContainText('Membership renewal: Alex Buyer')
    await expect(receipt.locator('pre')).toContainText('Add to existing expiration')
    assert.equal(docs.get('members/buyer').id_expiration, oldExpiry + 30 * 86400)
    assert.equal(fixture.commits(), 1)
    const extended = docs.get('members/buyer').id_expiration
    await receipt.getByRole('button', { name: 'Done', exact: true }).click()
    await chooseMembership('restart')
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    receipt = page.getByRole('dialog', { name: 'Sale receipt', exact: true })
    await expect(receipt.locator('pre')).toContainText('Start from today')
    assert.ok(docs.get('members/buyer').id_expiration < extended)
    assert.ok(
      Math.abs(
        docs.get('members/buyer').id_expiration - (Math.floor(Date.now() / 1000) + 30 * 86400),
      ) < 5,
    )
    assert.equal(fixture.commits(), 2)
    assert.equal(docs.get('members/buyer').id_number, memberBefore.id_number)
    await receipt.getByRole('button', { name: 'Done', exact: true }).click()
    const expired = Math.floor(Date.now() / 1000) - 86400
    docs.get('members/buyer').id_expiration = expired
    await createBuyerOrder()
    const automatic = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
    await expect(automatic.getByRole('heading', { name: 'Renew expired membership' })).toBeVisible()
    await expect(automatic.getByRole('combobox', { name: 'Membership recipient' })).toHaveValue(
      'buyer',
    )
    await expect(automatic.getByRole('combobox', { name: 'Membership recipient' })).toBeDisabled()
    await expect(automatic.getByLabel('Membership product')).toHaveValue('plan')
    await automatic.getByRole('button', { name: 'Continue without renewal', exact: true }).click()
    assert.equal(docs.get('members/buyer').id_expiration, expired)
    assert.equal(fixture.commits(), 2)
    await page.getByRole('link', { name: 'Registers', exact: true }).click()
    await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
    await expect(automatic).toHaveCount(0)
    await createBuyerOrder()
    await expect(automatic.getByRole('radio')).toHaveCount(0)
    await expect(automatic.getByRole('status')).toContainText('Starts from now automatically')
    await expect(automatic.locator('.membership-auto-start')).toContainText('Expires')
    await automatic.screenshot({ path: 'artifacts/membership-renewal-expired.png' })
    await automatic.getByRole('button', { name: 'Add membership to order', exact: true }).click()
    const draft = await page.evaluate(
      ({ uid, club }) => JSON.parse(localStorage.getItem(`cerms.pos.${uid}.${club}`)),
      { uid, club },
    )
    assert.equal(draft.cart[0].memberships[0].mode, 'restart')
    assert.equal(docs.get('members/buyer').id_expiration, expired)
    assert.equal(fixture.commits(), 2)
    assert.deepEqual(errors, [])
    console.log(
      'Membership renewal POS passed: active/expired Create order prompts, preselected recipient, canceled prompt, existing recipient, cancel without mutation, draft restoration, extension, lost-response retry, restart and receipt snapshots. All HTTPS intercepted.',
    )
  } else if (membershipSmoke) {
    await page.getByRole('link', { name: 'Members', exact: true }).click()
    await page.getByRole('button', { name: 'Create membership', exact: true }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('First name', { exact: true }).fill('Synthetic')
    await form.getByLabel('Last name', { exact: true }).fill('Guest')
    await form.getByLabel('Date of birth', { exact: true }).fill('1990-01-02')
    await form.getByLabel('ID state or type', { exact: true }).selectOption('TX')
    await form.getByLabel('ID number', { exact: true }).fill('FAKE-CHECKOUT-1')
    await form.getByLabel('Type of membership', { exact: true }).selectOption('plan')
    await form.getByRole('button', { name: 'Continue to checkout' }).click()
    await expect(page.locator('.pos-cart')).toContainText('Monthly plan')
    assert.equal(
      [...docs.keys()].filter((k) => k.startsWith('members/')).length,
      groupSmoke ? 2 : 0,
    )
    let firstPendingId, secondPendingId
    if (groupSmoke) {
      firstPendingId = await page.getByLabel('Order linked to', { exact: true }).inputValue()
      await page.getByRole('button', { name: 'Add membership', exact: true }).click()
      await page
        .getByRole('dialog', { name: 'Add membership to order', exact: true })
        .getByRole('button', { name: 'Create new membership', exact: true })
        .click()
      const another = page.getByRole('dialog', { name: 'Create member · Dev System' })
      await another.getByLabel('First name', { exact: true }).fill('Second')
      await another.getByLabel('Last name', { exact: true }).fill('Guest')
      await another.getByLabel('Date of birth', { exact: true }).fill('1990-01-02')
      await another.getByLabel('ID state or type', { exact: true }).selectOption('TX')
      await another.getByLabel('ID number', { exact: true }).fill('FAKE-CHECKOUT-2')
      await another.getByLabel('Type of membership', { exact: true }).selectOption('plan')
      await another.getByRole('button', { name: 'Add membership to order', exact: true }).click()
      secondPendingId = await page
        .getByLabel('Order linked to', { exact: true })
        .locator('option')
        .filter({ hasText: 'Second Guest' })
        .getAttribute('value')
      await expect(page.getByLabel('Quantity for Monthly plan')).toHaveValue('2')
    }
    await expandCategories(page)
    await page.locator('.pos-product').filter({ hasText: 'Room rental' }).click()
    await expect(page.getByRole('button', { name: 'Take payment', exact: true })).toBeDisabled()
    await page.getByLabel('Assigned Room/Number for Room rental', { exact: true }).fill('A-12')
    if (groupSmoke) {
      await expandCategories(page)
      await page.locator('.pos-product').filter({ hasText: 'Room rental' }).click()
      await expandCategories(page)
      await page.locator('.pos-product').filter({ hasText: 'Room rental' }).click()
      await page
        .getByLabel('Assigned member for Room rental 1', { exact: true })
        .selectOption(firstPendingId)
      await page
        .getByLabel('Assigned member for Room rental 2', { exact: true })
        .selectOption(secondPendingId)
      await page.getByLabel('Assigned Room/Number for Room rental 2', { exact: true }).fill('B-9')
      await page.getByLabel('Assigned Room/Number for Room rental 3', { exact: true }).fill('C-4')
      await page.getByRole('button', { name: 'Find existing member', exact: true }).click()
      let picker = page.getByRole('dialog', { name: 'Choose existing member' })
      await picker.getByRole('button', { name: /Alex Buyer/ }).click()
      await expect(page.getByLabel('Order linked to', { exact: true })).toHaveValue('buyer')
      await expect(
        page.getByLabel('Assigned member for Room rental 1', { exact: true }),
      ).toHaveValue(firstPendingId)
      await expect(
        page
          .getByLabel('Assigned member for Room rental 3', { exact: true })
          .locator('option')
          .first(),
      ).toHaveText('Order member: Alex Buyer')
      await page
        .getByLabel('Assigned member for Room rental 3', { exact: true })
        .selectOption('__find')
      picker = page.getByRole('dialog', { name: 'Choose existing member' })
      await picker.getByRole('button', { name: /Casey Friend/ }).click()
      await expect(page.getByLabel('Order linked to', { exact: true })).toHaveValue('buyer')
      await page.getByLabel('Order linked to', { exact: true }).selectOption(secondPendingId)
      await expect(
        page.getByLabel('Assigned member for Room rental 3', { exact: true }),
      ).toHaveValue('friend')
      await page.getByLabel('Order linked to', { exact: true }).selectOption('buyer')
      // Leaving and reopening the cart must preserve pending members and per-unit assignments.
      await page.getByRole('link', { name: 'Registers', exact: true }).click()
      await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
      await expect(page.getByLabel('Order linked to', { exact: true })).toHaveValue('buyer')
      await expect(
        page.getByLabel('Assigned member for Room rental 2', { exact: true }),
      ).toHaveValue(secondPendingId)
      await expect(
        page.getByLabel('Assigned Room/Number for Room rental 3', { exact: true }),
      ).toHaveValue('C-4')
      assert.equal(fixture.commits(), 0)
      await mkdir('artifacts', { recursive: true })
      await expandCategories(page)
      await expect(page.locator('.pos-product').filter({ hasText: 'Test retail' })).toBeEnabled()
      await page.screenshot({ path: 'artifacts/group-order-cart.png' })
    }
    await expandCategories(page)
    await page.locator('.pos-product').filter({ hasText: 'Test retail' }).click()
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    let payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByRole('button', { name: 'Back to cart' }).click()
    assert.equal(
      [...docs.keys()].filter((k) => k.startsWith('members/')).length,
      groupSmoke ? 2 : 0,
    )
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    await expect(payment.getByRole('button', { name: 'Retry same sale' })).toBeVisible()
    await payment.getByRole('button', { name: 'Retry same sale' }).click()
    const receipt = page.getByRole('dialog', { name: 'Sale receipt', exact: true })
    await expect(receipt.locator('pre')).toContainText('Assigned Room/Number: A-12')
    assert.equal(fixture.commits(), 1)
    const memberEntry = [...docs].find(
      ([k, m]) => k.startsWith('members/') && m.name === 'Synthetic Guest',
    )
    const savedMember = memberEntry[1]
    const sale = [...docs].find(([k]) => k.startsWith('system/dev/sales/'))[1]
    assert.equal(sale.member.id, groupSmoke ? 'buyer' : memberEntry[0].slice(8))
    assert.equal(sale.lines.length, 3)
    const visit = [...docs].find(([k]) => k.startsWith('activity/'))[1]
    assert.equal(visit.memberID, memberEntry[0].slice(8))
    if (groupSmoke) {
      assert.equal(sale.memberships.length, 2)
      assert.equal(sale.rentals.length, 3)
      assert.deepEqual(
        sale.rentals.map((r) => r.memberId),
        [firstPendingId, secondPendingId, 'friend'],
      )
      assert.equal(docs.get('members/buyer').checkedIn, false)
      assert.equal(docs.get('members/friend').checkedIn, true)
      assert.equal([...docs.keys()].filter((k) => k.startsWith('activity/')).length, 3)
    }
    assert.equal(visit.lockerRoomStatus[1], 'A-12')
    await receipt.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('link', { name: 'Members', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: 'Synthetic Guest' })
    await expect(row.getByRole('button', { name: 'Create order', exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Check in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Select rentals for check-in' })).toBeVisible()
    await expandCategories(page)
    await page.locator('.pos-product').filter({ hasText: 'Room rental' }).click()
    await page.getByLabel('Assigned Room/Number for Room rental', { exact: true }).fill('B-9')
    await page.getByRole('button', { name: 'Continue to order', exact: true }).click()
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    await expect(payment.getByRole('alert')).toContainText('active visit')
    assert.equal(fixture.commits(), 1)
    await payment.getByRole('button', { name: 'Back to cart' }).click()
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    const admission = {
      id: [...docs.keys()].find((k) => k.startsWith('activity/')).slice(9),
      editRevision: 0,
      memberId: memberEntry[0].slice(8),
      memberName: savedMember.name,
      memberNumber: String(savedMember.id_number),
      membershipType: savedMember.membership_type,
      memberStatus: 'ready',
      active: visit.active,
      inside: visit.currIn,
      waiting: false,
      rentalEnabled: true,
      rental: visit.lockerRoomStatus[2],
      location: visit.lockerRoomStatus[1],
      rentalStartedAt: visit.lockerRoomStatus[4] * 1000,
      expiresAt: visit.lockerRoomStatus[5] * 1000,
      enteredAt: Date.now(),
      dna: false,
      tagged: false,
      notes: '',
      removedMember: false,
    }
    for (const hash of ['overview', 'activity']) {
      await page.evaluate((h) => {
        location.hash = h
      }, hash)
      await expect(page.getByText('Live updates', { exact: true })).toBeVisible()
      await page.evaluate(
        (row) =>
          window.dispatchEvent(
            new CustomEvent('admissions-fixture', {
              detail: { rows: [row], status: 'live' },
            }),
          ),
        admission,
      )
      await expect(page.getByRole('row').filter({ hasText: savedMember.name })).toContainText(
        'Room rental · A-12',
      )
      const rentalRow = page.getByRole('row').filter({ hasText: savedMember.name })
      const publishRental = (row, status = 'live') =>
        page.evaluate(
          ({ row, status }) =>
            window.dispatchEvent(
              new CustomEvent('admissions-fixture', { detail: { rows: [row], status } }),
            ),
          { row, status },
        )
      await publishRental({ ...admission, expiresAt: Date.now() + 3600000 })
      await expect(rentalRow.getByRole('button', { name: /^Edit rental for/ })).toBeEnabled()
      await expect(rentalRow.getByRole('button', { name: /^Check out rental for/ })).toBeEnabled()
      await expect(rentalRow.getByRole('button', { name: /^Renew rental for/ })).toHaveCount(0)
      await publishRental(admission, 'reconnecting')
      await expect(rentalRow.getByRole('button', { name: /^Edit rental for/ })).toBeDisabled()
      await expect(rentalRow.getByRole('button', { name: /^Check out rental for/ })).toBeDisabled()
      await publishRental({ ...admission, rentalEnabled: false })
      await expect(rentalRow.getByRole('button', { name: /^Edit rental for/ })).toHaveCount(0)
      await expect(rentalRow.getByRole('button', { name: /^Check out rental for/ })).toHaveCount(0)
      await publishRental({ ...admission, expiresAt: Date.now() - 5000 })
      await expect(rentalRow.getByRole('button', { name: /^Renew rental for/ })).toBeVisible()
      await mkdir('artifacts', { recursive: true })
      await page.screenshot({ path: `artifacts/rental-row-actions-${hash}.png` })
      await rentalRow.getByRole('button', { name: /^Renew rental for/ }).click()
      const renewal = page.getByRole('dialog', { name: savedMember.name, exact: true })
      await expect(renewal.getByRole('button', { name: 'Renew in order' })).toBeEnabled()
      await expect(renewal.getByLabel('Assigned Room/Number', { exact: true })).toHaveCount(0)
      await expect(renewal.getByRole('button', { name: 'Confirm rental checkout' })).toHaveCount(0)
      await renewal.getByRole('button', { name: 'Close', exact: true }).click()
      await publishRental(admission)
    }
    // Exercise the shared visit editor on both entry points, then paid renewal.
    const beforeExpiry = visit.lockerRoomStatus[5]
    for (const hash of ['overview', 'activity']) {
      await page.evaluate((h) => {
        location.hash = h
      }, hash)
      await expect(page.getByText('Live updates', { exact: true })).toBeVisible()
      await page.evaluate(
        (row) =>
          window.dispatchEvent(
            new CustomEvent('admissions-fixture', { detail: { rows: [row], status: 'live' } }),
          ),
        admission,
      )
      await page
        .getByRole('row')
        .filter({ hasText: savedMember.name })
        .getByRole('button', { name: /^Edit rental for/ })
        .click()
      const details = page.getByRole('dialog', { name: savedMember.name, exact: true })
      await expect(details.getByLabel('Assigned Room/Number', { exact: true })).toBeFocused()
      await expect(details.getByRole('button', { name: 'Renew in order' })).toHaveCount(0)
      await details.getByLabel('Assigned Room/Number', { exact: true }).fill('C-22')
      await details.getByLabel('Visit notes', { exact: true }).fill('Renewal fixture note')
      await details.getByLabel('Inside (off = outside)').uncheck()
      await details.getByLabel('On waitlist').check()
      await details.getByRole('button', { name: 'Save rental changes' }).click()
      await expect(details.getByRole('status')).toContainText('saved')
      const updated = docs.get('activity/' + admission.id)
      assert.equal(updated.currIn, false)
      assert.equal(updated.waitlist, true)
      assert.equal(updated.lockerRoomStatus[1], 'C-22')
      assert.equal(updated.lockerRoomStatus[5], beforeExpiry)
      Object.assign(admission, {
        editRevision: updated.editRevision,
        inside: false,
        waiting: true,
        location: 'C-22',
        notes: updated.notes,
      })
      await page.evaluate(
        (row) =>
          window.dispatchEvent(
            new CustomEvent('admissions-fixture', { detail: { rows: [row], status: 'live' } }),
          ),
        admission,
      )
      if (hash === 'overview')
        await details.getByRole('button', { name: 'Close', exact: true }).click()
      else {
        // Discard the deliberately failed duplicate-check-in cart from above.
        await page.evaluate(
          ({ uid, club }) => localStorage.removeItem(`cerms.pos.${uid}.${club}`),
          { uid, club },
        )
        await details.getByRole('button', { name: 'Close', exact: true }).click()
        await page.evaluate(
          (row) =>
            window.dispatchEvent(
              new CustomEvent('admissions-fixture', {
                detail: { rows: [{ ...row, expiresAt: Date.now() - 5000 }], status: 'live' },
              }),
            ),
          admission,
        )
        await page
          .getByRole('row')
          .filter({ hasText: savedMember.name })
          .getByRole('button', { name: /^Renew rental for/ })
          .click()
        await details.getByRole('button', { name: 'Renew in order' }).click()
      }
    }
    await expect(
      page.getByLabel('Assigned Room/Number for Room rental', { exact: true }),
    ).toHaveValue('C-22')
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByRole('button', { name: 'Back to cart' }).click()
    assert.equal(docs.get('activity/' + admission.id).lockerRoomStatus[5], beforeExpiry)
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await payment.getByLabel('Payment amount 1').dblclick()
    await payment.getByRole('button', { name: 'Complete sale', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Sale receipt', exact: true })).toBeVisible()
    assert.equal(docs.get('activity/' + admission.id).lockerRoomStatus[5], beforeExpiry + 7200)
    assert.equal(
      [...docs.keys()].filter((k) => k.startsWith('activity/')).length,
      groupSmoke ? 3 : 1,
    )
    await expect(page.getByRole('dialog', { name: 'Sale receipt', exact: true })).toContainText(
      'Rental renewal',
    )
    // Both entry points require both explicit confirmations; cancellation has no writes.
    await page
      .getByRole('dialog', { name: 'Sale receipt', exact: true })
      .getByRole('button', { name: 'Done', exact: true })
      .click()
    for (const hash of ['overview', 'activity']) {
      const v = docs.get('activity/' + admission.id)
      // Restore only synthetic fixture state to exercise the same rental on each page.
      v.active = true
      savedMember.checkedIn = true
      docs.set(`system/${club}/memberVisits/${admission.memberId}`, {
        memberId: admission.memberId,
        visitIds: [admission.id],
      })
      Object.assign(admission, {
        active: true,
        editRevision: v.editRevision,
        expiresAt: v.lockerRoomStatus[5] * 1000,
      })
      await page.evaluate((h) => {
        location.hash = h
      }, hash)
      await expect(page.getByText('Live updates', { exact: true })).toBeVisible()
      await page.evaluate(
        (row) =>
          window.dispatchEvent(
            new CustomEvent('admissions-fixture', {
              detail: { rows: [row], status: 'live' },
            }),
          ),
        admission,
      )
      const checkoutShortcut = page
        .getByRole('row')
        .filter({ hasText: savedMember.name })
        .getByRole('button', { name: /^Check out rental for/ })
      await checkoutShortcut.click()
      const details = page.getByRole('dialog', { name: savedMember.name, exact: true })
      await expect(details.getByLabel('Assigned Room/Number', { exact: true })).toHaveCount(0)
      await expect(details.getByRole('button', { name: 'Renew in order' })).toHaveCount(0)
      const confirm = details.getByRole('button', { name: 'Confirm rental checkout', exact: true })
      await expect(confirm).toBeDisabled()
      await details.getByLabel('The rental is completed', { exact: true }).check()
      await expect(confirm).toBeDisabled()
      await details.getByRole('button', { name: 'Cancel checkout' }).click()
      await expect(details).not.toBeVisible()
      assert.equal(docs.get('activity/' + admission.id).active, true)
      await checkoutShortcut.click()
      await expect(details.getByLabel('The rental is completed', { exact: true })).not.toBeChecked()
      await details.getByLabel('The rental is completed', { exact: true }).check()
      await details.getByLabel('All required items have been returned', { exact: true }).check()
      await confirm.click()
      await expect(details).not.toBeVisible()
      assert.equal(docs.get('activity/' + admission.id).active, false)
    }
    console.log(
      'Rental edit/in-out/waitlist, canceled/completed renewal, and two-confirmation rental checkout on both pages passed.',
    )
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: 'artifacts/member-checkout.png' })
    assert.deepEqual(errors, [])
    if (groupSmoke)
      console.log(
        'Group order verified: repeated memberships/rentals, recipient overrides, primary member switching, cart recovery and single atomic commit.',
      )
    console.log(
      'Member checkout smoke passed: deferred creation, added retail/rental, assignment, canceled payment, lost-response retry, linked receipt, duplicate check-in rejection, member actions and both admission views. All HTTPS intercepted.',
    )
  } else {
    await page.getByLabel('Product category').selectOption('retail')
    await page.getByLabel('Search or scan products').fill('12345')
    await page.getByLabel('Search or scan products').press('Enter')
    await page.getByLabel('Quantity for Test retail').fill('2')
    await page.getByRole('button', { name: 'Take payment', exact: true }).click()
    const payment = page.getByRole('dialog', { name: 'Take payment', exact: true })
    await expect(payment.getByLabel('Payment method 1')).toHaveValue('cash')
    await expect(payment.getByLabel('Payment amount 1')).toHaveValue('')
    await payment.getByLabel('Payment amount 1').fill('10.00')
    await payment.getByRole('button', { name: 'Add payment method' }).click()
    await payment.getByLabel('Payment amount 2').fill('1.00')
    await payment.getByLabel('Payment amount 2').dblclick()
    await expect(payment.getByLabel('Payment amount 2')).toHaveValue('11.60')
    await payment.getByLabel('Payment amount 1').fill('20.00')
    await expect(payment.getByLabel('Cash received', { exact: true })).toHaveCount(0)
    await expect(payment.getByRole('checkbox')).toHaveCount(0)
    await expect(payment.getByText('$10.00', { exact: true })).toBeVisible()
    await mkdir('artifacts', { recursive: true })
    await payment.screenshot({ path: 'artifacts/pos-payment.png' })
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
    await expect(page.getByRole('button', { name: 'View / print' })).toBeVisible()
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
    const closeout = page.getByRole('dialog', { name: 'Register closeout report' })
    await expect(closeout.locator('pre')).toContainText('REGISTER CLOSEOUT')
    await closeout.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('link', { name: 'Point of sale', exact: true }).click()
    await expect(
      page.getByText('Open your register before checkout.', { exact: false }),
    ).toBeVisible()
    await page.screenshot({ path: 'artifacts/pos-workspace.png' })
    assert.deepEqual(errors, [])
    console.log(
      'POS smoke passed: barcode, split payment/change, uncertain-save retry, receipt printing/reopen, tax settings and register close. All HTTPS intercepted; no real payments, writes or print jobs.',
    )
  }
} finally {
  if (originalDraft !== undefined)
    await (
      await app.firstWindow()
    )
      .evaluate(
        ({ uid, club, prior }) => {
          const key = `cerms.pos.${uid}.${club}`
          if (prior === null) localStorage.removeItem(key)
          else localStorage.setItem(key, prior)
        },
        { uid, club, prior: originalDraft },
      )
      .catch(() => {})
  await app.close()
}
