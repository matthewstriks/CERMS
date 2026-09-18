import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'

// Every HTTPS request is intercepted. These tests never send credentials or records to Firebase.
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 20000 })
const requests = [],
  queries = [],
  errors = []
let changedAccess = false
let fixtureUid = 'fixture-staff'
let activeClub = 'fixture-club'
let denySwitch = false
let denyProfileReload = false
let commitCount = 0
const ownerUid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const base = 'projects/cerms-7af24/databases/cerms/documents/'
const str = (stringValue) => ({ stringValue })
const integer = (value) => ({ integerValue: String(value) })
function withDocumentTimes(value) {
  if (Array.isArray(value)) return value.map(withDocumentTimes)
  if (!value || typeof value !== 'object') return value
  const result = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, withDocumentTimes(entry)]),
  )
  if (result.name?.startsWith?.(base) && result.fields) {
    result.createTime = '2026-01-01T00:00:00Z'
    result.updateTime = '2026-01-01T00:00:00Z'
  }
  return result
}
const field = (filter, name) => {
  if (!filter) return undefined
  if (filter.fieldFilter?.field.fieldPath === name) return filter.fieldFilter.value
  return filter.compositeFilter?.filters.map((entry) => field(entry, name)).find(Boolean)
}
function record(id) {
  return {
    name: base + 'members/member-' + id,
    fields: {
      access: str(activeClub),
      name: str(
        `${activeClub === 'fixture-club' ? 'Test' : 'Other'} Member ${String(id).padStart(2, '0')}`,
      ),
      id_number: integer(1000 + id),
      dob: str('1980-02-09'),
      membership_type: str('Annual'),
      id_expiration: integer(4102444800),
      creation_time: { timestampValue: '2026-01-01T00:00:00Z' },
      dna: { booleanValue: id === 2 },
      tag: { booleanValue: true },
      waiver_status: { booleanValue: true },
      notes: { arrayValue: { values: [str('Fixture note — never written to Firebase.')] } },
      idnum: str('001234'),
      idstate: str('TX'),
      email: str('fixture@example.test'),
    },
  }
}
try {
  const admissionsFixture = await readFile(
    new URL('./fixtures/admissions-module.mjs', import.meta.url),
    'utf8',
  )
  await app
    .context()
    .route('cerms://app/assets/firebase-admissions-*.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: admissionsFixture }),
    )
  await app.context().route('https://**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    requests.push({ host: url.hostname, path: url.pathname, method: request.method() })
    const respond = (json) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(withDocumentTimes(json)),
      })
    if (
      url.hostname === 'identitytoolkit.googleapis.com' &&
      url.pathname.endsWith(':sendOobCode')
    ) {
      assert.equal(request.postDataJSON().requestType, 'PASSWORD_RESET')
      return respond({ email: 'fixture@example.test' })
    }
    if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith(':lookup')) {
      return respond({
        users: [
          {
            localId: fixtureUid,
            email: 'fixture@example.test',
            emailVerified: true,
            displayName: 'Fixture Staff',
            providerUserInfo: [
              {
                providerId: 'password',
                email: 'fixture@example.test',
                federatedId: 'fixture@example.test',
              },
            ],
          },
        ],
      })
    }
    if (
      url.hostname === 'identitytoolkit.googleapis.com' &&
      url.pathname.endsWith(':signInWithPassword')
    ) {
      const now = Math.floor(Date.now() / 1000)
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://securetoken.google.com/cerms-7af24',
          aud: 'cerms-7af24',
          sub: fixtureUid,
          user_id: fixtureUid,
          iat: now,
          exp: now + 3600,
          auth_time: now,
          firebase: { sign_in_provider: 'password' },
        }),
      ).toString('base64url')
      return respond({
        localId: fixtureUid,
        email: 'fixture@example.test',
        idToken: `eyJhbGciOiJSUzI1NiJ9.${payload}.fixture`,
        refreshToken: 'fixture-only',
        expiresIn: '3600',
      })
    }
    if (url.hostname === 'firestore.googleapis.com' && url.pathname.endsWith(':commit')) {
      commitCount++
      const body = request.postDataJSON()
      assert.equal(fixtureUid, ownerUid)
      assert.equal(body.writes.length, 1)
      const target = body.writes[0].update.fields.access.stringValue
      assert.ok(['fixture-club', 'other-club'].includes(target))
      assert.deepEqual(body, {
        writes: [
          {
            update: { name: base + 'users/' + ownerUid, fields: { access: str(target) } },
            updateMask: { fieldPaths: ['access'] },
            currentDocument: { exists: true },
          },
        ],
      })
      if (denySwitch)
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 403, status: 'PERMISSION_DENIED', message: 'Fixture denial' },
          }),
        })
      activeClub = target
      return respond({
        writeResults: [{ updateTime: '2026-01-02T00:00:00Z' }],
        commitTime: '2026-01-02T00:00:00Z',
      })
    }
    if (url.hostname === 'firestore.googleapis.com' && url.pathname.endsWith(':batchGet')) {
      assert.equal(url.pathname, '/v1/' + base.slice(0, -1) + ':batchGet')
      const body = request.postDataJSON()
      if (
        denyProfileReload &&
        body.documents.some((name) => name.includes('/users/')) &&
        activeClub === 'fixture-club'
      )
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 403, status: 'PERMISSION_DENIED', message: 'Fixture reload denial' },
          }),
        })
      return respond(
        body.documents.map((name) => ({
          found: name.includes('/users/')
            ? {
                name,
                fields: {
                  access: str(changedAccess ? 'different-club' : activeClub),
                  displayName: str('Fixture Staff'),
                },
              }
            : name.includes('/system/')
              ? {
                  name,
                  fields: {
                    businessName: str(name.endsWith('other-club') ? 'Other Club' : 'Fixture Club'),
                  },
                }
              : record(1),
          readTime: '2026-01-01T00:00:00Z',
        })),
      )
    }
    if (url.hostname === 'firestore.googleapis.com' && url.pathname.endsWith(':runQuery')) {
      assert.equal(url.pathname, '/v1/' + base.slice(0, -1) + ':runQuery')
      const q = request.postDataJSON().structuredQuery
      queries.push(q)
      if (q.from[0].collectionId === 'system') {
        assert.equal(fixtureUid, ownerUid, 'Other accounts cannot list systems')
        return respond(
          ['fixture-club', 'other-club'].map((id) => ({
            document: {
              name: base + 'system/' + id,
              fields: { businessName: str(id === 'fixture-club' ? 'Fixture Club' : 'Other Club') },
            },
          })),
        )
      }
      assert.equal(
        field(q.where, 'access')?.stringValue,
        activeClub,
        'Every query must be club-scoped',
      )
      const collection = q.from[0].collectionId
      let records = []
      if (collection === 'members') {
        if (q.startAt) records = [record(26)]
        else if (field(q.where, 'dna')) records = [record(2)]
        else if (field(q.where, 'idnum')) records = [record(1)]
        else if (field(q.where, 'dob')) records = [record(1)]
        else records = Array.from({ length: 26 }, (_, index) => record(index + 1))
      } else if (collection === 'activity') {
        assert.equal(field(q.where, 'memberID')?.stringValue, 'member-1')
        records = [
          {
            name: base + 'activity/visit-1',
            fields: {
              access: str(activeClub),
              timeIn: { timestampValue: '2026-01-01T01:00:00Z' },
              timeOut: { timestampValue: '2026-01-01T03:00:00Z' },
              lockerRoomStatus: {
                arrayValue: { values: [{ booleanValue: true }, str('12'), str('Locker')] },
              },
            },
          },
        ]
      } else if (collection === 'orders') {
        assert.equal(field(q.where, 'customerID')?.stringValue, 'member-1')
        records = [
          {
            name: base + 'orders/order-1',
            fields: {
              access: str(activeClub),
              timestamp: { timestampValue: '2026-01-01T01:00:00Z' },
              paymentMethod: { arrayValue: { values: [integer(20), integer(0), integer(0)] } },
              total: {
                arrayValue: { values: [integer(20), integer(0), integer(20), integer(20)] },
              },
            },
          },
        ]
      }
      return respond(records.map((document) => ({ document, readTime: '2026-01-01T00:00:00Z' })))
    }
    errors.push(`Unexpected network request: ${url.hostname}${url.pathname}`)
    await route.abort()
  })
  const page = await app.firstWindow({ timeout: 20000 })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !denySwitch && !denyProfileReload) errors.push(message.text())
  })
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await page.getByText('If this email belongs to an account,', { exact: false }).waitFor()
  assert.equal(queries.length, 0)
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor()
  await page.getByRole('button', { name: 'View visit for Fixture Guest', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Rental alerts', exact: true }).waitFor()
  await page.evaluate(() => {
    const state = window.__admissionsFixture.state
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', {
        detail: {
          ...state,
          rows: state.rows.map((row, index) => ({
            ...row,
            expiresAt: Date.now() + (index === 0 ? -60000 : 240000),
          })),
        },
      }),
    )
  })
  await expect(
    page
      .getByRole('button', { name: 'Show expired rentals', exact: true })
      .locator('.rental-alert-count'),
  ).toHaveText('1')
  await expect(
    page
      .getByRole('button', { name: 'Show ending soon rentals', exact: true })
      .locator('.rental-alert-count'),
  ).toHaveText('1')
  await page.getByLabel('Search admissions').fill('no match')
  await page.getByRole('button', { name: 'Show ending soon rentals', exact: true }).click()
  await expect(page.getByLabel('Search admissions')).toHaveValue('')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'View visit for Fixture Waiting', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Show expired rentals', exact: true }).click()
  await page.getByRole('button', { name: 'View visit for Fixture Guest', exact: true }).waitFor()
  await page.getByRole('button', { name: 'All active visits 2', exact: true }).click()
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/overview-rental-alerts-fixtures.png', fullPage: true })
  await page.evaluate(() => {
    const state = window.__admissionsFixture.state
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', { detail: { ...state, status: 'reconnecting' } }),
    )
  })
  await expect(
    page.getByRole('button', { name: 'Show expired rentals', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() => {
    const state = window.__admissionsFixture.state
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', {
        detail: {
          ...state,
          status: 'live',
          rows: state.rows.map((row) => ({ ...row, expiresAt: Date.now() + 3600000 })),
        },
      }),
    )
  })
  await page.getByLabel('Search admissions').fill('101')
  const overviewStops = await page.evaluate(() => window.__admissionsFixture.stops)
  assert.equal(
    await page.locator('.brand img').evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
  )
  await page.getByRole('link', { name: 'Admissions & rentals', exact: true }).click()
  await expect(page.getByLabel('Search admissions')).toHaveValue('101')
  await expect(page.getByRole('heading', { name: 'Rental alerts', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByLabel('Search admissions')).toHaveValue('101')
  assert.equal(await page.locator('tbody tr').count(), 1)
  assert.equal(
    await page.evaluate(() => window.__admissionsFixture.stops),
    overviewStops,
    'The shared view keeps a single subscription when switching between its routes',
  )
  await page.getByLabel('Search admissions').fill('')
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        return { maximized: window.isMaximized(), fullscreen: window.isFullScreen() }
      }),
    )
    .toEqual({ maximized: true, fullscreen: false })
  assert.equal(await page.getByRole('button', { name: 'Change system', exact: true }).count(), 0)
  for (const label of [
    'Products',
    'Point of sale',
    'Registers',
    'History',
    'Reports & analytics',
    'Messages',
    'Events',
  ]) {
    await page.getByRole('link', { name: label, exact: true }).click()
    await page.getByRole('heading', { name: 'Not implemented yet', exact: true }).waitFor()
    assert.equal(await page.locator('table').count(), 0)
    assert.doesNotMatch(
      await page.locator('body').innerText(),
      /sample data|foundation|preview|next chapter/i,
    )
  }
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'View Test Member 01' }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: 'Create membership', exact: true }).isDisabled(),
    true,
  )
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await page.getByRole('button', { name: 'View Test Member 26' }).waitFor()
  await page.getByRole('button', { name: 'Previous page', exact: true }).click()
  await page.getByRole('button', { name: 'View Test Member 01' }).click()
  await page.getByText('001234', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Member history', exact: true }).click()
  await page.getByText('order-1', { exact: true }).waitFor()
  await page.getByText('Locker 12', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'View all DNA', exact: true }).click()
  await page.getByText('Page 1 · 1 records · Do not admit', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'View Test Member 02' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'View Test Member 01' }).count(), 0)
  await page.getByRole('button', { name: 'Normal view', exact: true }).click()
  await page.getByRole('button', { name: 'View Test Member 01' }).waitFor()
  await page.getByLabel('Search field').selectOption('dob')
  await page.getByLabel('Search memberships').fill('02/09/1980')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByText('Page 1 · 1 records · dob search', { exact: true }).waitFor()
  assert.ok(queries.some((q) => field(q.where, 'dob')))
  await page.getByLabel('Search field').selectOption('id')
  await page.getByLabel('Search memberships').fill('001234')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByText('Page 1 · 1 records · id search', { exact: true }).waitFor()
  await expect
    .poll(() => queries.some((q) => field(q.where, 'idnum')?.stringValue === '001234'))
    .toBe(true)
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/members-readonly-fixtures.png', fullPage: true })
  await page.getByRole('link', { name: 'Admissions & rentals', exact: true }).click()
  await page.getByText('Live updates', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'View visit for Fixture Guest', exact: true }).waitFor()
  const timer = page.locator('tbody tr').filter({ hasText: 'Fixture Guest' }).locator('.time')
  const initialTime = await timer.innerText()
  await expect(timer).not.toHaveText(initialTime)
  await page.getByRole('button', { name: 'Waitlist 1', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: 'View visit for Fixture Guest', exact: true }).count(),
    0,
  )
  await page.getByRole('button', { name: 'View visit for Fixture Waiting', exact: true }).waitFor()
  await page.getByRole('button', { name: 'All active visits 2', exact: true }).click()
  await page.getByLabel('Search admissions').fill('101')
  assert.equal(await page.locator('tbody tr').count(), 1)
  await page.getByLabel('Search admissions').fill('')
  await page.getByRole('button', { name: 'View visit for Fixture Guest', exact: true }).click()
  await page.getByRole('dialog').getByText('Original visit note', { exact: true }).waitFor()
  await page.evaluate(() => {
    const state = window.__admissionsFixture.state
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', {
        detail: {
          ...state,
          rows: state.rows.map((row) =>
            row.id === 'v1' ? { ...row, notes: 'Updated remotely', location: '23' } : row,
          ),
        },
      }),
    )
  })
  await page.getByRole('dialog').getByText('Updated remotely', { exact: true }).waitFor()
  await page.getByRole('dialog').getByText('Locker · 23', { exact: true }).waitFor()
  await page.evaluate(() => {
    const state = window.__admissionsFixture.state
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', {
        detail: { ...state, rows: state.rows.filter((row) => row.id !== 'v1') },
      }),
    )
  })
  assert.equal(await page.getByRole('dialog').count(), 0)
  await page.evaluate(() => {
    const state = window.__admissionsFixture.state
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', {
        detail: {
          ...state,
          rows: [
            ...state.rows,
            { ...state.rows[0], id: 'v3', memberName: 'New arrival', waiting: false, inside: true },
          ],
        },
      }),
    )
  })
  await page.getByRole('button', { name: 'View visit for New arrival', exact: true }).waitFor()
  await page.screenshot({ path: 'artifacts/admissions-fixtures.png', fullPage: true })
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('admissions-fixture', {
        detail: { ...window.__admissionsFixture.state, status: 'reconnecting' },
      }),
    ),
  )
  await page
    .getByText('Showing last received records while updates reconnect.', { exact: true })
    .waitFor()
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__admissionsFixture.active)).toBe(false)
  await page.getByRole('button', { name: 'View Test Member 01', exact: true }).waitFor()
  changedAccess = true
  const before = queries.length
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page
    .getByText('Your club access has changed. Sign out and sign in again.', { exact: true })
    .waitFor()
  assert.equal(queries.length, before, 'No member reads after access changed')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  assert.equal(await page.getByText('Test Member 01', { exact: true }).count(), 0)
  await page.evaluate(() => window.desktop.setWindowMode('login'))
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
    false,
  )
  assert.deepEqual(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()),
    [480, 680],
  )
  // Sign in as the one allowed UID and exercise persisted access switching.
  changedAccess = false
  fixtureUid = ownerUid
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'View Test Member 01' }).waitFor()
  await page.getByRole('button', { name: 'View Test Member 01' }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  async function chooseSystem(target) {
    await page.getByRole('button', { name: 'Change system', exact: true }).click()
    await page
      .getByRole('option', { name: 'Other Club · other-club', exact: false })
      .waitFor({ state: 'attached' })
    await expect(page.getByLabel('System', { exact: true })).toBeEnabled()
    assert.equal(
      await page.getByRole('button', { name: 'Switch system', exact: true }).isDisabled(),
      true,
    )
    await page.getByLabel('System', { exact: true }).selectOption(target)
    await page.getByRole('button', { name: 'Switch system', exact: true }).click()
  }
  await page.getByRole('link', { name: 'Admissions & rentals', exact: true }).click()
  await page.getByRole('button', { name: 'View visit for Fixture Guest', exact: true }).waitFor()
  const stopsBeforeSwitch = await page.evaluate(() => window.__admissionsFixture.stops)
  await chooseSystem('other-club')
  await page.getByRole('button', { name: 'View visit for Other Guest', exact: true }).waitFor()
  assert.ok((await page.evaluate(() => window.__admissionsFixture.stops)) > stopsBeforeSwitch)
  assert.equal(await page.getByText('Fixture Guest', { exact: true }).count(), 0)
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'View Other Member 01' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'View Test Member 01' }).count(), 0)
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(commitCount, 1)
  await page.getByRole('link', { name: 'Admissions & rentals', exact: true }).click()
  await page.getByRole('button', { name: 'View visit for Other Guest', exact: true }).waitFor()
  assert.equal(await page.getByText('Fixture Guest', { exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => window.__admissionsFixture.club), 'other-club')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.locator('dd').getByText('other-club', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'View Other Member 01' }).waitFor()
  await page.getByRole('button', { name: 'Change system', exact: true }).click()
  await page
    .getByRole('option', { name: 'Other Club · other-club (current)', exact: true })
    .waitFor({ state: 'attached' })
  await page.screenshot({ path: 'artifacts/system-switcher-fixtures.png', fullPage: true })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  denySwitch = true
  await chooseSystem('fixture-club')
  await page
    .getByRole('alert')
    .getByText('Your Firebase permissions do not allow this system operation.', { exact: false })
    .waitFor()
  await page.getByRole('button', { name: 'View Other Member 01' }).waitFor()
  assert.equal(activeClub, 'other-club')
  assert.equal(commitCount, 2)
  denySwitch = false
  // A committed write followed by an unreadable profile must discard the workspace.
  denyProfileReload = true
  await chooseSystem('fixture-club')
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  await page
    .getByText('Your saved system access could not be reloaded.', { exact: false })
    .waitFor()
  assert.equal(await page.getByRole('navigation').count(), 0)
  assert.equal(activeClub, 'fixture-club')
  assert.equal(commitCount, 3)
  denyProfileReload = false
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'View Test Member 01' }).waitFor()
  assert.equal(commitCount, 3, 'Sign-in must never write access')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in to CERMS' }).waitFor()
  assert.deepEqual(errors, [])
  assert.ok(
    requests.every(
      (request) =>
        request.path.endsWith(':signInWithPassword') ||
        request.path.endsWith(':lookup') ||
        request.path.endsWith(':sendOobCode') ||
        request.path.endsWith(':batchGet') ||
        request.path.endsWith(':runQuery') ||
        request.path.endsWith(':commit'),
    ),
  )
  console.log(
    'Membership and UID-restricted system-switch smoke passed. All Firebase responses used intercepted synthetic fixtures; no live requests sent.',
  )
} catch (error) {
  console.error('Fixture test diagnostics:', JSON.stringify({ requests, errors }))
  throw error
} finally {
  await app.close()
}
