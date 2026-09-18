# System switching

The user subsequently authorized a development system. `cerms/system/dev` was created with only `businessName: "Dev System"`, using a nonexistence precondition, and read back to verify it. This is a separate business scope within the same database, not a separate Firebase project or server. No user access was switched and no development records were seeded.

On September 18, 2026, the user authorized provisioning only The Z SA in the named `cerms` database, using its existing legacy system ID. A read-only lookup confirmed `TheZSATX` identifies `The Z SA`. The document `cerms/system/TheZSATX` was created with only `businessName: "The Z SA"`, using a nonexistence precondition, and read back to verify it. No other legacy system settings were copied. No user access fields, legacy documents, Auth accounts, rules, or indexes were changed.

Only Firebase Auth UID `c7D7AH07kgXmjn8tSiOgzHscLZ12` can use the CERMS system switcher. The UID is hardcoded in `src/shared/firebase-policy.ts`; no editable role, display name, or email address grants this capability.

Use **Change system** under the current system in the sidebar. The picker reads existing `system` documents and displays `businessName` with the document ID. Select a different system and click **Switch system**. Opening the picker, selecting an option, canceling, and signing in never write to Firebase.

The operation checks the authenticated UID, verifies the target system and user profile exist, rechecks authentication, then calls `updateDoc` with only `{ access: systemId }` on the designated user's existing document. It does not create a profile or modify any other fields, users, systems, members, rules, or indexes. An unchanged selection performs no write.

The old reader is closed and the entire workspace is unmounted during switching. Saved access is read back and a new reader scopes all implemented data views to that system. Paging, searches, dialogs, and pending responses from the previous workspace are discarded. Other modules remain unimplemented. The change persists to the user's profile and therefore applies on subsequent logins and to other clients that use that profile.

If the write fails or its response is uncertain, CERMS reads the profile again instead of assuming the old access, repeating the write, or attempting a rollback. If it cannot read the profile, it signs out and displays a recovery message; it never resumes the old workspace with uncertain access.

## Desktop guard and Firebase rules

The desktop network policy permits exactly one `documents:commit` write: an update to the fixed user document with only an `access` string, an update mask containing only `access`, and the existing-document precondition. Extra writes, fields, transformations, deletions, creations, or alternate paths remain blocked. The outgoing bearer-token claim filter also requires the designated UID, this Firebase project, and an unexpired RS256 token. Token signatures are validated by Firebase, not by the local claim parser. Neither the UI check nor the claim parser replaces Firebase authorization.

The existing deployed Firestore rules remain authoritative. They must allow this UID to list/read systems, update this access field, and read data scoped to the selected system. App controls apply to CERMS; backend-wide restriction across other clients requires appropriate deployed rules. No rule or configuration changes were made or deployed for this feature. Permission denial is displayed without attempting to change rules.

References: [Firebase field updates](https://firebase.google.com/docs/firestore/manage-data/add-data#update-data) and [authenticated Firestore rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Verification

Unit tests cover permitted and forbidden commit shapes, UID/token claim restrictions, missing systems/profiles, unchanged selection, and the isolated update payload. Desktop integration tests intercept all external HTTPS traffic and exercise ordinary-user exclusion, system switching, new-system reads, a denied commit, and failure to reload after a successful commit. No real access field or production record is changed by these tests.
