# Reports & analytics

The desktop Reports & analytics page is a read-only view of the signed-in staff member's saved business in named Firestore database `cerms`. It uses existing business-scoped read permissions. It does not grant staff new permissions, change profiles, touch `(default)`, call a reporting backend, or change the existing Dev-only daily-email service/schedule.

## Available reports

- **Overview:** completed transactions, net sales before tax, net collections after payouts, average net transaction, equal-calendar-period comparisons, daily sales, gross/payout/tax reconciliation, cash handed over/change, and purchased new memberships, membership renewals, rental starts and rental renewals.
- **Sales & payments:** applied incoming/outgoing/net payment methods, product performance from immutable receipt snapshots, cashier performance, searchable paginated receipt detail and the existing receipt view/print dialog. No original UUIDs are replaced by display references.
- **Memberships:** the current member base (active, expired, DNA, unknown expiration), upcoming 7-day expirations, a 30-day expiring-member follow-up list, current records created in the selected dates, and completed-order membership purchase counts. DNA is mutually exclusive with active/expired/unknown counts. Expired counts do not imply check-in is forbidden.
- **Rental activity:** rental activity starts per day/hour/type, distinct member IDs with a start, and current active/inside/waiting/overdue rentals. Only rental-enabled activity is included. Multiple rental units per member are counted separately; extensions do not create extra starts. Activity without an arrival date is explicitly excluded from date totals and counted in a notice. These are recorded arrivals, not capacity utilization or historical occupancy.
- **Register closeouts:** registers closed in the chosen period, opening/expected/counted cash, over/short, owner and closer, and lifetime shift transaction counts. The report intentionally uses a shift's complete totals, even if it opened before the selected start. Registers without a saved POS ledger use the saved opening cash as expected cash; open registers are excluded.

## Date and financial semantics

Presets cover Today, Last 7 days, Last 30 days and This month. Custom ranges support 1–366 inclusive calendar dates in the computer's named local time zone, displayed beside the controls and included in CSVs. The end timestamp is exclusive midnight after the end date. The comparison is the immediately preceding equal number of calendar days, preserving local day boundaries through daylight-saving changes. These desktop reports may use a different time zone from the separately configured daily email.

Applied dates and refresh time remain visible. Editing the controls does not silently relabel old results or their exports. Financial reads include the selected and previous periods, but selected-period exports exclude prior receipts. Zero previous totals display “No previous-period baseline” instead of an infinite percentage. Average transaction is net collected including tax and payouts divided by all completed transactions. Money is calculated in integer cents; invalid saved financial records produce an explicit unavailable state rather than partial totals. Net card values record external payments and do not represent card processing.

Current membership/live-rental counts always use current refreshed records, regardless of selected dates. Deleted members are absent from the current member base. Saved receipt fulfillment metadata retains historical purchase counts; no historical member-status reconstruction is implied. Reads are refreshed paginated queries, not a single atomic database snapshot.

## Read boundary and completeness

`src/data/firebase-reports.ts` uses the existing named-database client and renderer request guard. Sales and closeouts use single-field timestamp range queries. Members and rental history use the existing saved-business `access == business` constraint and complete document-ID pagination, without adding composite indexes. All queries use pages of at most 50, respecting deployed sales/register list limits. Profile UID/business/auth are revalidated at each page, before ledger batches and after all sources. Changing business/account or unmounting cancels further pagination and prevents stale results from entering the page.

Each source has a 20,000-record limit. Exceeding it fails that whole source visibly; it never displays a truncated total. Financial ranges can be narrowed. Member and rental histories currently load the whole business dataset, so larger histories require a future aggregate/query service rather than a misleading date-based shortcut. There is no automatic background refresh, local report persistence, production test data or production write probe. Failed sources remain explicitly unavailable; independent reports still work and failed exports are disabled.

Member summaries exclude government IDs, notes, contact details and access profiles. CSVs omit private notes and payment references. The expiring-member list retains name, membership number/plan and expiration for follow-up. Saved receipts retain their existing authorized receipt fields for the deliberate receipt drill-down; no general member profiles are attached.

## CSV exports

The Export CSV selector offers sales summary, daily sales, products, cashiers, payment methods, receipt detail, upcoming membership expirations, daily rental starts and register closeouts. Exports include every loaded row in the complete source, not just the displayed table page, plus business/scope/time-zone/refresh metadata. Currency columns are labeled USD and exported in dollars. Receipt/register exports retain full UUIDs and display references. Expiration exports explicitly identify their current snapshot scope.

Exports are UTF-8 with a BOM and CRLF, quoted/escaped for Excel, with spreadsheet formula prefixes neutralized for string cells. Negative numeric money remains numeric. Export is a deliberate browser Blob download using the desktop's existing download behavior; no new IPC or arbitrary filesystem API is exposed. Print/reprint remains the existing deliberate receipt action; reports never print automatically.

## Verification

`npm run test:analytics` runs the desktop build, focused report domain/reader tests and the synthetic Electron flow. Tests cover period boundaries, range validation, zero/negative baselines, split payments/change/payout/tax reconciliation, membership/rental semantics, source failures, pagination beyond 50, source size limits, abort/revocation, foreign data, safe complete CSVs and receipt drill-downs. The intercepted Electron flow blocks report writes, exercises all five views, current snapshots, failed-source recovery/empty periods, downloads a synthetic CSV and captures light/dark layouts. No production business data, accounts, emails, cloud settings or real printer output are changed for verification.

Verified November 16, 2026: 226 client checks (including 15 focused report checks), TypeScript, desktop build, formatting and the intercepted Electron Reports flow passed. Actual synthetic CSV download/content, receipt pagination/drill-down, all five views, source-failure handling, empty ranges, and light/dark layouts were verified. The 1100-pixel layout kept wide tables inside their own scroll container. Screenshots are under `artifacts/reports-*.png`. No Firebase deployment or production write was needed.
