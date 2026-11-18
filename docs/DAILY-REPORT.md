# Dev System morning email report

CERMS 5 has a separate `sendDevDailyReport` scheduled function in the `cerms-reports`
codebase. It runs at **7:00 AM America/Chicago**, reporting the previous Central
calendar day to **matthew@rocmtssolutions.com**. The sender is
`CERMS 5 Reports <system@rocmtssolutions.com>` with the existing support reply-to.
The desktop does not need to be open or updated for this server-side report.

Only `system/dev` in named Firestore database `cerms` is included. The function
never discovers systems, queries root legacy orders/registers or accesses
`(default)`. It does not send the new report for TheZSATX or any other business.
The original `generateDailyRegisterReport`, its schedule, recipients, mail queue
and email extension remain unchanged and continue operating independently.

## Legacy reference and compatibility

Read-only inspection of the deployed legacy source verified it exactly matches
`CERMS/firebase/functions/index.js`. It runs at 7 AM Central and sends a public
workbook link through the `(default)/mail` extension. Its attachment sections are
Orders, Product Sales, Category Totals and register closes grouped by cashier.
The legacy Dev recipient and schedule were explicitly confirmed by the user.

The new report uses a styled HTML email with a plain-text alternative and an
actual `.xlsx` attachment. It creates no public report upload or download link and
does not use the shared legacy mail queue. SMTP authentication was verified
without sending an email. The later user request explicitly authorizes one real
Dev test email; it must be triggered only after deployment/compatibility checks.
Do not send additional test messages automatically.

## Email and workbook

The email includes transaction count, net sales/tax, waived product value,
payment breakdown, cash received/change/payouts and closed-register counted
cash/over-short. Still-open registers are identified as provisional.

Workbook tabs include:

- Summary: reporting period, totals, scope and data notes.
- Orders: receipt/register IDs, cashier, customer/member snapshots, products,
  subtotal/tax/net total, waived product value, every tender method, cash
  received/change and note.
- Order Items and Payments: quantities, prices, product/category identities,
  membership/rental/payout type, waiver state/value, split tender, directions and
  external references.
- Product Sales, Category Totals and Cashiers: quantity and monetary summaries,
  including waived units and value by product.
- Legacy Category Groups: Hygiene, Health, Snacks, Flip Flops, Incense and Towels;
  the Snacks group retains the Beverages/Candy/Chips/Snacks alias behavior.
- Registers plus a uniquely named sheet for each closed-register cashier:
  opening/closing times, ownership/closer, opening/expected/counted cash,
  over-short, full-shift POS totals, cash movements and closing note.
- Open Registers and Register Counts: provisional open shifts and each recorded
  opening/closing bill/coin denomination.
- Rentals and Memberships: receipt-based recipients and member numbers; rentals
  also show Assigned Room/Number, unit identifier and renewal references.

Currency cells are numeric with money formatting; quantities remain integers.
Headers, alternating row fills, column sizing, frozen rows, filtering and print
layout are applied. User-provided strings stay literal Excel strings rather than
formulas, and all email values are HTML-escaped. No birth dates, government IDs,
waiver details, pending member drafts, passwords or profile permission data are
included. Recipient names/numbers come only from saved sale snapshots.

## Accounting and time boundaries

Sales use `createdAt >= local midnight` and `< next local midnight`. Register
closes use the same range on `closedAt`. Event schedule time fixes the report date
across retries, including 23/25-hour daylight-saving days and year/month rollover.
All workbook timestamps explicitly show Central time and its UTC offset.

Daily sales and full-register shift totals are separate. A shift can cross
midnight, so its cumulative reconciliation must not be added to daily sales.
Cash excludes card/gift-card/check/other tender; change and outgoing payments are
accounted for, quantities are multiplied correctly, and payouts remain signed.
Register-only and no-activity days still produce a report.

Current category names label saved category IDs. Older receipt lines can fall
back to the current product category; missing/deleted categories remain explicitly
unavailable/uncategorized. Product names and prices use saved receipt lines rather
than current product values. Legacy Original Total and payout-slip count fields
are not collected by CERMS 5 and are explicitly marked as not recorded. Missing
historical closer values are not invented. A missing POS ledger uses only the
existing opening-cash baseline and is labeled accordingly.

Queries paginate at 500 records per page. Capacity/attachment-size errors stop the
report instead of silently emailing a truncated file. Preparation errors and
inconsistent stored receipt/count values fail before email submission.

## Delivery state and credentials

The only report-owned Firestore mutation is the delivery audit at
`system/dev/dailyReports/{YYYY-MM-DD}` (and `test-{YYYY-MM-DD}` for deliberate forced
previews). It records state, invocation claim/lease,
recipient, period, counts, attachment hash and a fixed Message-ID; it contains no
workbook, customer detail or credentials. Undefined-path rules keep direct desktop
access denied; no rules deployment is needed.

Concurrent runs and completed-day retries are suppressed. Preparation failures
can retry safely. Once SMTP submission starts, a lost/uncertain response is marked
`uncertain` (or left `sending` if the process dies) and never automatically
resubmitted. This avoids a duplicate email after possible acceptance; it is not a
guarantee of exactly-once SMTP delivery. Check logs and the audit before manually
resending an unresolved day. Never delete/reset an audit as a test.

The new `cerms5-reports` service account has one project Firestore grant with an
IAM condition restricted to database `cerms`, plus accessor rights only on the new
`CERMS5_REPORT_SMTP` secret. Its code fixes business `dev`. Firestore IAM cannot
scope its role to one subcollection, so the Dev-only restriction also lives in
code/tests. It has no legacy database, Auth or Storage role. Existing SMTP
credentials were read securely and copied to the new secret without rotating or
changing the legacy credential, extension configuration or access policy. The
function uses TLS with certificate verification. No credentials belong in source,
logs, desktop artifacts or evidence. Credential rotation requires updating the
report secret deliberately; a legacy password rotation will not automatically
refresh the isolated copy.

Cloud Scheduler forced runs can carry the next scheduled timestamp. A future
schedule timestamp identifies a test preview: it gets a separate audit key and
Message-ID, a `[TEST]` subject, and an incomplete-current-day notice. It cannot
suppress the following morning's normal report. The first user-requested test was
sent before this handling was added, covering November 14 activity. Its confirmed
audit is preserved as `priorTestDelivery` when the November 15 scheduled run sends
the complete November 14 report. No audit is deleted and no second test is sent.

## Deploy and verify

```sh
npm ci --prefix report-functions
npm run test:reports
node scripts/daily-report-deployment.mjs before
node scripts/daily-report-deployment.mjs setup
firebase deploy --config firebase.reports.json --project cerms-7af24 --only functions:cerms-reports:sendDevDailyReport --non-interactive
node scripts/daily-report-deployment.mjs after
```

Setup is additive and verifies SMTP authentication without sending mail. It never
changes legacy permissions or passwords. Deploy only the target function and
separate reports codebase. Do not run an unscoped Firebase deploy. Before/after
verification hashes sensitive function metadata instead of printing/storing SMTP
values. It compares every old function/schedule, all rules releases, both database
settings/indexes, existing buckets/IAM and the old SMTP secret access policy. The
only allowed project IAM addition is the new identity's named-cerms grant. The
new function endpoint must be private and its schedule enabled.

`docs/DAILY-REPORT-DEPLOYMENT.json` records deployment evidence. Synthetic tests
cover Central/DST boundaries, monetary/quantity aggregation, category aliases,
receipt scope/reconciliation, typed workbook content and literal strings, MIME
attachments, paging, duplicate/concurrent suppression, preparation retry and
uncertain-SMTP behavior. Preview artifacts use synthetic data only:
`artifacts/dev-daily-report-preview.html`, `artifacts/dev-daily-report-preview.xlsx`
and `artifacts/dev-daily-report-email.png`.

## November 17, 2026 setup completion

The deployed CERMS 5 report now includes waived product units/value and subtracts saved cash drops from expected shift cash. The Registers, Open Registers and per-cashier workbook sheets include Cash dropped (shift). Historical ledgers with no cash-drop field use zero. The fixed Dev scope, recipients, schedule, SMTP configuration and uncertain-delivery suppression are unchanged; no test email was sent. See `UPDATES-DEPLOYMENT.json`.
