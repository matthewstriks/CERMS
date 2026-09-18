# Member activity log

The user authorized deployment of all pending rules on September 18, 2026. Log rules are deployed to `cerms`; see [deployment verification](CERMS-FEATURES-DEPLOYMENT.json). No live log records were written or backfilled for testing.

The member details dialog contains a collapsed-by-default activity log directly below notes. Opening details records one `member.viewed` event, including when opened from a scan or creation result. Expanding, refreshing, switching detail/history tabs and React effect replay do not append another event. Reopening details creates a new event. A failed/uncertain write shows a warning in the collapsed summary and a retry action inside; retries reuse the same event ID and confirm any previously successful commit.

Creation is displayed from the existing immutable member creation timestamp and `createdBy` UID, without a migration or invented historical actor. Older members without these fields show “not recorded.” This creation entry is a baseline beneath the newest-first view events. Other historical activity is not retroactively inferred.

## Storage and query review

Target: Standard edition, named `cerms` only. Each view is a separate immutable document at `system/dev/memberLogs/{memberId}/events/{eventId}`. Fields: `type` (`member.viewed`), `actorUid`, `actorName` (profile name snapshot), `schemaVersion` (1), `occurredAt` (server timestamp). No ID barcode, contact details or notes are copied into logs.

Firestore Lite queries the member's events by `occurredAt desc`, limit 50, with document-snapshot `startAfter` cursors. History is fetched only on expansion, refresh or paging; there is no listener or per-member growing array. The default single-field index suffices. See [Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors).

The desktop commit guard permits exactly one create-only view write with the fixed timestamp transform and schema. Rules independently require the owner UID, saved Dev access, a member in that same system, an actor UID matching authentication and a name matching the saved staff profile. Timestamps must equal request.time. Log lists require a limit of at most 50. Updates/deletes, arbitrary event types, forged names/actors, foreign or missing members and other businesses are denied. Other businesses remain read-only and show the creation baseline only.

This is application activity reporting, not proof that a person read the screen or a complete server-side read audit. Clients can fail before recording a view; failures are surfaced and retryable. Future action types should be added with explicit schema/rule support, and mutation events should be committed atomically with their corresponding action.

Validation: guard unit tests, synthetic Firestore emulator authorization/mutation tests, and intercepted desktop UI tests cover collapse/expand, bounded pagination, one event per opening, repeat toggles/refresh, and failed-view retry. No live Firebase test requests.
