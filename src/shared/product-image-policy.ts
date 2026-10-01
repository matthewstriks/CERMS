export const maxProductImageBytes = 5 * 1024 * 1024
export const productImageOrigin = 'https://us-central1-cerms-7af24.cloudfunctions.net/'
export const uploadProductImageEndpoint = productImageOrigin + 'uploadProductImage'
export const getProductImageEndpoint = productImageOrigin + 'getProductImage'
export const productImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const
export const validProductImagePath = (path: unknown): path is string =>
  typeof path === 'string' &&
  /^cerms5\/catalog\/[a-zA-Z0-9_-]{1,128}\/products\/[a-zA-Z0-9_-]{1,128}\/[a-f0-9]{64}\.webp$/.test(
    path,
  )
export function isProductImageRequest(url: string, body?: string): boolean {
  try {
    const payload = JSON.parse(body ?? '{}')
    if (Object.keys(payload).join() !== 'data') return false
    const d = payload.data
    if (
      !d ||
      typeof d.business !== 'string' ||
      typeof d.productId !== 'string' ||
      ![d.business, d.productId].every((v) => /^[a-zA-Z0-9_-]{1,128}$/.test(v))
    )
      return false
    if (url === uploadProductImageEndpoint)
      return (
        Object.keys(d).sort().join() === 'base64,business,mimeType,productId' &&
        productImageTypes.includes(d.mimeType) &&
        typeof d.base64 === 'string' &&
        d.base64.length > 0 &&
        d.base64.length <= Math.ceil(maxProductImageBytes / 3) * 4 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(d.base64)
      )
    if (url === getProductImageEndpoint)
      return (
        Object.keys(d).sort().join() === 'business,imagePath,productId' &&
        validProductImagePath(d.imagePath) &&
        d.imagePath.startsWith(`cerms5/catalog/${d.business}/products/${d.productId}/`)
      )
    return false
  } catch {
    return false
  }
}
