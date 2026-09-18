# Member creation: Dev System and local lab

The user subsequently authorized desktop member creation **only in Dev System (`access: "dev"`) in the named `cerms` database**. The desktop implementation is available for the designated owner UID; the user authorized deployment of the reviewed rules and index on September 18, 2026. Deployment verification is recorded in `docs/DEV-MEMBER-DEPLOYMENT.json`. See [Dev member creation](DEV-MEMBER-CREATION.md) for the new contract, scanner setup, and deployment status. Waiver handling, checkout, and creation in other businesses remain disabled.

The audit and local-lab implementation below describe the earlier compatibility work. The loopback lab remains available and its writer remains excluded from the desktop build.

## Try it

From CERMS-5.0:

```sh
npm run dev:members
```

Open **http://127.0.0.1:5174/lab/index.html**. Use synthetic names, IDs, and emails. Stop with Ctrl+C; records are discarded. Restart for a fresh environment. No Firebase sign-in is needed. Java 21 and a cached Firestore emulator JAR are required (already present on this workstation); `FIRESTORE_EMULATOR_JAR` can specify a local JAR. The script does not download tools, use the Firebase CLI login, load production configuration, or deploy anything.

The normal `npm run dev` opens the production-connected desktop app. Its creation buttons are enabled only for the owner in Dev System. The local form uses the same reusable component but a separate emulator writer that is excluded from the desktop build.

Three synthetic membership products are seeded: Annual, Monthly, and Day. These are test fixtures, not a copy of the club's product catalog. The creator reads them from the emulator with the legacy access/membership filter. Production product names and durations have not been inspected or changed.

## Legacy sources audited

- `CERMS/src/createmembership.html`: all inputs and choices.
- `CERMS/src/js/createmembership.js`: scanner parsing, age checks, 15-element creation payload, product loading, import-mode visibility, waiver visibility.
- `CERMS/src/main.js`: `membership-create` IPC handler, `createMembership`, `updateMembership`, `firebaseGetDocuments`, membership product request, checkout completion, `updateOrderCustomerID`, and `updateLID`.

This is a source audit and synthetic compatibility test, not a certification of the deployed backend rules or the entire old application's behavior. The old app was not launched against test or production data because its startup/checkout paths can write.

## Options preserved

| Form option                               | CERMS 5 behavior                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| First, middle, last name                  | First and last required; middle optional; original spelling retained                                         |
| Suffix                                    | None, II, III, IV, JR., SR.                                                                                  |
| Date of birth                             | Required calendar date; under 18 blocked at submission; under 21 warning                                     |
| Email                                     | Optional, validated when provided                                                                            |
| Membership type                           | Selects a product by document ID; encoder saves the legacy product name                                      |
| Creation date, expire date, membership ID | Optional overrides under “Enter existing membership details,” equivalent to legacy import mode               |
| ID state/type                             | All 50 states, DC, Military, Passport, Other with notes hint                                                 |
| ID number                                 | Required; preserved as text, including leading zeros                                                         |
| Guest notes                               | Optional; stored in the legacy string array with staff/time prefix                                           |
| Scan ID                                   | Keyboard/paste capture of the old newline-delimited DAC/DAD/DCS/DAE/DBB/DAQ/DAJ fields; review before saving |
| Waiver                                    | Omitted as requested; legacy `waiver_status` defaults to false                                               |

The scan parser now handles US AAMVA DL/ID text, ANSI headers and DCU suffixes as well as the legacy DAE suffix. Scans are reviewed before applying; physical Tera HW0008 hardware still needs a local check. Raw scans are cleared after applying, on parse failure, on cancellation, and on form reset, and never persisted or logged.

## Legacy save flow and risks

1. The UI loads products marked `membership`; the form sends the selected **name**, despite its select value being the product ID. The main process finds the product by name. Duplicate product names can therefore select the wrong duration. The new form carries the product ID explicitly.
2. The IPC handler checks `members` for exact DOB + government ID within the current `access` system. It stops if a match is found.
3. If register mode is enabled and import mode is off, it builds a pending membership order. Checkout saves the order and updates the register before invoking member creation. Otherwise it creates directly. Member creation is therefore coupled to payment completion; enabling the new form in production without this decision could bypass required payment.
4. Creation chooses a random six-digit number and queries for collisions in the same system. The check and write are separate operations; concurrent staff clients can race.
5. A second duplicate check inside `createMembership` can call `updateMembership` instead of rejecting the request. That path changes notes, expiration, type, and DNA status on an existing record and links the order to it. The new creator never does this.
6. The explicit membership-ID collision branch assigns `querySnapshot` but iterates undefined `querySnapshot3`. It also queries the string input while normal saved IDs are numbers. The new creator checks numeric and string legacy IDs and fails clearly.
7. Normal expiration is current Unix seconds + `membershipLength` (already in seconds on the product). Month/year durations are legacy fixed-second durations, not calendar arithmetic; the encoder deliberately preserves that interpretation.
8. Import overrides parse date-only values as UTC midnight; creation becomes a Firestore Timestamp and expiration becomes Unix seconds. The new encoder preserves this convention. Changing date/timezone semantics is a separate migration decision.
9. Normal creation uses `serverTimestamp()` for `creation_time`, sets `checkedIn`, DNA, and waiver flags to false, and creates a new auto-ID document. The document ID is the relationship key used by orders/activity; `id_number` is the human-facing membership number.
10. Following creation, the old code may link the pending order, increment `system.lid`, update local “last member” state, and open the signature screen. Notifications can also write logs. These side effects are **not** ported into the local creator.
11. The legacy import-mode toggle checks `permissionImportMemberMode`. The lab exposes the override checkbox for testing only; production will need equivalent backend-enforced authorization.
12. Legacy age state is computed on change events; scanning assigns input values programmatically. The month/day comparison also has an edge-case error. The new validator recomputes age at submission with an exact birthday comparison.

## Storage contract

`src/domain/member-creation.ts` contains the typed, Firebase-independent input model and validation. `CreateMemberForm` accepts a `MemberCreator` interface; it does not know collection names or import the Firebase SDK. Its CSS lives with the component.

`src/data/member-creation-legacy.ts` is the single compatibility encoder. It writes the same member shape as the original creation path:

| Fields                                                | Stored form                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `access`                                              | System document ID string                                           |
| `fname`, `mname`, `lname`, `suffix`, `name`           | Strings; `name` deliberately remains first + last for legacy search |
| `dob`, `idnum`, `idstate`, `email`, `membership_type` | Strings; DOB is YYYY-MM-DD                                          |
| `id_number`                                           | Number                                                              |
| `creation_time`                                       | Firestore Timestamp (server timestamp for normal creation)          |
| `id_expiration`                                       | Unix seconds number                                                 |
| `notes`                                               | Array of prefixed strings                                           |
| `dna`, `checkedIn`, `waiver_status`                   | False for creation                                                  |

It does not introduce renamed fields into legacy documents or falsely mark a waiver signed. Existing `memberFromLegacy` can read the result without modification.

## Isolation and concurrency

`src/data/emulator-member-creator.ts` has a fixed `demo-cerms-members` project and fixed 127.0.0.1 host. Only the local port is configurable, with validation before initialization. The local host is set before the first operation; there is no fallback to production. It imports no live authentication/configuration module. The separate Vite configuration does not load `.env.local`; the lab's CSP forbids external connections. The lab and writer are not imported by the Electron entry point, and the existing desktop write protections are unchanged.

The runner starts a temporary single-project Firestore emulator with local-only rules, seeds synthetic products, and removes its temporary directory on shutdown. No emulator export is retained. Rules are permissive **only in this loopback test process**; this is not production authorization design.

The writer uses additional `_labMemberRequests`, `_labMemberIdentities`, and `_labMemberNumbers` documents solely inside the demo project. A transaction atomically creates a member and reservations. Same-request retries return the existing result; conflicting request contents fail. Repeated identity/number submissions are rejected and do not overwrite existing members. Random number collisions retry with a bounded attempt count. Existing synthetic legacy records without reservations are also checked, including number/string membership IDs.

**Reservations only coordinate writers that participate in them.** The legacy application does not. Its concurrent writes can still race a preflight query. These tests do not prove safe concurrent production creation across both apps. A coordinated allocation strategy or controlled creation cutover is required before enabling production writes.

## Migration path

- Keep member document IDs and system IDs stable. Orders/activity refer to member document IDs; preserve those relationships even if human-readable membership numbers change later.
- Keep the form and validation independent from persistence. A future creator can replace the legacy encoder/storage adapter behind `MemberCreator` without rewriting the form.
- Preserve product IDs in the new application contract instead of treating names as stable identifiers. The lab request metadata retains the selected product ID and an adapter schema version; no extra metadata is added to legacy member documents.
- Plan an explicit, versioned importer with deterministic ID mapping, dry-run validation, counts/reconciliation, backups, and rollback before any database migration. No importer or migration has been run.
- Resolve legacy type inconsistencies and date conventions in that importer, not with silent conversions of existing live records.
- Do not maintain two independent live membership databases or dual-write here. The only new records are disposable synthetic emulator records.

Before production enablement, review checkout/payment behavior, staff creation/import permissions and backend enforcement, allocation across both clients, duplicate policy (including ID issuer/case), audit logging, system counter behavior, and the waiver workflow with the user. Production writes still require explicit permission.

## Verification

```sh
npm run check
npm run test:member-creation
# With npm run dev:members running in another terminal:
node scripts/member-creation-ui.mjs
```

Unit tests cover shape/reader compatibility, exact birthdays, malformed dates and scans, import validation, and nonlocal target rejection. Real emulator tests cover timestamp resolution, duplicate rejection without mutation, idempotent retry, conflicting request contents, simultaneous number and identity claims, existing legacy records without claims, and no order/system writes. Browser checks cover field choices, scanning, age rejection, creation, duplicates, import overrides, responsive layout, and localhost-only requests. These use synthetic data exclusively.
