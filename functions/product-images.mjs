import { createHash } from 'node:crypto'
import sharp from 'sharp'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const pathPattern =
  /^cerms5\/catalog\/[a-zA-Z0-9_-]{1,128}\/products\/[a-zA-Z0-9_-]{1,128}\/[a-f0-9]{64}\.webp$/
async function authorize(request, { db, fail }) {
  const uid = request.auth?.uid,
    d = request.data
  if (!uid) fail('unauthenticated', 'Sign in before accessing product images.')
  if (
    !d ||
    ![d.business, d.productId].every(
      (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v),
    )
  )
    fail('invalid-argument', 'Invalid product or business.')
  const [profile, business] = await Promise.all([
    db.doc('users/' + uid).get(),
    db.doc('system/' + d.business).get(),
  ])
  if (
    !profile.exists ||
    profile.data().uid !== uid ||
    profile.data().access !== d.business ||
    !business.exists
  )
    fail('permission-denied', 'Your business access changed.')
  if (uid !== owner) {
    const permissions = await db.doc(`system/${d.business}/staffPermissions/${uid}`).get()
    if (!permissions.exists || permissions.data().permissions?.manageProducts !== true)
      fail('permission-denied', 'Product management permission is required.')
  }
  return d
}
export async function uploadImage(request, deps) {
  const { bucket, fail } = deps,
    d = await authorize(request, deps)
  if (
    Object.keys(d).sort().join() !== 'base64,business,mimeType,productId' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(d.mimeType) ||
    typeof d.base64 !== 'string' ||
    d.base64.length > 6990508 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(d.base64)
  )
    fail('invalid-argument', 'Choose a JPEG, PNG or WebP image up to 5 MB.')
  const bytes = Buffer.from(d.base64, 'base64')
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    fail('invalid-argument', 'Image exceeds 5 MB.')
  let output
  try {
    const image = sharp(bytes, { limitInputPixels: 16000000, animated: false }),
      metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw Error('Unsupported image')
    output = await image
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    fail('invalid-argument', 'Choose a valid image with no more than 16 megapixels.')
  }
  if (output.length > 1024 * 1024)
    fail('invalid-argument', 'This image is too detailed. Choose a smaller image.')
  const hash = createHash('sha256').update(output).digest('hex')
  const imagePath = `cerms5/catalog/${d.business}/products/${d.productId}/${hash}.webp`
  // Re-check saved authorization after image processing and never overwrite an object.
  await authorize(request, deps)
  try {
    await bucket
      .file(imagePath)
      .save(output, {
        resumable: false,
        contentType: 'image/webp',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { cacheControl: 'private, max-age=3600' },
      })
  } catch (error) {
    if (Number(error.code) !== 412) throw error
  }
  return { imagePath }
}
export async function getImage(request, deps) {
  const { db, bucket, fail } = deps,
    d = await authorize(request, deps)
  if (
    Object.keys(d).sort().join() !== 'business,imagePath,productId' ||
    typeof d.imagePath !== 'string' ||
    !pathPattern.test(d.imagePath) ||
    !d.imagePath.startsWith(`cerms5/catalog/${d.business}/products/${d.productId}/`)
  )
    fail('invalid-argument', 'Invalid product image.')
  const product = await db.doc(`system/${d.business}/products/${d.productId}`).get()
  if (!product.exists || product.data().imagePath !== d.imagePath)
    fail('not-found', 'This product image is no longer attached.')
  const file = bucket.file(d.imagePath),
    [metadata] = await file.getMetadata()
  if (metadata.contentType !== 'image/webp' || Number(metadata.size) > 1024 * 1024)
    fail('failed-precondition', 'The saved image format is unsupported.')
  const [bytes] = await file.download()
  return { mimeType: 'image/webp', base64: bytes.toString('base64') }
}
