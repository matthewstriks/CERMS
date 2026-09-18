# Admissions & rentals

Overview and Admissions & rentals render the same Activity component, including its filters, table, details, countdowns, and subscription logic. Overview additionally displays rental-alert cards above the shared view. Expired rentals are highlighted in red and rentals ending within five minutes in amber; clicking a card clears search and selects the matching shared filter. Both pages share the same urgency calculation and row highlighting. Alerts use the existing rows and timer, with no additional Firebase reads, and are disabled while live data is unavailable. Switching between these two navigation entries preserves the view state and existing subscription. The shared view reads the existing CERMS default Firestore database. No database records, rules, indexes, or configuration are changed by this integration.

## Behavior

- Uses the legacy `activity` query: `active == true` and `access ==` the signed-in system. Hides `goingInactive` visits as the old page does. It does not impose a limit that could silently hide active visits.
- Firestore snapshot listeners add, update, and remove visits automatically. One member listener per distinct active member supplies names, membership numbers/types, and DNA/tag indicators and updates them when they change.
- Rental information comes from the existing `lockerRoomStatus` array. Arrival uses `timeIn`; visit notes remain unchanged. Rental countdowns update locally every second, including for guests on the waitlist who still have an assigned rental. Expiration is visual only and never checks anyone out automatically.
- Filters show all active visits, inside, outside, waitlist, and expired rentals. Local search matches member names/numbers and rental types/locations. Visit details update while open and close when the record leaves the result set.
- Missing, removed, inaccessible, or cross-system members display a clear placeholder without exposing another system's member data.
- No check-in, checkout, renewal, rental assignment/editing, in/out, or waitlist mutations are enabled.

## Session and network handling

The existing Lite SDK remains in use for membership reads and the separately authorized owner access update. Admissions lazily initializes the full Firestore SDK on the same Firebase app/Auth session, with an eager in-memory cache and no persistent disk cache. A server-confirmed listener on the current user profile verifies access before starting the activity query. Cached snapshots do not introduce new records into the view. Connection interruptions are marked as reconnecting; if profile access cannot be confirmed, rows are hidden.

Leaving the shared view for another module, signing out, and system switching unsubscribe listeners and discard page state. Access changes or terminal query/profile errors clear records. Transient network loss uses Firebase's reconnection behavior; terminal failures offer a retry. The desktop guard permits only the existing database's read-only Listen channel; the separate Write stream stays blocked. The owner-only access commit exception is unchanged and is not invoked by this page.

## Verification

- `npm run check`: legacy decoding, cross-system protection, profile gating, cached/offline metadata, real-time callback changes/removals, missing members, listener cleanup, and request-policy tests.
- `npm run test:membership`: Electron UI checks with intercepted Firebase responses and a test-only substituted admissions module. Covers filters/search, countdowns, live detail changes, removals, new arrivals, reconnection labels, and cleanup/system scoping. The production app contains no fixture hooks.
- `npm run test:admissions`: starts a cached Firestore emulator on a temporary localhost port with project `demo-cerms-admissions`, exercises the real SDK/service against synthetic documents, then stops it and removes temporary rules/logs. Requires Java 21 and a locally installed Firestore emulator; `FIRESTORE_EMULATOR_JAR` can override its jar path. No production endpoint is used.

The live SDK/emulator test validates initial empty state, new admissions, member edits, rental/waitlist changes, checkout-in-progress, deletion, and access revocation. Real production permissions/index compatibility still depend on the deployed Firebase configuration; no rules or indexes are deployed automatically.

References: [Firestore real-time listeners](https://firebase.google.com/docs/firestore/query-data/listen) and [memory cache configuration](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
