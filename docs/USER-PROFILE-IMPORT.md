# User profile import — September 18, 2026

The user authorized copying all legacy user profiles into the CERMS 5.0 database.

- Project: `cerms-7af24`.
- Source: `(default)/users`, accessed read-only.
- Destination: `cerms/users`.
- Source profiles: 29. Destination profiles before import: 0.
- Created and verified: 29, preserving document IDs and all stored profile fields and Firestore value types.
- Each write required that the destination document did not exist. No existing documents were overwritten.
- Verification compared every destination profile's fields against the source data read for the import.
- No source writes, Auth changes, other collection imports, rule deployments, or index changes were performed.
- The source profiles had no subcollections or document-reference fields. All contained a valid string `access` field for the current login flow.

The import ran as a separate maintenance process using the existing Firebase CLI login; no administrative credentials or import functionality were added to the desktop. Profile contents and tokens were not saved in this report. Firebase Authentication remains shared by both databases in this project, so existing credentials are retained. Interactive staff sign-in was not tested.

A read-only inspection at import time found test-mode public reads and writes permitted before `timestamp.date(2026, 10, 18)`. The user subsequently authorized initial security rules, and that public policy was replaced on September 18, 2026. See [the current security rules](CERMS-SECURITY-RULES.md).

## Authorized profile cleanup — September 18, 2026

After import, the user requested that `cerms/users` retain only `uid`, `displayName`, `email`, `access`, `rank`, and `version`. All 29 profiles were updated and read back for verification. Each `uid` was populated from the document ID; all existing retained values and types were preserved. Permission fields and other legacy settings were removed.

Five profiles had no version, and the user explicitly requested leaving those absent. One profile had no email; this absence was also preserved. No placeholder values were introduced. The cleanup used one atomic commit with each document's read `updateTime` as a precondition to protect concurrent edits. It made no requests to `(default)` and changed neither Auth nor database rules. The exact-copy verification above describes the original import; the new profiles intentionally now contain the reduced field set.
