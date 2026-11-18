# Staff profile management

Users & permissions now offers **Edit profile** and **Remove access**. The owner may grant either independent permission to staff in their own business. Missing flags default off; existing grants retain their behavior. Creating logins and granting permissions remain owner-only.

Editing changes only the existing CERMS 5 profile’s name and profile email. The dialog explicitly distinguishes the profile email from the shared Firebase login email. UID, business, rank, version, preferences and unrelated fields remain unchanged. Missing email stays absent when left blank. Owner identity is UID-based, so changing a profile email cannot grant ownership.

Removal deletes only `cerms/users/{uid}` and `system/{business}/staffPermissions/{uid}` atomically. The shared Auth login and all legacy records remain available. Receipts, closed registers, notes and other history retain their existing references. CERMS 5 business reads and services require an existing profile and therefore reject subsequent access by the removed account. An already displayed screen may retain previously loaded information until refreshed.

The owner cannot be removed. Staff cannot remove their own access or edit the owner. A staff member with an open register must close it before removal. No automatic register closeout occurs.

The `manageStaffAccounts` callable verifies the caller’s current profile, saved business, existing system and applicable permission inside the mutation transaction. It exposes only business-scoped staff directory entries, uses pages of 50 and returns an opaque profile version. Mutations reject stale versions, preserve same-request retries and record a server-only `staffManagementRequests` audit under the business. Direct desktop profile writes and delegated permission grants remain denied.

The service uses the existing named-cerms support identity and has no Firebase Auth dependency. Only `manageStaffAccounts`, the backward-compatible optional flags in `createStaffAccount`, and named-cerms permission validation rules were deployed on November 17, 2026 and both callables were verified ACTIVE. The archived release is `firebase/releases/staff-management-2026-11-17.rules`; metadata evidence is in [STAFF-MANAGEMENT-DEPLOYMENT.json](STAFF-MANAGEMENT-DEPLOYMENT.json).

Focused verification: eight synthetic service checks; three client/policy checks; owner and delegated-admin Electron flows covering edit, protected owner, removal cancellation and confirmation; typecheck and one desktop build for the UI flow. The required synthetic rules suite passed 387 checks on an isolated demo emulator. Every desktop cloud request was intercepted using disposable app profiles. No real staff accounts, profile changes, permission grants or emails were used as tests. No desktop release was packaged or published.
