import { membershipProduct } from './fixtures/catalog.mjs'
import { emptyCounts } from './fixtures/registers.mjs'
// Focused duplicate-member flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-member-duplicates-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({
    name: 'member-duplicates-fixture',
    version: pkg.version,
    main: 'bootstrap.cjs',
  }),
)
await writeFile(
  join(dir, 'bootstrap.cjs'),
  `const {app}=require('electron');const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?${JSON.stringify(join(dir, 'profile'))}:value);require(${JSON.stringify(resolve('out/main/index.js'))});`,
)
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
let app
const uid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
  club = 'dev',
  base = 'projects/cerms-7af24/databases/cerms/documents',
  time = '2026-11-17T12:00:00Z'
const docs = new Map([
  [
    'users/' + uid,
    { uid, access: club, displayName: 'Synthetic Owner', email: 'owner@example.test' },
  ],
  ['system/' + club, { businessName: 'Synthetic Club', taxRate: 0 }],
  [`system/${club}/registerOwners/${uid}`, { registerId: '10000000-0000-4000-8000-000000000001' }],
  [
    `system/${club}/registers/10000000-0000-4000-8000-000000000001`,
    {
      schemaVersion: 1,
      status: 'open',
      ownerUid: uid,
      ownerName: 'Synthetic Owner',
      openingCounts: emptyCounts(),
      openingTotalCents: 0,
      openedAt: { timestampValue: time },
      closingCounts: null,
      closingTotalCents: null,
      closedAt: null,
      closeNote: '',
    },
  ],
  [`system/${club}/products/plan`, membershipProduct()],
  [
    `system/${club}/products/retail`,
    {
      ...membershipProduct(),
      name: 'Test retail',
      favorite: true,
      membership: false,
      priceCents: 1000,
      cat: 'retail',
    },
  ],
  [
    'members/existing',
    {
      access: club,
      name: 'Jose Andrew ONeil',
      fname: 'Jose',
      mname: 'Andrew',
      lname: 'ONeil',
      dob: '2/9/1980',
      idnum: 'AB12345',
      idstate: 'Texas',
      id_number: 12345,
      membership_type: 'Annual',
      id_expiration: 4102444800,
      // Deliberately no normalized search fields or creation timestamp.
    },
  ],
])
let duplicateReads = 0,
  writes = 0
const snapshot = structuredClone([...docs])
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
try {
  app = await electron.launch({ args: [dir, '--mute-audio'], env, timeout: 20000 })
  const page = await app.firstWindow()
  await app.evaluate(({ shell }) => {
    globalThis.memberFileLinks = []
    shell.openExternal = async (url) => {
      globalThis.memberFileLinks.push(url)
    }
  })
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
        const q = request.postDataJSON().structuredQuery
        const collection = q.from[0].collectionId
        const prefix = url.pathname
          .slice(('/v1/' + base).length)
          .replace(/:runQuery$/, '')
          .replace(/^\//, '')
        const target = (prefix ? prefix + '/' : '') + collection + '/'
        const field = (filter, name) =>
          filter?.fieldFilter?.field.fieldPath === name
            ? filter.fieldFilter.value
            : filter?.compositeFilter?.filters.map((entry) => field(entry, name)).find(Boolean)
        if (collection === 'members' && q.limit === 250) {
          duplicateReads++
          assert.equal(field(q.where, 'access')?.stringValue, club)
          assert.equal(q.orderBy[0].field.fieldPath, '__name__')
        }
        let rows = [...docs.keys()].filter(
          (p) => p.startsWith(target) && !p.slice(target.length).includes('/'),
        )
        if (collection === 'members') {
          rows = rows.filter((p) => docs.get(p).access === field(q.where, 'access')?.stringValue)
          // Recent-members view excludes undated records, duplicate scan must still find them.
          if (q.orderBy?.some((o) => o.field.fieldPath === 'creation_time'))
            rows = rows.filter((p) => docs.get(p).creation_time)
        }
        return respond(rows.map((p) => ({ document: document(p) })))
      }
      if (url.pathname.endsWith(':commit')) writes++
      throw Error('Unexpected Firestore operation')
    }
    return route.abort()
  })
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.evaluate(() => {
    location.hash = 'members'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Create membership', exact: true }).click()
  let form = page.getByRole('dialog', { name: 'Create member · Dev System', exact: true })
  async function fill(memberForm) {
    await memberForm.getByLabel('First name', { exact: true }).fill('José')
    await memberForm.getByLabel('Middle name', { exact: true }).fill('A')
    await memberForm.getByLabel('Last name', { exact: true }).fill("O'Neil")
    await memberForm.getByLabel('Date of birth', { exact: true }).fill('1980-02-09')
    await memberForm.getByLabel('ID state or type', { exact: true }).selectOption('TX')
    await memberForm.getByLabel('ID number', { exact: true }).fill('AB-123 45')
    await memberForm.getByLabel('Type of membership', { exact: true }).selectOption('plan')
  }
  await fill(form)
  await form.getByRole('button', { name: 'Continue to checkout', exact: true }).click()
  let duplicate = page.getByRole('dialog', { name: 'Member may already exist', exact: true })
  await expect(duplicate).toBeVisible()
  await expect(duplicate.getByText('AB12345', { exact: true })).toBeVisible()
  await expect(
    duplicate.getByText('Matched: ID state and number, Name, Date of birth'),
  ).toBeVisible()
  await expect(
    duplicate.getByRole('button', { name: 'Continue as new member', exact: true }),
  ).toBeDisabled()
  await duplicate.getByRole('button', { name: 'Back to form', exact: true }).first().click()
  await expect(form.getByLabel('First name', { exact: true })).toHaveValue('José')
  await form.getByRole('button', { name: 'Continue to checkout', exact: true }).click()
  duplicate = page.getByRole('dialog', { name: 'Member may already exist', exact: true })
  await duplicate
    .getByRole('button', { name: 'Use existing member Jose Andrew ONeil', exact: true })
    .click()
  let purchase = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
  await expect(
    purchase.getByRole('combobox', { name: 'Membership recipient', exact: true }),
  ).toHaveValue('existing')
  await expect(purchase.getByLabel('Membership product', { exact: true })).toHaveValue('plan')
  await purchase.getByRole('button', { name: 'Add membership to order', exact: true }).click()
  await expect(purchase).toBeHidden()
  let draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    `cerms.pos.${uid}.${club}`,
  )
  assert.equal(draft.member.id, 'existing')
  assert.equal(draft.pendingMembers.length, 0)
  assert.equal(draft.cart[0].memberships[0].memberId, 'existing')
  // Creating from an existing POS order retains its contents and primary recipient.
  await page.getByRole('button', { name: 'Test retail', exact: false }).click()
  await page.getByRole('button', { name: 'Add membership', exact: true }).click()
  purchase = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
  await purchase.getByRole('button', { name: 'Create new membership', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Create member · Dev System', exact: true })
  await fill(form)
  await form.getByRole('button', { name: 'Add membership to order', exact: true }).click()
  duplicate = page.getByRole('dialog', { name: 'Member may already exist', exact: true })
  await duplicate
    .getByRole('button', { name: 'Use existing member Jose Andrew ONeil', exact: true })
    .click()
  purchase = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
  await expect(
    purchase.getByRole('combobox', { name: 'Membership recipient', exact: true }),
  ).toHaveValue('existing')
  await purchase.getByRole('button', { name: 'Add membership to order', exact: true }).click()
  draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    `cerms.pos.${uid}.${club}`,
  )
  assert.equal(draft.cart.find((l) => l.product.id === 'retail').quantity, 1)
  assert.equal(draft.cart.find((l) => l.product.id === 'plan').quantity, 2)
  assert.equal(draft.pendingMembers.length, 0)
  // False positives require explicit confirmation before using the original new-member flow.
  await page.getByRole('button', { name: 'Add membership', exact: true }).click()
  purchase = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
  await purchase.getByRole('button', { name: 'Create new membership', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Create member · Dev System', exact: true })
  await fill(form)
  await form.getByLabel('ID number', { exact: true }).fill('DIFFERENT-ID')
  await form.getByRole('button', { name: 'Add membership to order', exact: true }).click()
  duplicate = page.getByRole('dialog', { name: 'Member may already exist', exact: true })
  await duplicate.getByLabel('I checked the matches. This is a different person.').check()
  await duplicate.getByRole('button', { name: 'Continue as new member', exact: true }).click()
  await expect(form).toBeHidden()
  draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    `cerms.pos.${uid}.${club}`,
  )
  assert.equal(draft.pendingMembers.length, 1)
  assert.equal(draft.pendingMembers[0].draft.governmentId, 'DIFFERENT-ID')
  // A distinct identity proceeds normally without showing a duplicate prompt.
  await page.getByRole('button', { name: 'Add membership', exact: true }).click()
  purchase = page.getByRole('dialog', { name: 'Add membership to order', exact: true })
  await purchase.getByRole('button', { name: 'Create new membership', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Create member · Dev System', exact: true })
  await fill(form)
  await form.getByLabel('First name', { exact: true }).fill('Unique')
  await form.getByLabel('Middle name', { exact: true }).fill('')
  await form.getByLabel('Last name', { exact: true }).fill('Customer')
  await form.getByLabel('Date of birth', { exact: true }).fill('1985-01-01')
  await form.getByLabel('ID number', { exact: true }).fill('UNIQUE-ID')
  await form.getByRole('button', { name: 'Add membership to order', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(
    page.getByRole('dialog', { name: 'Member may already exist', exact: true }),
  ).toHaveCount(0)
  draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    `cerms.pos.${uid}.${club}`,
  )
  assert.equal(draft.pendingMembers.length, 2)
  assert.deepEqual([...docs], snapshot)
  assert.equal(writes, 0)
  assert.ok(duplicateReads >= 4)
  console.log(
    'Duplicate-member desktop passed: undated legacy match, full details/reasons, return to form, existing-member checkout handoff, POS order preservation, and confirmed different-person creation. All Firebase reads intercepted; no live writes, emails, or orders.',
  )
} finally {
  await app?.close()
  await rm(dir, { recursive: true, force: true })
}
