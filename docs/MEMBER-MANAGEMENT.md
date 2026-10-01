# Member and membership-product management

Implemented and deployed to named `cerms` on September 30, 2026 with explicit approval. No production records were edited/deleted for testing. See [deployment evidence](STAFF-MEMBERSHIPS-DEPLOYMENT.json).

The user requested editing and deleting both member records and membership products. The subsequently prepared [Users & permissions](STAFF-PERMISSIONS.md) feature adds separate owner-assigned edit/delete flags and catalog management rights in the selected business. The owner retains full access. UI, client actions and backend rules now use those flags together; client visibility alone is not authorization. These permission rules are deployed.

## Member records

Open a member, then choose Edit member or Delete member. Editing includes name, birth date, ID/state, contact details, membership type, expiration, do-not-admit and tagged flags. Active, permitted catalog memberships appear as optional replacements; the current type can be retained even if its product no longer exists. Changing membership type does not calculate a renewal or collect payment. Expiration is explicit and displayed in local time.

Updates use a field mask, authenticated `updatedBy`, server `updatedAt`, and an exact document `updateTime` precondition. Business access, membership number, creation metadata, notes, waiver status, check-in state and all unlisted legacy fields remain unchanged. Stale edits/deletes require reopening the dialog. The desktop request guard allows only the exact supported commit shapes on named `cerms`.

Dev-created schema-v2 members retain identity uniqueness: changing ID/state/birth date atomically removes the prior identity claim and creates the new claim with `exists: false`. Deleting a managed member atomically releases its identity claim but preserves the number reservation so that number cannot be reused. Legacy records do not acquire new reservations or undergo migration. Their duplicate checking retains the existing legacy boundary.

Deletion requires confirmation and is refused while `checkedIn` is true. It permanently removes the member record, including its embedded notes. Separate visits, orders, view logs and stored files are not deleted. Retention does not imply these records are reachable through the deleted member's UI. Existing view logging stays append-only; this change records last-edit metadata, not a full change history.

## Membership products

Products already supports editing. Products flagged as memberships now expose Delete product with confirmation. Deletion verifies business/owner access, the product's membership flag, its catalog version and its Firestore document version. Existing member snapshots and order history are unchanged. Deleted products disappear from new membership choices; the creation client rechecks availability at save time. Category deletion and non-membership product deletion remain disabled.

## Verification and release

- `npm run test` covers validation, scoped network commit shapes, concurrent changes, reservation collisions, checked-in deletion, access changes, and uncertain-response recovery.
- `npm run test:rules` uses exact prepared rules on named `cerms` in the isolated `demo-cerms-rules` emulator. It covers owner/staff/anonymous/foreign-business boundaries, protected fields, atomic identity moves and deletions, retained number claims and membership-only product deletion.
- `node scripts/membership-smoke.mjs` intercepts all HTTPS requests and exercises edit/save, stale conflict, cancellation, member deletion and membership-product deletion through Electron with synthetic data.
- The prepared rules also contain earlier catalog-backed membership creation and register changes. Register-only rules and their index were subsequently deployed with approval; see `REGISTERS-DEPLOYMENT.json`. The membership changes were subsequently approved and deployed only to `cerms`; see `STAFF-MEMBERSHIPS-DEPLOYMENT.json`. Never deploy to `(default)` or use live writes to test.

Validation result: 169 unit tests passed (2 pre-existing emulator-only skips), TypeScript and desktop build passed, 264 local rules checks passed, and the synthetic Electron membership/catalog smoke passed. The editor screenshot at `artifacts/member-edit-fixtures.png` was visually reviewed.

The subsequent all-product management update removes the membership-only deletion restriction and introduces independent `deleteProducts` staff rights. Historical descriptions above refer to the earlier scope; see `PRODUCTS.md` and `PRODUCT-MANAGEMENT-DEPLOYMENT.json`.
