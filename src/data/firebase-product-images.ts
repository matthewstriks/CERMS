import { getFirebaseServices } from './firebase-membership'
import { requireStaffPermission } from './firebase-staff-permissions'
import {
  maxProductImageBytes,
  productImageTypes,
  validProductImagePath,
  uploadProductImageEndpoint,
  getProductImageEndpoint,
  isProductImageRequest,
} from '../shared/product-image-policy'
export interface PreparedProductImage {
  base64: string
  mimeType: string
  preview: string
}
export async function prepareProductImage(file: File): Promise<PreparedProductImage> {
  if (!productImageTypes.includes(file.type as (typeof productImageTypes)[number]))
    throw new Error('Choose a JPEG, PNG or WebP image.')
  if (!file.size || file.size > maxProductImageBytes)
    throw new Error('Choose an image no larger than 5 MB.')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image could not be opened. Choose another file.')
  })
  const pixels = bitmap.width * bitmap.height
  bitmap.close()
  if (pixels > 16000000) throw new Error('Choose an image with no more than 16 megapixels.')
  const preview = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
  return { base64: preview.slice(preview.indexOf(',') + 1), mimeType: file.type, preview }
}
export function productImageClient(reader: { uid: string; club: string }) {
  async function call(url: string, data: unknown) {
    await requireStaffPermission(reader.uid, reader.club, 'manageProducts')
    const body = JSON.stringify({ data })
    if (!isProductImageRequest(url, body)) throw new Error('Invalid product image request.')
    const user = getFirebaseServices().auth.currentUser
    if (user?.uid !== reader.uid) throw new Error('Sign in again to continue.')
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body,
      })
    } catch {
      throw new Error(
        'The image service is unavailable. Your selected image is kept; retry when connected.',
      )
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.error)
      throw new Error(payload.error?.message ?? 'The product image service is not available yet.')
    return payload.result
  }
  return {
    async uploadImage(productId: string, image: PreparedProductImage): Promise<string> {
      const result = await call(uploadProductImageEndpoint, {
        business: reader.club,
        productId,
        base64: image.base64,
        mimeType: image.mimeType,
      })
      if (
        !validProductImagePath(result?.imagePath) ||
        !result.imagePath.startsWith(`cerms5/catalog/${reader.club}/products/${productId}/`)
      )
        throw new Error('The image upload could not be verified.')
      return result.imagePath
    },
    async getImage(productId: string, imagePath: string): Promise<string> {
      const result = await call(getProductImageEndpoint, {
        business: reader.club,
        productId,
        imagePath,
      })
      if (
        result?.mimeType !== 'image/webp' ||
        typeof result.base64 !== 'string' ||
        result.base64.length > 1400000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(result.base64)
      )
        throw new Error('The saved image could not be read.')
      return 'data:image/webp;base64,' + result.base64
    },
  }
}
