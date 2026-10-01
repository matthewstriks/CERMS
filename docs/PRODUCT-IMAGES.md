# Product images

Deployed September 30, 2026 under the user’s standing approval for Firebase updates that preserve legacy functionality. Both image services are ACTIVE, and the optional image field rules are deployed only to named `cerms`. See [deployment evidence](PRODUCT-IMAGES-DEPLOYMENT.json).

## User flow

Create/Edit product includes an image picker with preview and Remove image. JPEG, PNG and WebP files are accepted up to 5 MB and 16 megapixels. Selection alone does not upload. Save waits for local image preparation, uploads the selected image, then saves its path with the product. The upload result is retained when retrying a failed product save. Cancel before Save does not write anything. Remove image clears the product attachment when Save is pressed; it does not delete a shared Storage object. Reopening the editor fetches the saved image through authenticated business-scoped access. Categories do not have an image field.

## Storage and authorization

Image files use a separate private bucket, `cerms-7af24-cerms5-product-images`, with uniform bucket-level access and enforced public-access prevention. The legacy `cerms-7af24.appspot.com` bucket has public read/write rules; it is intentionally untouched and is not used for new product images. These functions can only access `cerms5/catalog/{business}/products/{productId}/{sha256}.webp`. Uploads use `ifGenerationMatch: 0`, so existing objects are never overwritten. No old register/product files, `(default)` data, legacy Storage rules or legacy bucket configuration are changed. Admin SDK stays server-only.

The `uploadProductImage` callable verifies Auth identity, the saved `cerms/users` business, and owner or assigned catalog management rights. It decodes the bytes with a pixel limit, checks actual format, strips image metadata, and produces a WebP no larger than 1024 pixels on either side or 1 MB. The content hash makes identical retries reuse the same immutable file. It rechecks permissions after processing before writing.

`getProductImage` requires the same permissions and checks that the requested path is actually attached to that product. It returns bounded WebP bytes over the authenticated callable; there are no public download-token URLs or signed links in product records. The desktop network guard allows only the two exact callable endpoints and bounded request schemas. Direct Storage uploads remain blocked.

`imagePath` is optional so existing products remain valid. A cleared image is `null`. Both the desktop guard and Firestore rules require the image path to match the product's own business and ID. Source files are not retained; only the normalized WebP is stored. Replacing/removing images or failing a product save can leave an unreferenced immutable file. Automatic cleanup is outside this feature's scope; no files are deleted by this implementation.

## Verification

- The focused server feature check validates upload normalization, retry behavior, attached-image reads, invalid bytes, and authorization with mock Storage only.
- The focused Electron flow covers file selection/preview, upload and save, reopening, and removal using intercepted synthetic responses.
- The required rules emulator checks include image paths scoped to the product/business and clearing the optional field.
- Build/typecheck passed. No production writes or real uploads were used to test.

## Deployment

The exact release is archived in `firebase/releases/product-images-2026-09-30.rules`. The image-only diff was checked against the live staff/membership baseline before publishing. The subsequent POS deployment rebased both configs onto `pos-2026-09-30.rules` to retain the image and POS additions. Future updates must compare against the newest live release.

Only `uploadProductImage` and `getProductImage` were deployed. Read-only verification confirmed all five existing functions unchanged, including `createStaffAccount` and the legacy register report. Legacy `(default)` rules, all 28 legacy indexes, both `cerms` indexes, database settings, shared Storage rules and legacy bucket settings are unchanged. The new private bucket has enforced public-access prevention and uniform bucket-level access; no production test images were uploaded. The old Storage extension watches only the legacy bucket, so these uploads do not trigger it.

The exact rules passed 286 synthetic allow/deny checks, and both focused image server checks passed. The earlier intercepted desktop smoke verified selection, preview, save, reopen and removal. No production user or product data was changed for verification.
