# Rewrite roadmap

The current deliverable stops at **Phase 0: skeleton**. Later phases below are a planning map, not work included in this request.

| Phase                             | Scope                                                                                                                                    | Completion evidence                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0 — Skeleton                      | Electron/React/TypeScript structure; secure desktop boundary; reusable shell/theme; sample views; module placeholders; legacy system map | Builds, launches, and navigates without Firebase credentials or live writes                   |
| 1 — Verify compatibility          | Inventory default database/rules/indexes; sanitized fixtures; staff roles; Auth; scoped read-only member directory                       | Existing accounts work; cross-club reads fail; pagination and logout cleanup tested           |
| 2 — Memberships                   | Read/write member detail, notes/tags/DNA, renewals, existing IDs, import rules, files/waivers                                            | Old/new clients agree on stored records; allocation concurrency and field preservation tested |
| 3 — Admissions                    | Visits, waitlist, in/out, locker/room allocation, expiration/renewal, checkout                                                           | Duplicate check-in/assignment prevented; existing rental tuples/time semantics preserved      |
| 4 — Sales and registers           | Catalog, discounts, exact calculations, tender, returns, cash drops, drawer lifecycle                                                    | Transaction/retry/concurrency tests and reconciliation against legacy receipts/reports        |
| 5 — Reporting and devices         | History, Excel, scheduled report parity, receipts/printers, signature hardware, QuickBooks                                               | Matching financial output; device validation on actual deployment OS/hardware                 |
| 6 — Remaining modules and rollout | Administration, messaging, possible events, support, signed installers/updates                                                           | Role coverage, pilot club, recovery/rollback plan, measured startup/memory/read costs         |

The existing client can remain in use while the new UI is developed. Before simultaneous writers are enabled, examine legacy counter and checkout race conditions: transactions in the new app alone cannot make old nontransactional writers safe. Plan a coordinated write cutover where necessary.

Potential new features can be prioritized after parity requirements are agreed: faster indexed search, persistent draft handling, improved reconciliation, clearer audit history, and actual event scheduling. None should silently alter existing field meanings or introduce database collections during the skeleton phase.


## Overview dashboard direction

Overview retains the shared Admissions & rentals view. Rental-alert cards highlight expired rentals and those ending within five minutes; current-activity counts stay in the existing filters. Quick actions, register status, today's summary, and staff announcements are deferred until their workflows/data sources are implemented. Do not introduce sample dashboard figures or duplicate the admissions implementation.
