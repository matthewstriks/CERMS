# Login service status

The initial login screen has a top-right Services icon. Its dot summarizes the most severe status: green for no reported issue, yellow for checking/limited/unknown/degraded, red for no internet response or a reported provider outage. Clicking it opens a keyboard-accessible details panel with separate internet, Firebase sign-in, Firestore, checkout/backend and product image storage rows, explanations, last-check time and Refresh. Native popover behavior supports Escape and outside-click dismissal. The status never disables sign-in or password reset.

Checks run at login, every minute while signed out, on network events and when the window regains focus. Pending checks are yellow. Reports older than two minutes become yellow until verified again. Offline events immediately mark internet red and provider rows unverified; recovery triggers another check. Timeout/network/report failures show unknown rather than healthy. A failed connectivity probe with reachable provider reports is yellow, since an individual endpoint can be blocked without loss of all internet access.

The trusted main-process IPC handler accepts no destination/credentials/body arguments. It runs exactly three fixed, public, credential-free GET requests in parallel, with eight-second timeouts, redirects rejected, in-flight deduplication and a ten-second cache:

- `https://www.gstatic.com/generate_204` for connectivity from this device.
- [Firebase incident reports](https://status.firebase.google.com/incidents.json).
- [Google Cloud incident reports](https://status.cloud.google.com/incidents.json).

The [Firebase dashboard](https://status.firebase.google.com/) directs Authentication, Cloud Firestore, Cloud Functions and Cloud Storage incident coverage to Google Cloud, so both feeds are consulted. Product aliases include Authentication/Identity Platform, Cloud Firestore, Cloud Functions/Cloud Run and Cloud Storage. Active incidents are mapped through affected-product titles as well as the legacy service name; resolved and future incidents are ignored. Provider outage is red; disruption/information is yellow. A missing/malformed feed cannot produce all-green provider rows, but a known outage stays red even if another feed is unavailable.

Provider rows describe **global public reports**, not proof that CERMS's project, deployment, region, account permissions or an individual printer is operational. The UI states this distinction. Account access is validated by normal sign-in. No production documents, Auth accounts, password-reset requests, callable handlers, Storage objects, test sales or printer jobs are touched by these checks. There is no backend deployment or Firebase rule/request-guard expansion. Main-process fetch is limited by code to those public GET endpoints.

Validation: `npm run check` passed 181 client checks and build. Seven synthetic status tests cover mapping, outage priority, malformed/unreachable feeds, captive/blocked checks and cache/deduplication. `node scripts/smoke.mjs` uses synthetic IPC snapshots to verify green/yellow/red, stale/offline/recovery behavior, accessible details and Escape dismissal, while retaining the existing login/sandbox tests. A public-endpoint-only manual check verified real report parsing without accessing Firebase project data. Screenshot: `artifacts/login-service-status.png`.
