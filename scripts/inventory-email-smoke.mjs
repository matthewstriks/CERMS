// Focused owner settings flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-inventory-email-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'inventory-email-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
)
await writeFile(
  join(dir, 'bootstrap.cjs'),
  `const {app}=require('electron');const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?${JSON.stringify(join(dir, 'profile'))}:value);require(${JSON.stringify(resolve('out/main/index.js'))});`,
)
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
let app
const uid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
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
let settings = { enabled: false, recipients: [], revision: 0 },
  saves = 0
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
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/inventoryEmailSettings') {
      assert.ok(request.headers().authorization?.startsWith('Bearer '))
      const { data } = request.postDataJSON()
      assert.equal(data.business, club)
      if (data.action === 'save') {
        assert.equal(data.expectedRevision, settings.revision)
        settings = {
          enabled: data.enabled,
          recipients: data.recipients,
          revision: settings.revision + 1,
        }
        saves++
      }
      return respond({ result: settings })
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
    location.hash = 'settings'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Enable low inventory emails', { exact: true })).toBeVisible()
  await page.getByLabel('Enable low inventory emails', { exact: true }).check()
  await page
    .getByLabel('Email recipients', { exact: true })
    .fill(' Manager@example.com,stock@example.com\nmanager@example.com')
  await page.getByRole('button', { name: 'Save inventory alerts', exact: true }).click()
  await expect(page.getByText('Inventory alerts saved.', { exact: false })).toBeVisible()
  assert.deepEqual(settings.recipients, ['manager@example.com', 'stock@example.com'])
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/inventoryEmailSettings') &&
      response.request().postDataJSON()?.data?.action === 'get',
  )
  await page.getByRole('button', { name: 'Reload settings', exact: true }).click()
  await refreshed
  await expect(page.getByText('Loading inventory email settings…', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Email recipients', { exact: true })).toHaveValue(
    'manager@example.com\nstock@example.com',
  )
  await page.getByLabel('Email recipients', { exact: true }).fill('not-an-email')
  await page.getByRole('button', { name: 'Save inventory alerts', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('valid email addresses')
  assert.equal(saves, 1)
  await page.getByLabel('Email recipients', { exact: true }).fill('stock@example.com')
  await page.getByLabel('Enable low inventory emails', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Save inventory alerts', exact: true }).click()
  await expect(page.getByText('Inventory email alerts are off.', { exact: true })).toBeVisible()
  assert.equal(settings.enabled, false)
  assert.deepEqual(settings.recipients, ['stock@example.com'])
  console.log(
    'Inventory email settings passed: owner access, multiple recipients, normalization, saved reload, validation and disabling. All Firebase effects mocked; no real emails.',
  )
} finally {
  if (app) await app.close().catch(() => {})
  await rm(dir, { recursive: true, force: true })
}
