# Skeleton verification

## Read-only membership update

The membership update adds 7 tests (16 total) covering the read-only request policy, blocked mutations/account changes, attachment URL restrictions, legacy detail fields, and date/name search normalization. Strict TypeScript and production build passed.

`node scripts/membership-smoke.mjs` passed with **all HTTPS requests intercepted**. It exercised the actual Firebase client SDK's sign-in/account lookup, scoped profile/member reads, cursor paging, details, visit/order history, DNA and DOB/government-ID searches, changed-access rejection, and sign-out. All responses were synthetic. No Firebase credentials or records were sent to the live service by this test. A fixture-only screenshot was inspected at `artifacts/members-readonly-fixtures.png`.

Read-only CLI metadata/index inspection succeeded after reauthentication. Actual staff sign-in and deployed rule compatibility have not been validated with a real staff account. No Firestore writes, Storage writes, rule/index changes, or deployments were performed.

## Original skeleton verification

Verified locally on September 16, 2026, on macOS x64 with Node 22.13.1.

| Check                                | Result                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm run check`                      | Passed: 9 unit tests, strict TypeScript check, and production builds of main, preload, and renderer  |
| `npm run format:check`               | Passed before this verification note was added; the note was subsequently checked separately         |
| `node scripts/smoke.mjs` after build | Passed with the actual Electron 44.4.1 runtime                                                       |
| Visual inspection                    | Overview screenshot inspected; saved locally at `artifacts/overview.png` (ignored by Git)            |
| Legacy working tree                  | Existing `.DS_Store` and `firebase/functions/index.js` modifications preserved; no source edits made |

The desktop smoke test covers the custom application protocol, absence of renderer `require`, sandbox/context-isolation settings, the typed preload response, navigation, member search, member detail dialog and Escape dismissal, empty search results, do-not-admit filtering, waitlist filtering, product search, planned-module labeling, desktop diagnostics, and route reload. No renderer exceptions were observed during that run.

The test clears an inherited `ELECTRON_RUN_AS_NODE` variable set by this IDE host, so Electron starts as a desktop application. If launching manually from an environment that also sets this variable, unset it first. Normal terminal sessions generally do not set it.

Production compatibility is not validated yet: no live authentication, Firestore queries/writes, rule tests, hardware tests, accounting reconciliation, installers, code signing, or publishing were performed. The earlier Firebase database-inspection attempt failed because the saved CLI credentials had expired.

Do not run production-build checks simultaneously with the dev server: electron-vite uses the same `out/` directory for both. Close the dev server before running `npm run test:smoke`.

## Application login entry (2026-09-16)

The app now opens in a 480 × 680 login window. Firebase staff authentication and the existing access-profile check gate the entire workspace. Successful login enters native fullscreen; sign-out returns to the compact login screen. Reload/close ends the in-memory session. Login and workspace show the runtime application version. Support is a local placeholder.

Forgot password explicitly sends a Firebase password-reset email on form submission. The request guard allows only `PASSWORD_RESET` bodies on the email-action endpoint; all existing database and account mutation blocks remain. No backend configuration or data was changed.

Validation: 17 unit tests, TypeScript and production build passed. Both Electron desktop smoke suites passed, including protected routes/reload, visible version, support, reset-email flow, fullscreen entry/exit, shared membership session, and existing read-only membership checks. All Firebase responses in the integration suite were intercepted synthetic fixtures; no real emails or production data requests were sent. Actual staff credentials and delivery of real reset emails remain user validation.

## Operational screen presentation (2026-09-16)

Removed promotional banners, version-launch copy, preview labels, fictional dashboard metrics, and sample records from reachable application screens. Overview provides working Members and Settings shortcuts. Unfinished modules display “Not implemented yet”; Settings shows account and runtime application information. Read-only membership access and all Firebase protections remain unchanged.

Validation: 17 unit tests, TypeScript, production build, login desktop smoke, and intercepted membership desktop smoke passed. The membership smoke also navigates every unimplemented module and checks its unavailable state. Its ID-query assertion now waits for the asynchronous request rather than assuming footer rendering means the request has completed. No live Firebase requests or database changes were made.

## Owner-only system switching (2026-09-16)

Implemented Change system for the hardcoded UID `c7D7AH07kgXmjn8tSiOgzHscLZ12`. The picker lists existing systems and the deliberate Switch system action updates only that user's `access` field. Workspace state is discarded and saved access is reloaded before showing data from the chosen system. The desktop write exception validates the exact single-field commit and filters bearer-token claims for this UID/project; Firebase remains responsible for signature validation and deployed authorization rules.

Validation: 26 unit tests, TypeScript, and production build passed. The intercepted desktop membership test passed ordinary-user exclusion, owner switching, new-system member queries, account display, unchanged-selection disabling, denied-write recovery, and sign-out recovery when a committed change could not be reloaded. The test also confirms subsequent sign-in does not write access. Firebase SDK commit URLs include an API-key query parameter; body inspection uses the URL pathname so the narrow guard handles that correctly. No production access, member records, systems, rules, or configuration were changed during implementation/testing.

## Maximized workspace (2026-09-16)

Supersedes the fullscreen login behavior above: successful login now maximizes a normal desktop window, retaining the native title bar and desktop controls. Native fullscreen is disabled. Sign-out restores the 480 × 680 login window. TypeScript and production build passed; the intercepted desktop test confirmed `isMaximized() === true`, `isFullScreen() === false`, and compact-window restoration on sign-out, including the existing membership/system-switch flows. No live Firebase requests were sent.

## Live read-only Admissions & rentals (2026-09-16)

Connected the page to the original active, system-scoped activity query and legacy rental fields. Full Firestore SDK snapshot listeners update admissions and distinct active members, while a live profile listener verifies system access. The Lite membership reader and owner-only access-write exception remain unchanged. The new Listen-channel allowance cannot send Firestore Write-stream mutations.

The interface includes local search, inside/outside/waitlist/expired filters, one-second rental countdowns, live visit details, reconnecting/error states, and missing-member placeholders. Page exit, sign-out, and system switching stop subscriptions and clear view state. Rental expiry never writes checkout state.

Validation: 33 unit tests and the production TypeScript/build checks passed. A separate real-SDK integration test passed against a temporary localhost Firestore emulator in `demo-cerms-admissions`, exercising new visits, member edits, rental/waitlist edits, checkout-in-progress, deletion, and access revocation. The Electron desktop test passed simulated admissions additions/edits/removals, live details, countdowns, filtering/search, reconnecting labels, and switching systems while Admissions was open. The UI test substitutes only its admissions data module; the separate unit and emulator tests exercise the real subscription service. No production reads or writes were sent during these tests.

## Shared Overview / Admissions view (2026-09-16)

Both routes now render the same Activity component directly. The previous Overview shortcut/dashboard placeholder was removed. Filters, search, countdowns, details, and subscription logic have one implementation; navigating between the two routes preserves view state without opening a second listener. TypeScript/build and the synthetic Electron desktop suite passed, including a shared-search-state and unchanged-subscription assertion. No Firebase data was changed.

## Overview rental alerts (2026-09-16)

Added Overview-only red expired-rental and amber five-minute-warning cards above the shared Admissions component. Counts use all current visits, independently of the table's search/filter. Card selection clears search and selects the matching shared filter. Both routes use one urgency function for expired/ending-soon filters and row highlighting; the existing one-second clock advances urgency without a database event. Waitlisted guests with enabled rentals are included. Missing expiry, disabled rentals, and inactive visits are excluded. Alerts are unavailable during reconnection/error states rather than presenting unverified counts as current.

Validation: 34 unit tests and TypeScript/production build passed. The synthetic desktop test verified warning counts, alert-driven filters, cleared searches, reconnection disabling, and alert visibility only on Overview, while preserving the shared view and subscription across routes. No additional queries or Firebase writes were introduced.

## Isolated member creation (2026-09-16)

Audited the legacy form, IPC/save/checkout flow, ID allocation, import permissions, scanner fields, and member record shape. Added a shared React form with all original non-waiver options, a Firebase-independent draft/creator contract, a single legacy encoder, and an emulator-only writer. The normal Electron application and its production write guards remain unchanged; the writer is absent from the production bundle.

Validation: 39 unit tests passed; TypeScript (including the lab) and production build passed. The separate real Firestore emulator test passed creation/reader compatibility, idempotency, unchanged duplicate records, conflicting request contents, concurrent identity/number reservation, existing legacy numeric/string IDs, and absence of order/system writes. The browser test passed original field choices, malformed-scan recovery, scan autofill, age validation, normal creation, duplicate rejection, import overrides, narrow layout, and no external network requests. Synthetic screenshot: `artifacts/member-creation-local.png`. Both emulator suites are opt-in and skipped in the normal unit run; the admissions emulator was not rerun for this change.

No live Firebase reads or writes occurred. The old application was not run, and physical scanner compatibility remains unverified. Reservations only coordinate the new writer; safe coexistence with legacy writers and checkout integration remain prerequisites for production enablement. See [member creation audit and migration plan](MEMBER-CREATION.md).

## Custom About window (2026-09-16)

Added a separate React About window with a forest-green CERMS identity, actual package version and author, platform name, copyable application details, native window controls, Done, and Escape. macOS uses CERMS → About CERMS; Windows/Linux use Help → About CERMS with a visible menu bar. Settings also opens the same single-instance window. The About entry loads no authentication/session or Firebase module. Its IPC handlers check the requesting window and frame; it cannot resize the main window or open member attachments.

Validation: 39 unit tests passed, plus TypeScript and the multi-entry production build. `node scripts/about-smoke.mjs` passed on macOS: menu launch, version, single-instance focus, no layout overflow, sandbox, rejected cross-window operations, clipboard details, Done/Escape, reopening, and retained login. Screenshot: `artifacts/about-cerms.png`. Windows/Linux menu paths are implemented but have not been exercised on those operating systems. No Firebase data was changed. `npm run test:about` builds and runs the desktop check.
