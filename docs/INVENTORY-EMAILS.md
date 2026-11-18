# Low inventory email notifications

Owner configuration is in Settings → Low inventory emails, separately for the
selected business. Enable alerts and enter up to 20 addresses separated by commas,
semicolons or new lines. Addresses are validated, normalized and deduplicated.
Each recipient receives a separate email; recipient addresses are not shared in
the To list. Save and reload are available, with version checks against concurrent
edits. Other staff cannot view/configure this recipient list. Settings default
off with no recipients; no business is opted in by deployment.

Products → product editor → Inventory provides the existing **Inventory warning**
threshold. An active, non-payout product alerts when tracked stock is at or below
that threshold, including zero. Blank inventory means untracked/unlimited, and a
blank warning disables alerts for that product. Inventory par is included as
context but does not determine the alert threshold.

The service runs on the server after product writes, including the existing
atomic checkout stock decrement and deliberate catalog stock/threshold edits.
Checkout itself was not changed and never waits on SMTP. The notification service
does not alter stock, prices, products, payments or registers. It does not need a
desktop application to stay open. Enabling alerts checks existing low-stock
products in the background using paginated business-scoped reads. Saving a
changed configuration also runs a check. Unchanged saves do not requeue a scan.

One alert episode is maintained per product and enabled period. Further sales
while stock stays low do not repeat alerts. Replenishing above the threshold
rearms the next low-stock alert. Making the product inactive/untracked or
removing its threshold is also a recovery. Disabling and re-enabling alerts starts
a new enabled period and can send fresh alerts for current lows. Recipient changes
apply to future alerts; adding a person does not resend an already completed
low-stock episode. An in-flight alert uses the recipient snapshot captured when
it was queued. A recorded healthy version and last-alert stock version handle
out-of-order/repeated Firestore events without repeatedly notifying on every sale.

Each email contains the business, product name/ID, remaining stock, warning
threshold and inventory par. HTML is escaped and a full plain-text alternative
is provided. Quantities are the snapshot when queued; subsequent stock changes
may make them stale. There are no automatic stock adjustments or reorders.

## Storage and backend scope

Only named Firestore database `cerms` is used. No legacy/default data is read or
written, and no shared Storage/Auth/rules/index changes are needed.

- `system/{business}/inventoryEmailSettings/config`: owner-saved enable flag,
  canonical recipient list, revision, enabled-period UUID and audit fields.
- `system/{business}/inventoryEmailState/{productId}`: latest recovery/alert
  versions, enabled period and alert ID.
- `system/{business}/inventoryAlerts/{id}`: immutable queued stock snapshot and
  recipient list plus delivery summary.
- `system/{business}/inventoryAlerts/{id}/deliveries/{recipientHash}`: one recipient
  claim/delivery audit. SMTP acceptance uncertainty is retained for review and
  never automatically resent. Other recipients still receive their own attempts.

These paths remain default-denied to direct desktop Firestore reads/writes. The
owner-only `inventoryEmailSettings` callable verifies the authenticated fixed owner
and saved business before reading/saving config; no employee/profile permissions
are added. Input schemas and the desktop request guard permit only its exact
get/save calls. There is no arbitrary-recipient send/test endpoint.

Only three new functions are deployed:

- `inventoryEmailSettings`: authenticated owner configuration, no SMTP access.
- `inventoryProductWritten`: v2 write trigger for
  `system/{business}/products/{productId}`, explicitly database `cerms`.
- `inventoryEmailSettingsWritten`: v2 write trigger for
  `system/{business}/inventoryEmailSettings/config`, explicitly database `cerms`.

Both triggers reuse the existing CERMS 5 support identity and support SMTP secret.
Eventarc event-receiver rights were added only to that identity; the required
Google-managed Eventarc service-agent binding is allowed as a scoped deployment
effect. Firebase CLI also added project-wide default-compute Run Invoker and Pub/Sub
Token Creator grants during the first trigger deployment. Their removal was
proven against the original IAM baseline hash. They were replaced by Run Invoker
only on the two new inventory services for the support identity, and Pub/Sub
Token Creator only on the support service account. No pre-existing grant was
removed. Every other project IAM binding, legacy function, rule/index, database
setting, existing secret policy, bucket policy and schedule must match baseline.
Trigger delivery retries are enabled; recipient claims prevent duplicate SMTP
attempts. Interrupted sending audits require review rather than blind resending.
No periodic stock scanner or scheduled job is added.

## Verification and release

Focused checks only:

```sh
npm run build:inventory-email-domain
node --test functions/inventory-email.test.mjs
npx vitest run tests/inventory-email.test.ts
npm run typecheck
node scripts/inventory-email-smoke.mjs
```

The server checks use synthetic immutable snapshots and a transactional in-memory
store: multiple recipients, same-episode suppression, zero stock, recovery and
delayed events, existing-low scans, disabled/untracked/inactive products, owner
scope and uncertain-recipient isolation. The desktop check uses an isolated
profile and intercepted requests to save/reload/edit/disable multiple recipients.
No real product, recipient list or SMTP email is written as a test.

Scoped config: `firebase.inventory-email.json`; generated validator:
`functions/inventory-email-domain.mjs`. Deployment verification is recorded in
`INVENTORY-EMAIL-DEPLOYMENT.json` after ACTIVE and compatibility checks. The
feature does not require redeploying `completeSale` or existing catalog services.
Desktop source is ready for the next deliberately requested release. No desktop
packaging, publication or version increment is part of this feature request.


For future scoped redeployments, use `scripts/inventory-email-deployment.mjs`
`before`, `grant-eventarc`, then the exact three-function deploy. Run
`scope-eventarc-iam` after deployment and `after` to verify. The scoping helper
refuses removal unless the resulting project IAM matches the recorded baseline
apart from the specifically allowed Eventarc identity grants. It preserves IAM
conditions/etags and existing support-account bindings. A full Firebase deploy is
not part of this feature.
