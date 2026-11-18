import { posFixture } from './fixtures/pos-server.mjs'
import { memberFiles } from '../functions/member-files.mjs'
import { emptyCounts } from './fixtures/registers.mjs'
// Focused owner settings flow. Disposable profile; every Firebase request is intercepted.
import { _electron as electron, expect } from 'playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const dir = await mkdtemp(join(tmpdir(), 'cerms-member-files-'))
await mkdir(join(dir, 'profile'))
await mkdir(join(dir, 'resources/branding'), { recursive: true })
await copyFile('resources/branding/icon.png', join(dir, 'resources/branding/icon.png'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'member-files-fixture', version: pkg.version, main: 'bootstrap.cjs' }),
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
docs.set('members/member', {
  access: club,
  name: 'Synthetic Member',
  fname: 'Synthetic',
  lname: 'Member',
  dob: '1980-02-09',
  idnum: 'TEST-ID',
  idstate: 'TX',
  id_number: 123456789,
  id_expiration: 4102444800,
  membership_type: 'Annual',
  searchName: 'synthetic member',
  searchLast: 'member',
  dna: false,
  tag: false,
  files: ['https://storage.googleapis.com/cerms-7af24.appspot.com/legacy.pdf'],
  filesNames: ['Legacy waiver.pdf'],
})
const memberBefore = structuredClone(docs.get('members/member'))
const objects = new Map()
let saves = 0
const bucketName = 'cerms-7af24-cerms5-member-files'
const bucket = {
  name: bucketName,
  file: (path) => ({
    save: async (bytes, options) => {
      if (objects.has(path)) throw { code: 412 }
      saves++
      objects.set(path, {
        bytes: Buffer.from(bytes),
        metadata: {
          size: String(bytes.length),
          contentType: options.contentType,
          ...options.metadata,
        },
      })
    },
    getMetadata: async () => [objects.get(path).metadata],
    getSignedUrl: async (options) => {
      const u = new URL(`https://storage.googleapis.com/${bucketName}/${path}`)
      const params = {
        'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
        'X-Goog-Credential':
          'cerms5-support@cerms-7af24.iam.gserviceaccount.com/20261117/auto/storage/goog4_request',
        'X-Goog-Date': '20261117T120000Z',
        'X-Goog-Expires': '300',
        'X-Goog-SignedHeaders': 'host',
        'X-Goog-Signature': 'a'.repeat(512),
        'response-content-disposition': options.responseDisposition,
        'response-content-type': options.responseType,
      }
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
      return [u.href]
    },
  }),
}
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
let uploadCalls = 0,
  loseResponse = true
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
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/memberNotes')
      return respond({
        result: {
          name: 'Synthetic Member',
          dna: false,
          tagged: false,
          revision: 0,
          notes: [],
          nextCursor: null,
        },
      })
    if (url.href === 'https://us-central1-cerms-7af24.cloudfunctions.net/memberFiles') {
      const { data } = request.postDataJSON()
      try {
        let result
        if (data.action === 'list')
          result = {
            rows: [...docs]
              .filter(
                ([path, d]) =>
                  path.startsWith(`system/${club}/memberFiles/member/files/`) &&
                  d.state === 'ready',
              )
              .map(([path, d]) => ({
                id: path.split('/').at(-1),
                name: d.name,
                size: d.size,
                contentType: d.contentType,
                viewable: d.contentType !== 'application/octet-stream',
                uploadedBy: d.uploaderName,
                createdAt: null,
              })),
            more: false,
            cursor: null,
          }
        else {
          result = await memberFiles({ auth: { uid }, data }, { ...f.deps, bucket })
          if (data.action === 'upload') {
            uploadCalls++
            if (loseResponse) {
              loseResponse = false
              return route.abort('failed')
            }
          }
        }
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
    location.hash = 'members'
  })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'View Synthetic Member', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Synthetic Member', exact: true })
  await expect(dialog.getByText('Legacy waiver.pdf', { exact: true })).toBeVisible()
  const photo = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=',
      'base64',
    ),
    pdf = Buffer.from('%PDF-1.7\nsynthetic consent')
  await dialog.getByLabel('Upload member files', { exact: true }).setInputFiles([
    { name: 'Photo.png', mimeType: 'image/png', buffer: photo },
    { name: 'Consent.pdf', mimeType: 'application/pdf', buffer: pdf },
  ])
  await expect(
    dialog.getByRole('button', { name: 'Retry 2 pending uploads', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Retry 2 pending uploads', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'View Consent.pdf', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'View Photo.png', exact: true })).toBeVisible()
  assert.equal(saves, 2)
  assert.equal(uploadCalls, 3)
  assert.ok([...objects.values()].some((f) => f.bytes.equals(photo)))
  assert.ok([...objects.values()].some((f) => f.bytes.equals(pdf)))
  await dialog.getByRole('button', { name: 'View Consent.pdf', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.memberFileLinks.length)).toBe(1)
  let links = await app.evaluate(() => globalThis.memberFileLinks)
  assert.match(new URL(links[0]).searchParams.get('response-content-disposition'), /^inline;/)
  await expect(
    dialog.getByRole('button', { name: 'Download Photo.png', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Download Photo.png', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.memberFileLinks.length)).toBe(2)
  links = await app.evaluate(() => globalThis.memberFileLinks)
  assert.match(new URL(links[1]).searchParams.get('response-content-disposition'), /^attachment;/)
  assert.deepEqual(docs.get('members/member'), memberBefore)
  console.log(
    'Member files desktop passed: existing attachment retained, original PNG/PDF multi-upload, lost-response retry without duplicate storage, view/download through trusted IPC and unchanged member fields. All cloud/storage/browser effects mocked.',
  )
} finally {
  if (app) await app.close().catch(() => {})
  await rm(dir, { recursive: true, force: true })
}
