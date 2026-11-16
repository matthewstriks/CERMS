import { membershipProduct, catalogFields } from './fixtures/catalog.mjs'
import { createRequire } from 'node:module'
const sharp = createRequire(new URL('../functions/package.json', import.meta.url))('sharp')
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
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
const imageBytes = await sharp({
  create: { width: 4001, height: 4001, channels: 3, background: '#32876b' },
})
  .png({ compressionLevel: 0 })
  .toBuffer()
assert.ok(
  imageBytes.length > 5 * 1024 * 1024,
  'Synthetic original exceeds the former file-size cap',
)
const originalInfo = await sharp(imageBytes).metadata()
assert.ok(
  originalInfo.width * originalInfo.height > 16000000,
  'Synthetic original exceeds the former pixel cap',
)
const savedImage = await sharp(imageBytes).resize(512, 512).webp().toBuffer()
const productPath = `${base}/system/${club}/products/image-product`
const categoryPath = `${base}/system/${club}/categories/memberships`
documents.set(productPath, {
  name: productPath,
  fields: catalogFields({ ...membershipProduct(), name: 'Image product', updatedBy: uid }),
})
documents.set(categoryPath, {
  name: categoryPath,
  fields: catalogFields({
    name: 'Memberships',
    desc: '',
    color: '#dcebdd',
    version: 1,
    updatedBy: uid,
  }),
})
const largeImagePath = `/private/tmp/cerms-product-image-${process.pid}.png`
await writeFile(largeImagePath, imageBytes)
let imageUploads = 0
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
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/uploadProductImage') {
      const { data } = request.postDataJSON()
      assert.equal(data.business, club)
      assert.equal(data.productId, 'image-product')
      assert.equal(data.mimeType, 'image/webp')
      const prepared = await sharp(Buffer.from(data.base64, 'base64')).metadata()
      assert.ok(
        prepared.width <= 1024 && prepared.height <= 1024,
        'Original is automatically optimized before upload',
      )
      imageUploads++
      return respond({
        result: {
          imagePath: `cerms5/catalog/${club}/products/image-product/${'a'.repeat(64)}.webp`,
        },
      })
    }
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/getProductImage')
      return respond({ result: { mimeType: 'image/webp', base64: savedImage.toString('base64') } })
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
        const collection = body.structuredQuery.from[0].collectionId
        assert.ok(['products', 'categories'].includes(collection))
        return respond(
          [...documents.values()]
            .filter((d) => d.name.includes(`/system/${club}/${collection}/`))
            .map((d) => ({ document: timed(d) })),
        )
      }
      if (url.pathname.endsWith(':commit')) {
        assert.equal(body.writes.length, 1)
        const w = body.writes[0]
        assert.equal(w.update.name, productPath)
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
    location.hash = 'products'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await page.getByRole('button', { name: 'Edit product Image product', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit product', exact: true })
  await dialog.getByLabel('Product image', { exact: true }).setInputFiles(largeImagePath)
  await expect(dialog.getByAltText('Product image preview')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(imageUploads, 1)
  assert.ok(documents.get(productPath).fields.imagePath.stringValue.startsWith('cerms5/catalog/'))
  await page.getByRole('button', { name: 'Edit product Image product', exact: true }).click()
  await expect(dialog.getByAltText('Product image preview')).toBeVisible()
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/product-image-editor.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Remove image', exact: true }).click()
  await expect(dialog.getByAltText('Product image preview')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(imageUploads, 1)
  assert.equal(documents.get(productPath).fields.imagePath.nullValue, null)
  assert.equal(saves, 2)
  assert.equal(creates, 0)
  assert.deepEqual(errors, [])
  console.log(
    'Product image feature passed: source above 5 MB and 16 megapixels accepted, optimized automatically, previewed, saved, reopened and removed. All network traffic intercepted.',
  )
} finally {
  await app.close()
  await rm(largeImagePath, { force: true })
}
