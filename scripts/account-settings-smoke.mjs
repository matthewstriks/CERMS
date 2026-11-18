// Focused owner settings flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-account-settings-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'account-settings-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
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
let loginEmail = 'owner@example.test',
  verified = false,
  verificationEmails = 0,
  emailChanges = 0,
  passwordChanges = 0,
  nameChanges = 0
const token = () => {
  const now = Math.floor(Date.now() / 1000)
  return (
    'eyJhbGciOiJSUzI1NiJ9.' +
    Buffer.from(
      JSON.stringify({
        sub: uid,
        user_id: uid,
        email: loginEmail,
        email_verified: verified,
        aud: 'cerms-7af24',
        iss: 'https://securetoken.google.com/cerms-7af24',
        iat: now,
        exp: now + 3600,
        auth_time: now,
        firebase: { sign_in_provider: 'password' },
      }),
    ).toString('base64url') +
    '.fixture'
  )
}
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
        const data = request.postDataJSON()
        if (data.password === 'incorrect')
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }),
          })
        assert.equal(data.email, loginEmail)
        return respond({
          localId: uid,
          email: loginEmail,
          idToken: token(),
          refreshToken: 'synthetic',
          expiresIn: '3600',
        })
      }
      if (url.pathname.endsWith(':sendOobCode')) {
        const data = request.postDataJSON()
        assert.ok(data.idToken)
        if (data.requestType === 'VERIFY_EMAIL') verificationEmails++
        else {
          assert.equal(data.requestType, 'VERIFY_AND_CHANGE_EMAIL')
          assert.equal(data.newEmail, 'new@example.test')
          emailChanges++
        }
        return respond({ email: loginEmail })
      }
      if (url.pathname.endsWith(':update')) {
        const data = request.postDataJSON()
        assert.deepEqual(
          Object.keys(data).sort(),
          ['idToken', 'password', 'returnSecureToken'].sort(),
        )
        assert.equal(data.password, 'new-password-123')
        passwordChanges++
        return respond({
          localId: uid,
          email: loginEmail,
          idToken: token(),
          refreshToken: 'synthetic',
          expiresIn: '3600',
        })
      }
      if (url.pathname.endsWith(':lookup'))
        return respond({
          users: [
            {
              localId: uid,
              email: loginEmail,
              emailVerified: verified,
              displayName: 'Synthetic Owner',
              providerUserInfo: [
                {
                  providerId: 'password',
                  email: loginEmail,
                  federatedId: loginEmail,
                },
              ],
            },
          ],
        })
    }
    if (url.hostname === 'securetoken.googleapis.com')
      return respond({
        access_token: token(),
        refresh_token: 'synthetic',
        expires_in: '3600',
        user_id: uid,
        token_type: 'Bearer',
      })
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/inventoryEmailSettings')
      return respond({ result: { enabled: false, recipients: [], revision: 0 } })
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/accountSettings') {
      const { data } = request.postDataJSON(),
        profile = documents.get(base + '/users/' + uid)
      if (data.action === 'saveName') {
        assert.equal(data.expectedVersion, '100.000000001')
        profile.fields.displayName = str(data.displayName)
        nameChanges++
        return respond({ result: { saved: true } })
      }
      if (data.action === 'syncEmail') {
        assert.equal(verified, true)
        profile.fields.email = str(loginEmail)
        return respond({ result: { saved: true } })
      }
      assert.equal(data.action, 'get')
      return respond({
        result: {
          displayName: profile.fields.displayName.stringValue,
          profileEmail: profile.fields.email.stringValue,
          email: loginEmail,
          emailVerified: verified,
          version: '100.000000001',
        },
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
  const account = page.getByRole('region', { name: 'Account settings', exact: true })
  await expect(account.getByLabel('Display name', { exact: true })).toHaveValue('Synthetic Owner')
  await account.getByLabel('Display name', { exact: true }).fill('Updated Owner')
  await account.getByRole('button', { name: 'Save display name', exact: true }).click()
  await expect(account.getByText('Display name saved.', { exact: true })).toBeVisible()
  assert.equal(nameChanges, 1)
  await page.clock.install()
  await account.getByRole('button', { name: 'Send verification email', exact: true }).click()
  await expect(
    account.getByText('Verification email sent to owner@example.test.', { exact: true }),
  ).toBeVisible()
  assert.equal(verificationEmails, 1)
  await page.clock.fastForward(61000)
  await account.getByLabel('New email', { exact: true }).fill('new@example.test')
  await account.getByLabel('Current password for email change', { exact: true }).fill('incorrect')
  await account.getByRole('button', { name: 'Send email change link', exact: true }).click()
  await expect(account.getByRole('alert')).toContainText('Current password is incorrect')
  assert.equal(emailChanges, 0)
  await account
    .getByLabel('Current password for email change', { exact: true })
    .fill('synthetic-password')
  await account.getByRole('button', { name: 'Send email change link', exact: true }).click()
  await expect(account.getByRole('status')).toContainText(
    'Confirm the link sent to new@example.test',
  )
  assert.equal(emailChanges, 1)
  assert.equal(loginEmail, 'owner@example.test')
  // Simulate completing Firebase's verification link. No real account or mail exists.
  loginEmail = 'new@example.test'
  verified = true
  await account.getByRole('button', { name: 'Refresh verification', exact: true }).click()
  await expect(
    account.getByText('Email verified. Profile email is up to date.', { exact: true }),
  ).toBeVisible()
  assert.equal(documents.get(base + '/users/' + uid).fields.email.stringValue, 'new@example.test')
  await expect(
    account.getByRole('button', { name: 'Send verification email', exact: true }),
  ).toHaveCount(0)
  await account.getByLabel('Current password', { exact: true }).fill('synthetic-password')
  await account.getByLabel('New password', { exact: true }).fill('new-password-123')
  await account.getByLabel('Confirm new password', { exact: true }).fill('different-password-123')
  await account.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(account.getByRole('alert')).toContainText('New passwords do not match')
  assert.equal(passwordChanges, 0)
  await account.getByLabel('Current password', { exact: true }).fill('synthetic-password')
  await account.getByLabel('New password', { exact: true }).fill('new-password-123')
  await account.getByLabel('Confirm new password', { exact: true }).fill('new-password-123')
  await account.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(account.getByText('Password changed.', { exact: true })).toBeVisible()
  assert.equal(passwordChanges, 1)
  await expect(account.getByLabel('Current password', { exact: true })).toHaveValue('')
  await expect(account.getByLabel('New password', { exact: true })).toHaveValue('')
  console.log(
    'Account settings passed: name, verification mail, wrong-password denial, verify-before-email-change, verified sync and password confirmation/change. All accounts, writes and emails mocked.',
  )
} finally {
  if (app) await app.close().catch(() => {})
  await rm(dir, { recursive: true, force: true })
}
