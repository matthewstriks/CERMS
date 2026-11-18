import test from 'node:test'
import assert from 'node:assert/strict'
import { memberFiles, memberFileName } from './member-files.mjs'
import { memberFilesBucket } from './member-files-domain.mjs'
import { posFixture, owner, business } from '../scripts/fixtures/pos-server.mjs'
const fileId = '10000000-0000-4000-8000-000000000099'
function fixture() {
  const f = posFixture(),
    objects = new Map(),
    signs = []
  let saves = 0
  f.docs.set('members/member', {
    access: business,
    name: 'Synthetic Member',
    files: ['legacy-url'],
    filesNames: ['legacy.pdf'],
  })
  const bucket = {
    name: memberFilesBucket,
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
        assert.equal(options.preconditionOpts.ifGenerationMatch, 0)
      },
      getMetadata: async () => {
        assert.ok(objects.has(path))
        return [objects.get(path).metadata]
      },
      getSignedUrl: async (options) => {
        signs.push({ path, ...options })
        assert.equal(options.action, 'read')
        assert.equal(options.version, 'v4')
        return ['https://example.test/synthetic-url']
      },
    }),
  }
  const deps = { ...f.deps, bucket, now: () => 1000000000 }
  const call = (data, uid = owner) =>
    memberFiles(
      { auth: uid ? { uid } : null, data: { business, memberId: 'member', ...data } },
      deps,
    )
  return { ...f, objects, signs, call, saves: () => saves }
}
const upload = (bytes = Buffer.from('%PDF-1.7\nsynthetic')) => ({
  action: 'upload',
  fileId,
  name: 'Passport ü.pdf',
  size: bytes.length,
  base64: bytes.toString('base64'),
})
test('original PDF bytes and filename are retained, retries upload once, links distinguish viewing/downloading and member arrays stay unchanged', async () => {
  const f = fixture(),
    before = structuredClone(f.docs.get('members/member')),
    d = upload()
  await f.call(d)
  await f.call(d)
  assert.equal(f.saves(), 1)
  assert.equal(f.objects.size, 1)
  assert.deepEqual([...f.objects.values()][0].bytes, Buffer.from(d.base64, 'base64'))
  assert.deepEqual(f.docs.get('members/member'), before)
  await f.call({ action: 'url', fileId, download: false })
  assert.match(f.signs[0].responseDisposition, /^inline;/)
  assert.match(f.signs[0].responseDisposition, /filename\*=UTF-8''Passport%20%C3%BC.pdf/)
  assert.equal(f.signs[0].responseType, 'application/pdf')
  assert.equal(f.signs[0].expires, 1000300000)
  await f.call({ action: 'url', fileId, download: true })
  assert.match(f.signs[1].responseDisposition, /^attachment;/)
  await assert.rejects(f.call({ ...upload(Buffer.from('other data')), name: 'other.txt' }), {
    code: 'already-exists',
  })
})
test('uploads require edit-member rights, reads require current same-business membership and missing/deleted members fail closed', async () => {
  const f = fixture(),
    uid = 'staff'
  f.docs.set('users/' + uid, { uid, access: business })
  await assert.rejects(f.call(upload(), uid), { code: 'permission-denied' })
  assert.equal(f.saves(), 0)
  f.docs.set(`system/${business}/staffPermissions/${uid}`, { permissions: { editMembers: true } })
  await f.call(upload(), uid)
  f.docs.get(`system/${business}/staffPermissions/${uid}`).permissions.editMembers = false
  await f.call({ action: 'url', fileId, download: true }, uid)
  await assert.rejects(f.call(upload(), uid), { code: 'permission-denied' })
  f.docs.get('users/' + uid).access = 'foreign'
  await assert.rejects(f.call({ action: 'url', fileId, download: false }, uid), {
    code: 'permission-denied',
  })
  f.docs.delete('members/member')
  await assert.rejects(f.call({ action: 'url', fileId, download: true }), {
    code: 'permission-denied',
  })
  await assert.rejects(f.call(upload(), null), { code: 'unauthenticated' })
})
test('other documents are download-only, malformed bytes and wrong bucket are rejected, object integrity is verified', async () => {
  const f = fixture(),
    d = upload(Buffer.from('<html>original file</html>'))
  d.name = '../CON.html'
  await f.call(d)
  await f.call({ action: 'url', fileId, download: false })
  assert.equal(f.signs[0].responseType, 'application/octet-stream')
  assert.match(f.signs[0].responseDisposition, /^attachment;/)
  ;[...f.objects.values()][0].metadata.size = '1'
  await assert.rejects(f.call({ action: 'url', fileId, download: true }), {
    code: 'failed-precondition',
  })
  const g = fixture()
  await assert.rejects(g.call({ ...upload(), size: 1 }), { code: 'invalid-argument' })
  assert.equal(g.saves(), 0)
  await assert.rejects(
    memberFiles(
      { auth: { uid: owner }, data: { business, memberId: 'member', ...upload() } },
      { ...g.deps, bucket: { name: 'legacy-bucket' } },
    ),
    { code: 'failed-precondition' },
  )
  assert.equal(memberFileName('CON.pdf'), 'file-CON.pdf')
  assert.ok(!memberFileName('../../a.pdf').includes('/'))
})
