# Initial CERMS 5.0 security rules

Target: project `cerms-7af24`, named database `cerms` only. Source: `firebase/cerms.rules`. Deployment configuration `firebase.cerms.json` contains no `(default)` database, Storage, indexes, or Functions configuration. Never deploy these rules to the legacy database.

## Access policy

- Anonymous clients cannot read or write any documents.
- Signed-in accounts can get/listen to their own `users/{uid}` document, but cannot list users or read other profiles, including through the owner account.
- Staff business-data access requires an existing profile with matching uid and a valid access string. Authentication alone does not grant business-data access. No permissions are inferred from rank.
- Members, orders, and activity are read-only and scoped by `access == current user's saved access`. This preserves the current readers without creating or seeding any collection. All queries must include that access filter. The rules do not impose a limit on the existing realtime admissions query.
- Only the designated UID `c7D7AH07kgXmjn8tSiOgzHscLZ12` can read/list systems and switch its own access to an existing system document. The resulting user profile is validated; every field other than access is immutable. Profiles may omit email and version. User creation/deletion and system writes are denied to every client.
- Unknown collections and all subcollections are denied. There are no time-based public-access exceptions.

These rules are a prototype baseline, not a guarantee of issue-free future features. Future member creation, orders, staff administration, and revised roles need explicit schemas and rules with tests before enabling writes. Existing query indexes may need separate configuration; the emulator does not prove production index availability. No system documents were imported; the system picker will be empty until systems are deliberately provisioned. Login uses the user's profile and does not require a system document to exist.

## Validation

`npm run test:rules` starts a disposable loopback Firestore emulator restricted to `demo-cerms-rules`, loads the exact rules into its named `cerms` database, seeds synthetic fixtures locally, and runs 76 checks. It never uses live Auth credentials or live data. The emulator's owner token is only sent to its dynamically allocated loopback port.

The tests cover own-profile reads with absent email/version; other-profile denial; user listing and self-provisioning denial; role, UID, version, access and permission-field mutation denial; invalid/missing staff profiles; club isolation; scoped and unscoped business queries; current recent-member, DNA, OR-name, DOB-IN, active-admission and history queries; business write denial; owner-only system listing; field pollution/type/size/path validation on owner updates; required rank removal; nonexistent-system switching; switching to an existing system; immediate loss of access to the prior club; and unknown/nested paths.

## Adversarial review

| Attack                                                                | Outcome                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public listing and unauthorized access                                | No anonymous allow branch; anonymous reads and other-user reads denied. Collection reads require provisioned staff and matching access.                   |
| Create/update validation bypass                                       | All creates denied. The sole allowed update calls validUser and diff().affectedKeys().hasOnly(['access']).                                                |
| Ownership hijacking and immutable fields                              | Cannot create profiles, alter uid/rank/email/version, or modify another user's profile.                                                                   |
| Type juggling, excessive strings, missing fields                      | Owner update rejects nonstring access, access over 1500 characters, and removed rank. Only access can change; other strings are bounded by the validator. |
| Privilege escalation/schema pollution                                 | Rank confers no authorization; new permission/extra fields denied. Authority comes from the authenticated UID and existing profile.                       |
| Invalid state transitions, timestamp/counter replay, negative amounts | Business writes denied entirely; future operations need their own validators.                                                                             |
| Path traversal and cross-club access                                  | Access must be a valid single document ID; target system must exist. Cross-club gets and queries denied.                                                  |
| Mixed-content privacy leak                                            | Other users cannot read a user's email/profile, including the designated switcher.                                                                        |
| Orphaned or nested collections                                        | No nested allow rules; default denial applies whether or not parent exists.                                                                               |
| Query mismatch                                                        | Current query shapes pass the local policy checks; production indexes and real sign-in remain separate validation concerns.                               |
| Validator consistency                                                 | No create grants; every granted update requires the same complete profile validator.                                                                      |

Administrative Google Cloud IAM/service-account access bypasses Firestore client rules and must remain restricted separately. Firestore rules do not secure Storage or installer downloads. Existing in-memory login and desktop network write protection remain in place.

Deployment evidence, when deployed, is in `CERMS-RULES-DEPLOYMENT.json`; it records the exact rules hash and read-only verification that the legacy release is unchanged. No live mutation probes or staff sign-in tests are performed.
