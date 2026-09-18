# Business product administration

The user authorized deployment of all pending rules on September 18, 2026. Catalog rules are deployed to `cerms`; see [deployment verification](CERMS-FEATURES-DEPLOYMENT.json). No legacy records, shared Storage, or production catalog data were changed. Products appears under Administration. The previous sample-only Products component is replaced by the business catalog.

## Legacy source review

Reviewed `CERMS/src/products.html`, `src/js/products.js` and `src/main.js` create/edit-category/product handlers. Retained category name/description/color; product category/name/barcode/description, price, inventory/par/warning, active/favorite/taxable/core flags, rental and membership length/unit, staff restrictions, payout and ask-for-price. Blank inventory means unlimited; zero is out of stock. Decimal prices are parsed into integer cents, preventing floating-point money errors. Fixed duration units match legacy: hour 3600, day 86400, week 604800, month 2628000, year 31540000 seconds. Favorite is correctly stored separately from taxable (legacy create overwrote taxable).

Scope is create/edit products and categories, not checkout integration, discounts, destructive deletion, image uploads or inventory email automation. Existing member creation continues to use its Dev test membership; creating a catalog membership does not change that checkout/creation boundary. Restricted staff IDs are entered explicitly pending a business staff directory; this page does not expose other users' private profiles. Product images require a separately scoped Storage implementation.

## Permissions

The old app used permission flags (`permissionViewProductsPage`, `permissionEditProducts`, `permissionEditCoreProducts`, `permissionEditCategory`). Those were deliberately removed from cerms profiles. The user intends a future comprehensive business permissions page; no exact business-admin rank was supplied. Until that mapping is defined, management is gated to the existing owner UID with saved access matching the selected business. No ranks, employee privileges, profile fields or Auth accounts are changed. The `canManageCatalog` policy and matching backend `catalogAdmin` function isolate the temporary authorization rule for replacement. Staff/direct-route access is denied.

## Storage and query review

Named Standard Firestore `cerms` only. Paths: `system/{business}/products/{id}` and `system/{business}/categories/{id}`. Product fields use typed legacy-style names plus integer `priceCents`; inventory values are nullable integers. A separate adapter is required for any future legacy import; there is no root-collection fallback. Both schemas carry `version`, server `updatedAt`, and authenticated `updatedBy`. No parent-system writes.

Lists use `orderBy(name)`, `limit(100)`, document-snapshot cursors; default single-field indexes suffice. Categories paginate up to a documented 1,000 category limit. Products load 100 at a time. Name/barcode/description/category and active-status filters explicitly apply to loaded products; Load more expands the search set. No realtime listeners, unbounded arrays or polling.

Create IDs persist for modal retries. Updates require an exact next version in rules, protecting against concurrent stale saves. The desktop guard allows only single-document create/update commits with exact schemas and timestamp transform. Category references must exist inside the same business. Deletes, arbitrary fields, client timestamps, foreign business writes and invalid types/prices/durations/restrictions are denied. On uncertain responses, the client reads back the same ID/version and fields; it does not allocate a new product ID or silently overwrite another admin's changes.

Catalog rules and the previously pending member rules are deployed. The two member reservations were relocated and verified without changing member documents. Feature tests use synthetic intercepted responses or the isolated demo emulator; deployment verification uses read-only metadata.

Validation completed: `npm run check` (138 unit tests and production build); `npm run test:rules` (182 synthetic allow/deny checks); `node scripts/membership-smoke.mjs` (intercepted desktop category/product creation and edits, price validation, barcode terminator handling, status/search filters, stale-edit rejection, and non-admin route denial). Screenshot: `artifacts/catalog-fixtures.png`. No real Firebase requests were sent by the desktop tests.
