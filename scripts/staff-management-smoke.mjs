// Focused staff profile flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-staff-management-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'staff-management-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
)
await writeFile(
  join(dir, 'bootstrap.cjs'),
  `const {app}=require('electron');const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?${JSON.stringify(join(dir, 'profile'))}:value);require(${JSON.stringify(resolve('out/main/index.js'))});`,
)
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
let app
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const delegated = process.argv.includes('--delegated')
const uid = delegated ? 'synthetic-admin' : owner,
  club = 'fixture-club',
  base = 'projects/cerms-7af24/databases/cerms/documents',
  time = '2026-11-17T12:00:00Z'
const str = (stringValue) => ({ stringValue })
const documents = new Map([
  [
    base + '/users/' + uid,
    {
      name: base + '/users/' + uid,
      fields: {
        uid: str(uid),
        displayName: str('Synthetic Owner'),
        email: str('owner@example.test'),
        access: str(club),
      },
      createTime: time,
      updateTime: time,
    },
  ],
  [
    base + '/system/' + club,
    {
      name: base + '/system/' + club,
      fields: { businessName: str('Synthetic Club') },
      createTime: time,
      updateTime: time,
    },
  ],
])
const staff = 'synthetic-staff'
if (delegated) {
  const ownerDoc = structuredClone(documents.get(base + '/users/' + uid))
  ownerDoc.name = base + '/users/' + owner
  ownerDoc.fields.uid = str(owner)
  documents.set(ownerDoc.name, ownerDoc)
  const permissionsPath = `${base}/system/${club}/staffPermissions/${uid}`
  documents.set(permissionsPath, {
    name: permissionsPath,
    fields: {
      permissions: {
        mapValue: {
          fields: {
            editMembers: { booleanValue: false },
            deleteMembers: { booleanValue: false },
            manageProducts: { booleanValue: false },
            openRegisters: { booleanValue: false },
            closeRegisters: { booleanValue: false },
            editStaffProfiles: { booleanValue: true },
            removeStaffAccounts: { booleanValue: true },
          },
        },
      },
    },
    createTime: time,
    updateTime: time,
  })
}
let account = {
    uid: staff,
    name: 'Synthetic Cashier',
    email: 'cashier@example.test',
    club,
    profileVersion: '1794916800.000000000',
  },
  edits = 0,
  removals = 0
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
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/manageStaffAccounts') {
      assert.ok(request.headers().authorization?.startsWith('Bearer '))
      const { data } = request.postDataJSON()
      assert.equal(data.business, club)
      if (data.action === 'list')
        return respond({
          result: {
            rows: [
              { uid: owner, name: 'Synthetic Owner', email: 'owner@example.test', club },
              ...(account ? [account] : []),
            ],
            more: false,
            cursor: null,
          },
        })
      assert.equal(data.uid, staff)
      if (data.action === 'get') return respond({ result: account })
      assert.equal(data.expectedProfileVersion, account.profileVersion)
      if (data.action === 'update') {
        account = {
          ...account,
          name: data.profile.displayName,
          email: data.profile.email,
          profileVersion: '1794916801.000000000',
        }
        edits++
      } else {
        assert.equal(data.action, 'remove')
        account = null
        removals++
      }
      return respond({ result: { uid: staff, status: 'complete' } })
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
              documents.has(name)
                ? { found: documents.get(name) }
                : { missing: name, readTime: time },
            ),
        )
      if (url.pathname.endsWith(':runQuery')) return respond([])
      throw Error('Unexpected Firestore operation')
    }
    return route.abort()
  })
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.evaluate(() => {
    location.hash = 'staff'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Edit profile for Synthetic Cashier', exact: true }),
  ).toBeVisible()
  if (delegated) {
    await expect(
      page.getByRole('button', { name: 'Create staff account', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Edit profile for Synthetic Owner', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View permissions for/ })).toHaveCount(0)
  }
  await expect(
    page.getByRole('button', { name: 'Remove staff access for Synthetic Owner', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Edit profile for Synthetic Cashier', exact: true })
    .click()
  let dialog = page.getByRole('dialog', { name: 'Edit staff profile', exact: true })
  await expect(dialog.getByLabel('Full name', { exact: true })).toHaveValue('Synthetic Cashier')
  await dialog.getByLabel('Full name', { exact: true }).fill('Updated Cashier')
  await dialog.getByLabel('Profile email', { exact: true }).fill('updated@example.test')
  await dialog.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Edit profile for Updated Cashier', exact: true }),
  ).toBeVisible()
  assert.equal(edits, 1)
  assert.equal(account.email, 'updated@example.test')
  await page
    .getByRole('button', { name: 'Remove staff access for Updated Cashier', exact: true })
    .click()
  dialog = page.getByRole('dialog', { name: 'Remove staff access', exact: true })
  await expect(dialog).toContainText('legacy access stay unchanged')
  await expect(
    dialog.getByRole('button', { name: 'Remove from CERMS 5', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(removals, 0)
  await page
    .getByRole('button', { name: 'Remove staff access for Updated Cashier', exact: true })
    .click()
  dialog = page.getByRole('dialog', { name: 'Remove staff access', exact: true })
  await expect(
    dialog.getByRole('button', { name: 'Remove from CERMS 5', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Remove from CERMS 5', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Staff access removed from CERMS 5.', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Edit profile for Updated Cashier', exact: true }),
  ).toHaveCount(0)
  assert.equal(removals, 1)
  console.log(
    'Staff profile desktop flow passed: edit name/email, protected owner, cancel and confirm access removal. Disposable profile; all cloud requests mocked.',
  )
} finally {
  if (app) await app.close().catch(() => {})
  await rm(dir, { recursive: true, force: true })
}
