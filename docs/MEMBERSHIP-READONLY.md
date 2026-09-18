# Memberships — read-only connection

## Use

1. Restart the development app (`npm run dev`) to pick up `.env.local` and the updated main process. Members and Admissions & rentals use live data.
2. On the opening login screen, sign in with an existing CERMS staff email/password. Firebase CLI/Google login is separate from the staff account used by the app.
3. After successful authentication the workspace opens as a maximized normal window. Open **Members** without signing in again. The app reads `users/{uid}.access` to scope the membership list to that staff member's club. It does not ask for an arbitrary club ID or change that profile. Missing access fails closed.
4. View recent members, page through records, use the DNA view, or submit a search by name, DOB, state/government ID, CERMS membership number, or membership type.
5. **View** opens member details, notes, file links, and visit/order history. **Sign out** clears the reader and visible member state. Authentication is in memory; closing or reloading ends the session.

The current public Firebase web config was copied from the old project into ignored `.env.local`. For another checkout, copy `.env.example` and fill in the existing web client identifiers. These are not Admin secrets. Do not copy the old combined configuration file, which also contains unrelated integration configuration. The connection is deliberately restricted to project `cerms-7af24` and its named `cerms` database. Both the Lite reader and realtime admissions reader explicitly select `cerms`; the desktop request guard blocks access to `(default)` and other databases.

The new database must contain the required `users/{uid}` profiles (including `access`) and club data, with rules that permit the intended reads. Authentication remains in the same Firebase project. Data, rules, indexes, and backup schedules are not copied from `(default)` by this connection change. Missing profiles fail closed; any provisioning or migration requires separate authorization.

## Protection

The user's standing requirement is recorded in `AGENTS.md`: no Firebase changes without explicit permission. The user has separately authorized the specific owner-only system switch; member records remain read-only.

- The membership reader imports no Firestore mutation functions. It has no save/delete methods and never updates last login, version, access, notes, counters, or any other Firestore fields.
- The Electron request guard only allows the existing project's `batchGet` and `runQuery` Firestore RPCs plus the read-only Listen channel for Admissions & rentals. It rejects membership mutations, batch-write, streaming-write, Storage writes, and Realtime Database requests. The sole commit exception is the separately authorized owner-only access-field update described in [system switching](SYSTEM-SWITCHING.md). The CSP restricts renderer connections to the required Firebase hosts.
- Auth requests are limited to existing-account sign-in, account lookup, token refresh, and user-requested password-reset emails. The reset endpoint must contain `requestType: PASSWORD_RESET`; other email actions are blocked. No account creation, profile changes, or direct password-change operations are enabled. Normal Firebase Authentication sign-in bookkeeping is separate from Firestore document writes.
- No persistent member cache, analytics SDK, migration, backend deployment, rule update, or index creation is included.
- Tests use synthetic fixtures. The request-policy tests evaluate URLs locally; they do not probe production write endpoints.
- Files open only from the existing Firebase Storage bucket using HTTPS. Unknown/external file URLs stay disabled. No uploads, replacement signatures, or deletes are provided.

This is an application-side write guard, not a change to deployed database security rules. The existing server rules still enforce who can read which documents. Future code must preserve the guard; enabling any write path requires separate explicit permission.

## Compatibility and limits

- Default listing follows the old `access` + `creation_time DESC` query and requires the corresponding composite index in `cerms`. Pages have 25 records and an opaque in-memory cursor. Records missing `creation_time` are omitted by this ordering, as in the legacy recent list; equality searches can still find them.
- Name search is exact first/last/full-name matching with common capitalization variants, matching the legacy database search. It is not a new substring/full-text search. DOB search checks ISO and slash formats without rewriting stored dates. Government ID and membership number remain distinct fields.
- DNA and searches use existing fields and equality queries. If a query needs an unavailable index, the app reports an error; it never creates one.
- Member details preserve legacy timestamp/Unix-seconds handling, old string notes, middle names/suffixes, IDs, waiver flags, and parallel attachment-name/URL arrays.
- History currently reads up to 50 visits and 50 orders in document-ID order, using the old equality filters. If more exist, the screen explicitly reports the limit. It does not label these as the latest records or compute full-history totals.
- Create, edit, renewal, tag/DNA changes, check-in, orders, deletion, scanning, and file changes are not implemented in this step. Create/scan controls show their unavailable status.
- Admissions & rentals also supports live read-only data. Other unfinished modules display “Not implemented yet” within the authenticated workspace. They show no sample financial, admission, or product records.

## Verification scope

For the named-database connection, a read-only CLI metadata request confirmed `cerms-7af24/cerms` is `STANDARD`, `FIRESTORE_NATIVE`, in `nam5`. Live staff sign-in and data permissions still need verification in the app.

The CLI successfully read the default database metadata and deployed index definitions after the user reauthenticated. Database edition is `STANDARD`, type `FIRESTORE_NATIVE`, location `nam5`. No database records were exported or mutated, and no configuration was deployed.

`npm run test:membership` intercepts every external HTTPS request and exercises the actual Firebase SDK against synthetic Auth/Firestore responses. This validates app integration behavior without touching live records. Actual staff credentials are entered by the user in the app; they are not requested in chat or embedded in tests. Live permission/rule compatibility must be confirmed with that sign-in.
