import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
const env = { ...process.env, ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.', '--mute-audio'], env, timeout: 20000 })
const base = 'projects/cerms-7af24/databases/cerms/documents',
  uid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
  club = 'fixture-club',
  time = '2026-09-30T12:00:00Z'
const documents = new Map(),
  errors = []
const str = (stringValue) => ({ stringValue })
const permissionsFields = (p) => ({
  mapValue: {
    fields: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { booleanValue: v }])),
  },
})
const timed = (d) => ({ ...d, createTime: time, updateTime: time })
let creates = 0,
  saves = 0
const ownerPath = base + '/users/' + uid
documents.set(ownerPath, {
  name: ownerPath,
  fields: {
    uid: str(uid),
    displayName: str('Matthew Example Striks'),
    email: str('matthew@striks.com'),
    access: str(club),
  },
})
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
      url = new URL(request.url())
    const respond = (d) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) })
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
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/createStaffAccount') {
      const { data } = request.postDataJSON()
      assert.equal(data.business, club)
      assert.equal(data.permissions.editMembers, true)
      assert.ok(request.headers().authorization?.startsWith('Bearer '))
      creates++
      const staffUid = 'cerms5_' + data.requestId,
        path = base + '/users/' + staffUid,
        permissionPath = `${base}/system/${club}/staffPermissions/${staffUid}`
      documents.set(path, {
        name: path,
        fields: {
          uid: str(staffUid),
          displayName: str(data.displayName),
          email: str(data.email),
          access: str(club),
          rank: str('staff'),
        },
      })
      documents.set(permissionPath, {
        name: permissionPath,
        fields: {
          permissions: permissionsFields(data.permissions),
          updatedBy: str(uid),
          updatedAt: { timestampValue: time },
        },
      })
      return respond({
        result: { uid: staffUid, displayName: data.displayName, email: data.email },
      })
    }
    if (url.hostname === 'firestore.googleapis.com') {
      assert.ok(url.pathname.startsWith('/v1/' + base), 'Must only request cerms')
      const body = request.postDataJSON()
      if (url.pathname.endsWith(':batchGet'))
        return respond(
          body.documents.map((name) =>
            documents.has(name)
              ? { found: timed(documents.get(name)) }
              : { missing: name, readTime: time },
          ),
        )
      if (url.pathname.endsWith(':runQuery')) {
        assert.equal(body.structuredQuery.from[0].collectionId, 'users')
        assert.equal(body.structuredQuery.where.fieldFilter.value.stringValue, club)
        return respond(
          [...documents.values()]
            .filter((d) => d.name.startsWith(base + '/users/'))
            .map((d) => ({ document: timed(d) })),
        )
      }
      if (url.pathname.endsWith(':commit')) {
        assert.equal(body.writes.length, 1)
        const w = body.writes[0]
        assert.ok(w.update.name.includes('/staffPermissions/'))
        assert.equal(w.currentDocument.updateTime, time)
        assert.equal(w.update.fields.updatedBy.stringValue, uid)
        documents.set(w.update.name, w.update)
        saves++
        return respond({ writeResults: [{ updateTime: time }], commitTime: time })
      }
    }
    errors.push('Unexpected request ' + url.hostname + url.pathname)
    return route.abort()
  })
  const page = await app.firstWindow({ timeout: 20000 })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByLabel('Email', { exact: true }).fill('matthew@striks.com')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.evaluate(() => {
    location.hash = 'staff'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.staff-avatar')).toHaveText('MS')
  await page.getByRole('button', { name: 'View permissions for Matthew Example Striks' }).click()
  let dialog = page.getByRole('dialog', { name: 'Staff permissions' })
  await expect(dialog).toContainText('Owner — all permissions')
  for (const checkbox of await dialog.getByRole('checkbox').all()) {
    await expect(checkbox).toBeChecked()
    await expect(checkbox).toBeDisabled()
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Create staff account', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Create staff account' })
  await dialog.getByLabel('Full name', { exact: true }).fill('Synthetic Cashier')
  await dialog.getByLabel('Email', { exact: true }).fill('cashier@example.test')
  await dialog.getByLabel('Initial password').fill('synthetic-only-password')
  await dialog.getByRole('checkbox', { name: /Edit member records/ }).check()
  await dialog.getByRole('button', { name: 'Create staff account', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(creates, 1)
  await page.getByRole('button', { name: 'View permissions for Synthetic Cashier' }).click()
  dialog = page.getByRole('dialog', { name: 'Staff permissions' })
  await expect(dialog.getByRole('checkbox', { name: /Edit member records/ })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: /Delete member records/ })).not.toBeChecked()
  await dialog.getByRole('checkbox', { name: /Delete member records/ }).check()
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/staff-permissions.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Save permissions' }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(saves, 1)
  await page.getByRole('button', { name: 'View permissions for Synthetic Cashier' }).click()
  await expect(dialog.getByRole('checkbox', { name: /Delete member records/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.screenshot({ path: 'artifacts/staff-list.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'Staff desktop flow passed: protected owner, create login, view/edit persisted permissions. All network traffic intercepted.',
  )
} finally {
  await app.close()
}
