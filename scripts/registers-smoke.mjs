import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { registerOpen } from './fixtures/registers.mjs'

// All external requests are intercepted. No real credentials or Firebase requests.
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 20000 })
const base = 'projects/cerms-7af24/databases/cerms/documents'
const uid = 'register-staff',
  club = 'fixture-club'
const documents = new Map(),
  errors = []
let commits = 0,
  denyClose = false,
  denyReportTotals = false
const str = (stringValue) => ({ stringValue })
const timestamp = '2026-09-30T12:00:00Z'
const otherId = '20000000-0000-4000-8000-000000000000'
const other = registerOpen(base, club, 'other-staff', otherId).writes[0].update
other.fields.ownerName = str('Other Cashier')
other.fields.openedAt = { timestampValue: timestamp }
documents.set(other.name, other)
documents.set(`${base}/system/${club}`, {
  name: `${base}/system/${club}`,
  fields: { businessName: str('Synthetic Club') },
})
function timed(document) {
  return { ...document, createTime: timestamp, updateTime: timestamp }
}
try {
  const admissions = await readFile(
    new URL('./fixtures/admissions-module.mjs', import.meta.url),
    'utf8',
  )
  await app
    .context()
    .route('cerms://app/assets/firebase-admissions-*.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: admissions }),
    )
  await app.context().route('https://**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    const respond = (data) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (url.pathname.endsWith(':signInWithPassword')) {
        const now = Math.floor(Date.now() / 1000)
        const payload = Buffer.from(
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
          email: 'register@example.test',
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
              email: 'register@example.test',
              emailVerified: true,
              displayName: 'Synthetic Staff',
              providerUserInfo: [
                {
                  providerId: 'password',
                  email: 'register@example.test',
                  federatedId: 'register@example.test',
                },
              ],
            },
          ],
        })
    }
    if (url.hostname === 'firestore.googleapis.com') {
      assert.ok(
        url.pathname.startsWith('/v1/' + base),
        'Only the named cerms database is requested',
      )
      const body = request.postDataJSON()
      if (
        url.pathname.endsWith(':batchGet') &&
        denyReportTotals &&
        body.documents.some((name) => name.includes('/registerTotals/'))
      )
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED' } }),
        })
      if (url.pathname.endsWith(':batchGet'))
        return respond(
          body.documents.map((name) => {
            if (name === `${base}/users/${uid}`)
              return {
                found: timed({
                  name,
                  fields: { uid: str(uid), displayName: str('Synthetic Staff'), access: str(club) },
                }),
              }
            return documents.has(name)
              ? { found: timed(documents.get(name)) }
              : { missing: name, readTime: timestamp }
          }),
        )
      if (url.pathname.endsWith(':runQuery')) {
        const q = body.structuredQuery
        assert.equal(url.pathname, `/v1/${base}/system/${club}:runQuery`)
        assert.equal(q.from[0].collectionId, 'registers')
        assert.equal(q.limit, 50)
        const status = q.where.fieldFilter.value.stringValue
        let rows = [...documents.values()].filter(
          (d) => d.name.includes('/registers/') && d.fields.status.stringValue === status,
        )
        rows.sort(
          (a, b) =>
            b.fields.openedAt.timestampValue.localeCompare(a.fields.openedAt.timestampValue) ||
            b.name.localeCompare(a.name),
        )
        if (q.startAt)
          rows = rows.slice(
            rows.findIndex((d) => d.name === q.startAt.values.at(-1).referenceValue) + 1,
          )
        return respond(rows.slice(0, 50).map((d) => ({ document: timed(d) })))
      }
      if (url.pathname.endsWith(':commit')) {
        const closing = body.writes[0].update.fields.status.stringValue === 'closed'
        if (closing && denyClose)
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED' } }),
          })
        assert.equal(body.writes.length, closing ? 1 : 2)
        for (const write of body.writes) {
          assert.ok(write.update.name.startsWith(`${base}/system/${club}/register`))
          const prior = documents.get(write.update.name)
          if (!closing && write.update.name.includes('/registers/')) assert.equal(prior, undefined)
          if (closing) assert.equal(write.update.fields.closedByUid.stringValue, uid)
          const fields = { ...(prior?.fields ?? {}), ...write.update.fields }
          for (const transform of write.updateTransforms ?? [])
            fields[transform.fieldPath] = { timestampValue: '2026-09-30T13:00:00Z' }
          documents.set(write.update.name, { name: write.update.name, fields })
        }
        commits++
        return respond({
          writeResults: body.writes.map(() => ({ updateTime: timestamp })),
          commitTime: timestamp,
        })
      }
    }
    errors.push(`Unexpected network request: ${url.hostname}${url.pathname}`)
    return route.abort()
  })
  const page = await app.firstWindow({ timeout: 20000 })
  await app.evaluate(({ app, BrowserWindow }) => {
    globalThis.closeoutPrints = []
    globalThis.failNextCloseoutPrint = false
    const stub = (wc) => {
      wc.getPrintersAsync = async () => [
        { name: 'Synthetic RP326', displayName: 'Synthetic RP326' },
      ]
      wc.print = (options, callback) => {
        globalThis.closeoutPrints.push({
          options,
          html: decodeURIComponent(wc.getURL().split(',').slice(1).join(',')),
        })
        if (globalThis.failNextCloseoutPrint) {
          globalThis.failNextCloseoutPrint = false
          callback(false, 'Synthetic printer unavailable')
        } else callback(true, '')
      }
    }
    BrowserWindow.getAllWindows().forEach((window) => stub(window.webContents))
    app.on('web-contents-created', (_event, wc) => stub(wc))
  })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByLabel('Email', { exact: true }).fill('register@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.evaluate(() => {
    location.hash = 'registers'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open register', exact: true })).toBeEnabled()
  await expect(page.getByText('Other Cashier', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close my register' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open register', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Open register', exact: true })
  await dialog.getByLabel('$20 bills', { exact: true }).fill('5')
  await dialog.getByLabel('$2 bills', { exact: true }).fill('3')
  await dialog.getByLabel('$1 coins', { exact: true }).fill('2')
  await dialog.getByLabel('50¢ coins', { exact: true }).fill('1')
  await dialog.getByLabel('1¢ coins', { exact: true }).fill('3')
  await expect(dialog.getByRole('status')).toContainText('$108.53')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/register-opening.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Open register', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Close my register' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Open register', exact: true })).toBeDisabled()
  assert.equal(commits, 1)
  const own = [...documents.values()].find((d) => d.fields.ownerUid?.stringValue === uid)
  assert.equal(own.fields.openingTotalCents.integerValue, '10853')
  const int = (value) => ({ integerValue: String(value) })
  documents.set(`${base}/system/${club}/registerTotals/${own.name.split('/').at(-1)}`, {
    name: `${base}/system/${club}/registerTotals/${own.name.split('/').at(-1)}`,
    fields: {
      saleCount: int(2),
      totalCents: int(2160),
      taxCents: int(160),
      expectedCashCents: int(11853),
      cashReceivedCents: int(2000),
      changeGivenCents: int(1000),
      cashPaidOutCents: int(0),
      netByMethod: {
        mapValue: {
          fields: {
            cash: int(1000),
            card: int(1160),
            giftCard: int(0),
            check: int(0),
            other: int(0),
          },
        },
      },
    },
  })
  await page.reload()
  // Authentication intentionally does not persist across renderer reloads.
  await page.getByLabel('Email', { exact: true }).fill('register@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Close my register' }).click()
  dialog = page.getByRole('dialog', { name: 'Close register', exact: true })
  await dialog.getByLabel('$20 bills', { exact: true }).fill('6')
  await dialog.getByLabel('1¢ coins', { exact: true }).fill('3')
  await dialog.getByLabel('Closing note (optional)').fill('Synthetic ending count')
  await expect(dialog.getByRole('status')).toContainText('$120.03')
  denyClose = true
  await dialog.getByRole('button', { name: 'Save ending count and close' }).click()
  await expect(dialog.getByRole('alert')).toContainText('current Firebase rules')
  await expect(dialog.getByLabel('$20 bills', { exact: true })).toHaveValue('6')
  assert.equal(commits, 1)
  await expect(page.getByRole('dialog', { name: 'Register closeout report' })).toHaveCount(0)
  denyClose = false
  denyReportTotals = true
  await dialog.getByRole('button', { name: 'Save ending count and close' }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(commits, 2)
  let report = page.getByRole('dialog', { name: 'Register closeout report' })
  await expect(report.getByRole('alert')).toContainText('register remains closed')
  await expect(
    report.getByRole('button', { name: 'Print closeout report', exact: true }),
  ).toBeDisabled()
  denyReportTotals = false
  await report.getByRole('button', { name: 'Retry loading report' }).click()
  await expect(report.locator('pre')).toContainText('Expected cash: $118.53')
  await expect(report.locator('pre')).toContainText('OVER / SHORT: $1.50')
  await expect(report.locator('pre')).toContainText('Closed by: Synthetic Staff')
  const savedReportText = await report.locator('pre').textContent()
  await report.getByLabel('Receipt printer', { exact: true }).selectOption('Synthetic RP326')
  await report.getByLabel('Paper width', { exact: true }).selectOption('80')
  const savedClosed = JSON.stringify(documents.get(own.name))
  await app.evaluate(() => {
    globalThis.failNextCloseoutPrint = true
  })
  await report.getByRole('button', { name: 'Print closeout report', exact: true }).click()
  await expect(report.getByRole('alert')).toContainText('register remains closed')
  assert.equal(commits, 2)
  assert.equal(JSON.stringify(documents.get(own.name)), savedClosed)
  await report.getByRole('button', { name: 'Print closeout report', exact: true }).click()
  await expect(report.getByRole('status')).toContainText('Closeout report sent to the printer.')
  await page.screenshot({ path: 'artifacts/register-closeout-report.png', fullPage: true })
  const jobs = await app.evaluate(() => globalThis.closeoutPrints)
  assert.equal(jobs.length, 2)
  assert.equal(jobs[1].options.deviceName, 'Synthetic RP326')
  assert.equal(jobs[1].options.silent, false)
  assert.ok(jobs[1].html.includes('width:72mm'))
  assert.ok(jobs[1].html.includes('OVER / SHORT: $1.50'))
  await report.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open register', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Closed registers', exact: true }).click()
  await page.getByRole('button', { name: 'View counts for Synthetic Staff' }).click()
  dialog = page.getByRole('dialog', { name: 'Register counts' })
  await expect(dialog).toContainText('$108.53')
  await expect(dialog).toContainText('$120.03')
  await expect(dialog).toContainText('$11.50')
  await expect(dialog).toContainText('Synthetic ending count')
  await page.screenshot({ path: 'artifacts/register-closed.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Print closeout for Synthetic Staff' }).click()
  report = page.getByRole('dialog', { name: 'Register closeout report' })
  await expect(report.locator('pre')).toHaveText(savedReportText)
  await expect(report.getByLabel('Receipt printer', { exact: true })).toHaveValue('Synthetic RP326')
  await report.getByLabel('Paper width', { exact: true }).selectOption('58')
  await report.getByRole('button', { name: 'Print closeout report', exact: true }).click()
  await expect(report.getByRole('status')).toContainText('Closeout report sent to the printer.')
  const reprinted = await app.evaluate(() => globalThis.closeoutPrints.at(-1))
  assert.ok(reprinted.html.includes('width:50mm'))
  assert.equal(commits, 2)
  await report.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Open register', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Open register', exact: true })
  await dialog.getByRole('button', { name: 'Open register', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(commits, 3)
  assert.equal(documents.get(own.name).fields.status.stringValue, 'closed')
  await expect(page.getByRole('button', { name: 'Close register for Other Cashier' })).toHaveCount(
    0,
  )
  const permissionName = `${base}/system/${club}/staffPermissions/${uid}`
  documents.set(permissionName, {
    name: permissionName,
    fields: {
      permissions: {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries({
              editMembers: false,
              deleteMembers: false,
              manageProducts: false,
              openRegisters: false,
              closeRegisters: false,
              closeOtherRegisters: true,
            }).map(([key, value]) => [key, { booleanValue: value }]),
          ),
        },
      },
    },
  })
  await page.reload()
  await page.getByLabel('Email', { exact: true }).fill('register@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close my register' })).toBeDisabled()
  await page.getByRole('button', { name: 'Open registers', exact: true }).click()
  await page.getByRole('button', { name: 'Close register for Other Cashier' }).click()
  dialog = page.getByRole('dialog', { name: 'Close register', exact: true })
  await expect(dialog).toContainText('Other Cashier')
  await dialog.getByLabel('$20 bills', { exact: true }).fill('7')
  await dialog.getByLabel('Closing note (optional)').fill('Cashier left early')
  await dialog.getByRole('button', { name: 'Save ending count and close' }).click()
  await expect(dialog).toHaveCount(0)
  report = page.getByRole('dialog', { name: 'Register closeout report' })
  await expect(report.locator('pre')).toContainText('Cashier: Other Cashier')
  await expect(report.locator('pre')).toContainText('Closed by: Synthetic Staff')
  await expect(report.locator('pre')).toContainText('Counted cash: $140.00')
  await report.getByRole('button', { name: 'Done', exact: true }).click()
  const closedOther = documents.get(other.name).fields
  assert.equal(closedOther.ownerUid.stringValue, 'other-staff')
  assert.equal(closedOther.closedByUid.stringValue, uid)
  assert.equal(closedOther.closingTotalCents.integerValue, '14000')
  await page.getByRole('button', { name: 'Closed registers', exact: true }).click()
  await page.getByRole('button', { name: 'View counts for Other Cashier' }).click()
  dialog = page.getByRole('dialog', { name: 'Register counts' })
  await expect(dialog).toContainText('Closed by: Synthetic Staff')
  await expect(dialog).toContainText('Cashier left early')
  await expect(dialog).toContainText('$140.00')
  await page.screenshot({ path: 'artifacts/register-manager-close.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'Register smoke passed: opening/closing, manager closeout, saved report preview, load retry, failed/successful printing, 80/58 mm output, history reprint and unchanged saved records. All Firebase and printer requests intercepted.',
  )
} finally {
  await app.close()
}
