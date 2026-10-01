import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { uploadImage, getImage } from './product-images.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
function fixture() {
  const docs = new Map([
    ['users/' + owner, { uid: owner, access: 'club-a' }],
    ['system/club-a', {}],
  ])
  const files = new Map()
  const fail = (code, message) => {
    throw Object.assign(Error(message), { code })
  }
  const deps = {
    fail,
    db: {
      doc: (path) => ({
        get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
      }),
    },
    bucket: {
      file: (path) => ({
        save: async (bytes, options) => {
          assert.ok(path.startsWith('cerms5/catalog/club-a/products/product/'))
          assert.equal(options.preconditionOpts.ifGenerationMatch, 0)
          if (files.has(path)) throw Object.assign(Error('exists'), { code: 412 })
          files.set(path, bytes)
        },
        getMetadata: async () => [
          { contentType: 'image/webp', size: String(files.get(path).length) },
        ],
        download: async () => [files.get(path)],
      }),
    },
  }
  return { docs, files, deps }
}
test('uploads a normalized image, retries without overwriting, and reads only an attached image', async () => {
  const f = fixture(),
    png = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#32876b' } })
      .png()
      .toBuffer()
  const request = {
    auth: { uid: owner },
    data: {
      business: 'club-a',
      productId: 'product',
      mimeType: 'image/png',
      base64: png.toString('base64'),
    },
  }
  const result = await uploadImage(request, f.deps)
  await uploadImage(request, f.deps)
  assert.equal(f.files.size, 1)
  const metadata = await sharp(f.files.get(result.imagePath)).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, 1024)
  const read = {
    auth: request.auth,
    data: { business: 'club-a', productId: 'product', imagePath: result.imagePath },
  }
  await assert.rejects(getImage(read, f.deps), { code: 'not-found' })
  f.docs.set('system/club-a/products/product', { imagePath: result.imagePath })
  assert.equal((await getImage(read, f.deps)).mimeType, 'image/webp')
  await assert.rejects(
    getImage(
      { ...read, data: { ...read.data, imagePath: result.imagePath.replace('club-a', 'club-b') } },
      f.deps,
    ),
    { code: 'invalid-argument' },
  )
})
test('rejects unauthorized uploads and invalid image bytes without writing files', async () => {
  const f = fixture(),
    data = {
      business: 'club-a',
      productId: 'product',
      mimeType: 'image/png',
      base64: Buffer.from('not an image').toString('base64'),
    }
  await assert.rejects(uploadImage({ auth: { uid: owner }, data }, f.deps), {
    code: 'invalid-argument',
  })
  await assert.rejects(uploadImage({ auth: { uid: 'other' }, data }, f.deps), {
    code: 'permission-denied',
  })
  assert.equal(f.files.size, 0)
})
