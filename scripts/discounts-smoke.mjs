import { posFixture } from './fixtures/pos-server.mjs'
import { completeSale } from '../functions/pos.mjs'
import { discountCodes } from '../functions/discounts.mjs'
import { membershipProduct } from './fixtures/catalog.mjs'
import { emptyCounts } from './fixtures/registers.mjs'
// Focused owner settings flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-discounts-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'discounts-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
)
await writeFile(
  join(dir, 'bootstrap.cjs'),
  `const {app}=require('electron');const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?${JSON.stringify(join(dir, 'profile'))}:value);require(${JSON.stringify(resolve('out/main/index.js'))});`,
)
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
let app
const uid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
  club = 'club-a',
  base = 'projects/cerms-7af24/databases/cerms/documents',
  time = '2026-11-17T12:00:00Z'
const f = posFixture(),
  docs = f.docs
const regId = f.request.data.registerId
Object.assign(docs.get(`system/${club}/registers/${regId}`), {
  schemaVersion: 1,
  ownerName: 'Synthetic Owner',
  openingCounts: { ...emptyCounts(), bill20: 5 },
  openedAt: { timestampValue: time },
  closingCounts: null,
  closingTotalCents: null,
  closedAt: null,
  closeNote: '',
})
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
const encode = (v) =>
  v === null
    ? { nullValue: null }
    : v && typeof v === 'object' && 'timestampValue' in v
      ? v
      : typeof v === 'string'
        ? { stringValue: v }
        : typeof v === 'boolean'
          ? { booleanValue: v }
          : typeof v === 'number'
            ? { integerValue: String(v) }
            : Array.isArray(v)
              ? { arrayValue: { values: v.map(encode) } }
              : {
                  mapValue: {
                    fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])),
                  },
                }
const document = (path) => ({
  name: base + '/' + path,
  fields: encode(docs.get(path)).mapValue.fields,
  createTime: time,
  updateTime: time,
})
let saleCalls = 0,
  loseResponse = true
try {
  app = await electron.launch({ args: [dir, '--mute-audio'], env, timeout: 20000 })
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  await app.evaluate(({ net }) => {
    const original = net.fetch.bind(net)
    net.fetch = async (url, opts) => {
      if (String(url).startsWith('file:')) return original(url, opts)
      throw Error('No real main-process requests in settings test')
    }
  })
  await app.context().route('cerms://app/assets/firebase-messaging-*.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: 'export function createMessaging(){return{subscribeUnreadCount(receive){receive(0);return()=>{}}}}',
    }),
  )
  await app.context().route('https://**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    const respond = (d) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) })
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
          email: 'owner@example.test',
          idToken: `eyJhbGciOiJSUzI1NiJ9.${payload}.fixture`,
          refreshToken: 'synthetic',
          expiresIn: '3600',
        })
      }
      if (url.pathname.endsWith(':lookup'))
        return respond({
          users: [
            {
              localId: uid,
              email: 'owner@example.test',
              emailVerified: true,
              displayName: 'Synthetic Owner',
              providerUserInfo: [
                {
                  providerId: 'password',
                  email: 'owner@example.test',
                  federatedId: 'owner@example.test',
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
        if (url.pathname === '/discountCodes') {
          if (data.action === 'list') {
            const rows = [...docs]
              .filter(
                ([p]) =>
                  p.startsWith(`system/${club}/discountCodes/`) &&
                  !p.slice(`system/${club}/discountCodes/`.length).includes('/'),
              )
              .map(([, d]) => d)
            result = { rows, more: false, cursor: null }
          } else result = await discountCodes({ auth: { uid }, data }, f.deps)
        } else if (url.pathname === '/completeSale') {
          saleCalls++
          result = await completeSale({ auth: { uid }, data }, f.deps)
          if (loseResponse) {
            loseResponse = false
            return route.abort('failed')
          }
        } else if (url.pathname === '/sendSaleReceipt') result = { email: null }
        else throw Error('Unexpected function')
        return respond({ result })
      } catch (e) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              status: String(e.code ?? 'invalid-argument')
                .toUpperCase()
                .replaceAll('-', '_'),
              message: e.message,
            },
          }),
        })
      }
    }
    if (url.hostname === 'firestore.googleapis.com') {
      if (url.pathname.includes('/Listen/')) {
        assert.equal(url.searchParams.get('database'), 'projects/cerms-7af24/databases/cerms')
        return route.abort()
      }
      assert.ok(url.pathname.startsWith('/v1/' + base))
      if (url.pathname.endsWith(':batchGet'))
        return respond(
          request
            .postDataJSON()
            .documents.map((name) =>
              docs.has(name.slice(base.length + 1))
                ? { found: document(name.slice(base.length + 1)) }
                : { missing: name, readTime: time },
            ),
        )
      if (url.pathname.endsWith(':runQuery')) {
        const collection = request.postDataJSON().structuredQuery.from[0].collectionId
        const prefix = url.pathname
          .slice(('/v1/' + base).length)
          .replace(/:runQuery$/, '')
          .replace(/^\//, '')
        const target = (prefix ? prefix + '/' : '') + collection + '/'
        return respond(
          [...docs.keys()]
            .filter((p) => p.startsWith(target) && !p.slice(target.length).includes('/'))
            .map((p) => ({ document: document(p) })),
        )
      }
      throw Error('Unexpected Firestore operation')
    }
    return route.abort()
  })
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.evaluate(() => {
    location.hash = 'sales'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Discount codes', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Create discount code', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Create discount code', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Create discount code', exact: true })
  await dialog.getByLabel('Code', { exact: true }).fill('save10')
  await dialog.getByLabel('Name', { exact: true }).fill('Ten percent on retail')
  await dialog.getByLabel('Percent off', { exact: true }).fill('10')
  await dialog.getByLabel('Eligible products', { exact: true }).selectOption(['retail'])
  await dialog.getByLabel('Total-use limit (optional)', { exact: true }).fill('10')
  await dialog.getByRole('button', { name: 'Save discount code', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(docs.get(`system/${club}/discountCodes/SAVE10`).rule.value, 1000)
  assert.deepEqual(docs.get(`system/${club}/discountCodes/SAVE10`).rule.productIds, ['retail'])
  await page.getByRole('button', { name: 'New sale', exact: true }).click()
  await page.locator('.pos-category summary').click()
  await page.getByRole('button', { name: 'Test retail', exact: true }).click()
  await page.getByRole('textbox', { name: 'Discount code', exact: true }).fill('save10')
  await page.getByRole('button', { name: 'Apply code', exact: true }).click()
  await expect(page.getByText('SAVE10: $1.00 off', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Take payment', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Take payment', exact: true })
  await expect(dialog.locator('.pos-payment-total')).toHaveText('$9.72')
  await dialog.getByLabel('Payment amount 1', { exact: true }).fill('9.72')
  await dialog.getByRole('button', { name: 'Complete sale', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry same sale', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same sale', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Sale receipt', exact: true })).toBeVisible()
  assert.equal(saleCalls, 2)
  const code = docs.get(`system/${club}/discountCodes/SAVE10`)
  assert.equal(code.usedCount, 1)
  const saved = [...docs].find(([p]) => p.startsWith(`system/${club}/sales/`))[1]
  assert.equal(saved.discountCents, 100)
  assert.equal(saved.taxCents, 72)
  assert.equal(saved.totalCents, 972)
  console.log(
    'Discount desktop flow passed: create restricted percentage code with limit, apply case-insensitively, discounted tax/payment and lost-response checkout retry without double use. All network/payment/email effects intercepted.',
  )
} finally {
  if (app) await app.close().catch(() => {})
  await rm(dir, { recursive: true, force: true })
}
