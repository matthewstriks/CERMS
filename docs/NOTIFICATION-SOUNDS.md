# Notification sounds

Settings → Notification sounds provides an enabled checkbox, 0–100% volume slider, explicit Test sound, Save sound preferences and cancellation of unsaved edits. Defaults are enabled at 100% when no preference exists; defaults are never backfilled on sign-in. Test previews the current draft volume even when automatic sounds are disabled, and never saves a setting. Zero volume is silent. Save applies preferences to the signed-in account; failed saves retain the draft and previous active setting for retry. Preferences reload on sign-in and business changes and follow the account on other devices at the next session load.

## Account and Firebase boundary

The sole new profile field is optional `users/{uid}.notificationSoundPreference: { enabled: boolean, volume: integer 0..100 }` in named database `cerms`. The dedicated authenticated `saveNotificationSoundPreference` callable derives UID from Auth, requires an existing matching profile, and updates only this field in a transaction. It accepts no UID, access, rank, theme, version, business or permission fields. Repeated selections are safe. It never creates profiles or mutates Auth, other users, business documents, legacy/default data, Storage, schedules or existing services.

`validUser` accepts and validates this optional map so the designated UID's existing access-only system switch remains functional. No direct preference/profile writes are enabled; the desktop request guard permits only the exact bounded callable shape. The rule change is exactly the optional field allowlist/validation against `firebase/releases/messaging-2026-11-15.rules`. Release: `firebase/releases/notification-sounds-2026-11-16.rules`; scoped config: `firebase.notification-sounds.json`. Standing deployment authorization applies. Evidence is recorded in `docs/NOTIFICATION-SOUNDS-DEPLOYMENT.json` after before/after compatibility verification.

## Playback

One local two-note sine chime is synthesized with Web Audio; no media downloads, voice, external service, audio files or native privileges are required. App volume scales a bounded gain below full output; device volume still applies. A signed-in account's preference controls automatic sounds on all screens, including a minimized/background workspace. Playback does not mark messages read or change existing read-receipt freshness/focus requirements. Alerts are coalesced within 750 milliseconds to avoid overlapping bursts. Test bypasses that interval. Sign-out, business transition, disable and zero volume stop active/pending playback.

User pointer/keyboard gestures unlock the audio context before alerts need it. Blocked automatic audio is dropped rather than queued to replay on a later interaction. Test reports unavailable audio instead of throwing an unhandled error. Automated tests use a fake AudioContext or Electron's mute flag; they do not exercise physical speakers.

## Incoming messages

The background unread subscription also signals genuinely new incoming sequences, independently of count changes or immediate read acknowledgements. Initial history, outgoing messages, duplicate snapshots, and read-watermark changes do not beep. Sequence high-water marks survive stream reconnects so old history does not replay; newly received messages during a disconnect can alert once on reconnection. Muting still advances these markers, so re-enabling does not replay a muted backlog. Changing account/business resets the baseline without a startup chime.

All-conversation reads now use live 50-document pages, satisfying the existing deployed `staffChats` list limit. Later pages rebind when ordering boundaries move, and IDs are deduplicated. No messaging rules, participants, message schema, profile permissions or read-watermark mutation paths are changed. Unread-message counts still exclude the caller's own messages, including when their newest message follows unread incoming messages.

## App notifications

A shared observer announces new or changed visible `role=alert` feedback and explicitly marked notification surfaces. Marked surfaces include success feedback, application updates, required member notes, delete confirmation, register-required prompts, rental checkout confirmation and expired-membership renewal prompts. Native unsaved-order replace/clear confirmations and update-install confirmation also request the shared chime. Ordinary page views/edit forms, loading/live counters, unread badges and polling status are silent. Semantic notification keys suppress repeated update-download progress and confirmation-button label changes. Merely changing sound settings or showing Test feedback does not create a second sound. New notification surfaces can opt in with `data-notification-sound`, using a stable string key for progress-heavy content.

No OS notification permission is requested and no new messages or popup deliveries are sent to other people; this adds audio to local existing notifications.

## Verification

`npm run test:sounds` builds the desktop, runs focused player/policy/message tests and the synthetic settings/message flow. `npm run test:rules` runs the exact rules against the isolated loopback `demo-cerms-rules` emulator. Server tests call the service with in-memory synthetic profiles. The intercepted Electron flow mocks AudioContext, checks silent startup/outgoing/replayed snapshots, sounds across screens, popup/mute/zero/volume/Test, no save from Test, failed save/retry and persistence after sign-out/sign-in. Existing messaging, register-required, checkout and notification paths use intercepted fixtures only. Never send real staff messages, save existing users' preferences, or probe production profile writes as tests.

Deployment completed November 16, 2026: `saveNotificationSoundPreference` is ACTIVE and the exact named-cerms optional-field rules are deployed. Before/after metadata verified every pre-existing function/schedule, all other rules releases, both database configurations/indexes and existing bucket settings/IAM unchanged. Current deployment configs retain the new rules baseline. No existing users' preferences or live messages were modified for testing.

Validation passed: 232 client checks, two synthetic server-service tests, all 370 exact local policy checks, desktop build/typecheck/formatting, the mocked-audio Settings/message/popup flow and the existing private messaging regression. The audio flow also verified stable download-progress keys and account persistence without startup replay. Light and dark Settings screenshots are under `artifacts/notification-sounds-settings*.png`.

The user subsequently selected 100% as the default. This changes only the fallback for missing/invalid preferences; existing saved values are preserved, and no profile backfill or additional backend deployment is performed.
