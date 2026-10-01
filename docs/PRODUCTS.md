# Business product administration

The user authorized deployment of all pending rules on September 18, 2026. Catalog rules are deployed to `cerms`; see [deployment verification](CERMS-FEATURES-DEPLOYMENT.json). No legacy records, shared Storage, or production catalog data were changed. Products appears under Administration. The previous sample-only Products component is replaced by the business catalog.

## Legacy source review

Reviewed `CERMS/src/products.html`, `src/js/products.js` and `src/main.js` create/edit-category/product handlers. Retained category name/description/color; product category/name/barcode/description, price, inventory/par/warning, active/favorite/taxable/core flags, rental and membership length/unit, staff restrictions, payout and ask-for-price. Blank inventory means unlimited; zero is out of stock. Decimal prices are parsed into integer cents, preventing floating-point money errors. Fixed duration units match legacy: hour 3600, day 86400, week 604800, month 2628000, year 31540000 seconds. Favorite is correctly stored separately from taxable (legacy create overwrote taxable).

Scope is create/edit products and categories, plus the subsequently requested membership-product deletion described in [Member management](MEMBER-MANAGEMENT.md). Checkout integration, discounts, non-membership product/category deletion and inventory email automation remain excluded. Product image upload is now prepared as described in [Product images](PRODUCT-IMAGES.md). The owner-only Dev member-creation selector now uses active catalog membership products and their durations, without payment collection. Its rule update is prepared locally and awaits separate deployment authorization; see DEV-MEMBER-CREATION.md. Other business creation and checkout remain unavailable. Restricted staff IDs are entered explicitly pending a business staff directory; this page does not expose other users' private profiles. Image functions and optional image-field rules await separate deployment approval.

## Permissions

The old app used profile permission flags, which were deliberately removed from cerms profiles. The subsequently prepared [Users & permissions](STAFF-PERMISSIONS.md) implementation uses `system/{business}/staffPermissions/{uid}.permissions.manageProducts`. The owner always has access; other staff require the saved flag. Member editors may read catalog choices without receiving catalog write access. No permissions are restored to user profiles. These revised permission rules are not yet deployed; the live catalog remains owner-only until approval/deployment.

## Storage and query review

Named Standard Firestore `cerms` only. Paths: `system/{business}/products/{id}` and `system/{business}/categories/{id}`. Product fields use typed legacy-style names plus integer `priceCents`; inventory values are nullable integers. A separate adapter is required for any future legacy import; there is no root-collection fallback. Both schemas carry `version`, server `updatedAt`, and authenticated `updatedBy`. No parent-system writes.

Lists use `orderBy(name)`, `limit(100)`, document-snapshot cursors; default single-field indexes suffice. Categories paginate up to a documented 1,000 category limit. Products load 100 at a time. Name/barcode/description/category and active-status filters explicitly apply to loaded products; Load more expands the search set. No realtime listeners, unbounded arrays or polling.

Create IDs persist for modal retries. Updates require an exact next version in rules, protecting against concurrent stale saves. The desktop guard allows only single-document create/update commits with exact schemas and timestamp transform. Category references must exist inside the same business. Deletes, arbitrary fields, client timestamps, foreign business writes and invalid types/prices/durations/restrictions are denied. On uncertain responses, the client reads back the same ID/version and fields; it does not allocate a new product ID or silently overwrite another admin's changes.

Catalog rules and the previously pending member rules are deployed. The two member reservations were relocated and verified without changing member documents. Feature tests use synthetic intercepted responses or the isolated demo emulator; deployment verification uses read-only metadata.

Validation completed: `npm run check` (138 unit tests and production build); `npm run test:rules` (182 synthetic allow/deny checks); `node scripts/membership-smoke.mjs` (intercepted desktop category/product creation and edits, price validation, barcode terminator handling, status/search filters, stale-edit rejection, and non-admin route denial). Screenshot: `artifacts/catalog-fixtures.png`. No real Firebase requests were sent by the desktop tests.

## All-product deletion

All products, including retail, rental, payout, core and membership items, now offer deletion. Existing `manageProducts` rights are labeled **Create and edit products and categories**; independent `deleteProducts` rights are labeled **Delete products** in Users & permissions. The owner always has both. Existing staff keep their create/edit rights, while the new delete permission defaults off until assigned. Delete-only staff can browse the catalog and delete products, but cannot open editors or create products/categories.

Deletion uses the current Firestore update time and catalog version, so a concurrent edit or inventory update prevents a stale deletion. Confirmation and cancellation are available for every type. Saved receipts, member snapshots, payment history and register totals are independent of the catalog and are preserved. Storage files are retained. Category deletion is not enabled by this product request.

Focused verification covers editing a retail product, canceling deletion, and confirming its version-checked deletion with intercepted network calls. The required rules checks cover retail deletion, edit-only denial, delete-only catalog access and category denial; staff-account tests check backward-compatible permission handling. See `PRODUCT-MANAGEMENT-DEPLOYMENT.json` for live release verification.

Deployed September 30, 2026 under standing approval. Exact live rules: `firebase/releases/products-2026-09-30.rules`. Existing POS/image/legacy services and indexes were verified unchanged. No live product mutations were used for verification.
