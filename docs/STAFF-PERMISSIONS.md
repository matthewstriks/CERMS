# Users & permissions

Staff creation and permissions were deployed September 30, 2026; subsequent additions use the current archived rules baseline. The user clarified that “create members” here means staff login accounts, not customer memberships. No live staff accounts or permission records were created during development.

## Owner and staff access

Read-only inspection confirmed `matthew@striks.com` belongs to existing protected Auth UID `c7D7AH07kgXmjn8tSiOgzHscLZ12`. That UID has full owner access in its selected business without adding profile fields or relying on editable email/rank values. Only the owner can create staff accounts or assign permissions. Staff with an explicit edit-profile or remove-access permission may list their own business’s staff through the dedicated server service. Owner privileges cannot be revoked through the permission editor. The existing owner system switch remains unchanged.

Users & permissions lists the selected business's `cerms/users` profiles in pages of 50. Staff can inspect their own effective permissions. The owner can inspect and edit these independent flags:

- Edit staff profiles: change CERMS 5 names and profile emails, preserving shared login credentials.
- Remove staff access: remove a CERMS 5 profile and its business permissions, preserving shared logins and legacy access.
- Manage discount codes: create/edit/archive codes and read the business catalog for eligibility; independent of selling and product editing.
- Process returns and refunds: independent permission, default off; includes deliberate stock/service cancellation options.
- Use point of sale: record sales/payouts on one’s own open register.
- Waive products: set selected eligible order lines to $0 before checkout.
- Edit member records.
- Delete member records.
- Create and edit products/categories.
- Delete products of any type (independent of editing).
- Open a register.
- Close one's own register.
- Close other staff’s registers in the same business (independent permission; defaults off).

Business-scoped reads of members, visits, orders and registers remain available to existing staff. Missing permission records preserve current defaults: register opening/closing allowed, member and catalog management denied. Malformed records fail closed in the client. Explicit saved flags are enforced by Firestore rules; client action methods refresh saved permissions before mutations. Sign-in caches flags for button visibility only, so staff should reopen the app after changes to refresh controls. Revocations are enforced on the next write even if a button is still visible.

Customer membership creation remains the separately authorized owner-only Dev flow. Check-in, checkout and other unfinished features are not enabled by granting staff permissions.

## Storage and creation

`system/{business}/staffPermissions/{uid}` stores only `permissions`, `updatedBy`, and server `updatedAt`. Updates use exact Firestore version preconditions. Only the owner may write another existing user in the same business; self-grants, owner overrides, cross-business grants and unknown fields are rejected. No arbitrary desktop profile writes are allowed.

The server-only callable `createStaffAccount` runs in `us-central1`, with Admin SDK restricted in code to Firestore database `cerms`. It verifies the authenticated owner and saved business access, creates a new Firebase Auth login, and atomically creates a minimal `cerms/users/{uid}` profile and permissions record. New profile fields are `uid`, `displayName`, `email`, `access`, and `rank`; existing profiles are not rewritten. Initial passwords must be 12–128 characters, are passed only to Auth, and are never stored in Firestore or logged by this code. The owner shares the initial password directly; no invitation/reset email is automatically sent.

Auth is shared with legacy CERMS. Existing email addresses are refused rather than linked, reset, reassigned or altered. No records in `(default)`, shared Storage, existing Auth accounts or provider configuration are changed. Admin credentials are never included in the desktop, and direct client Auth sign-up stays blocked.

Creation uses a stable random request ID and deterministic new UID. A server-only `system/{business}/staffAccountRequests/{requestId}` marker makes same-request retries idempotent and prevents changed details from reusing a request. The dialog preserves the submitted details for retries. Auth and Firestore are separate services: an interrupted setup can temporarily leave a new login without a CERMS profile. Retrying the same request completes setup; the system does not delete Auth accounts as compensation. If the dialog is discarded after a partial setup, owner support must inspect the pending server request before retrying rather than resetting or linking an existing login automatically.

## Verification

The focused Electron smoke covers owner protection, staff creation without changing the owner's session, viewing permissions, saving and reopening them. All HTTPS requests were intercepted. Four server feature checks cover creation/retry, owner/business checks, existing-login protection and request validation. Targeted permission/client checks passed, as did the required local security-rules suite. The desktop build passed and the callable module loads. No production mutations were used to test.

## Deployment status

The user approved deploying the staff-account service and prepared `cerms` rules, including pending membership changes. Deployment completed September 30, 2026 (October 1 UTC). `createStaffAccount` is ACTIVE in `us-central1` on Node.js 22. The exact rules are archived in `firebase/releases/staff-memberships-2026-09-30.rules`; evidence is in [STAFF-MEMBERSHIPS-DEPLOYMENT.json](STAFF-MEMBERSHIPS-DEPLOYMENT.json).

The deployed rules include staff permissions, catalog-backed owner-only Dev membership creation, member edit/delete and membership-product deletion. The isolated function bundle exported only `createStaffAccount`; product images were excluded from that release and subsequently deployed under standing approval (see `PRODUCT-IMAGES-DEPLOYMENT.json`). `firebase.staff.json` now points to the newer POS release to preserve image and POS additions. Future deployments must compare with this release and preserve any subsequently approved changes.

The exact release passed 282 local rules checks and four focused server checks. Read-only verification confirmed unchanged legacy `(default)` rules, all 28 legacy indexes, both existing `cerms` indexes, database configuration and all four pre-existing functions. No accounts or documents were created or modified for testing, and no shared Storage rules or Auth configuration were deployed. Existing runtime IAM roles were inspected, not changed.

The POS release adds optional `processSales`, defaulting off for existing staff without changing their other permissions. The owner retains all rights. Account-request fingerprints remain compatible when the new flag is false.

All-product deletion adds optional `deleteProducts`, defaulting off for existing non-owner staff. Owner access remains full. See `PRODUCT-MANAGEMENT-DEPLOYMENT.json`; category deletion remains disabled.

## Staff profile management — November 17, 2026

The user explicitly chose CERMS 5 profiles and access only. See [STAFF-MANAGEMENT.md](STAFF-MANAGEMENT.md) for the edit/removal boundary, independent admin permissions, owner protection and verification. The current release is `firebase/releases/staff-management-2026-11-17.rules`; deployment verification is recorded in `STAFF-MANAGEMENT-DEPLOYMENT.json` (deployment verified; both callables ACTIVE). Shared Firebase Auth users, passwords and login emails remain unchanged.
