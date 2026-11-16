# Point of sale

Current checkout flow: [linked membership and rental checkout](MEMBER-CHECKOUT.md) supersedes the earlier separate member-creation/payment flow. Members and rental visits are now fulfilled atomically with their linked order; direct desktop member creation is blocked.

CERMS records payments received on external terminals or by other methods; it does not charge cards, redeem gift-card balances, or collect card numbers. The user explicitly confirmed this model. Tax is configurable per business, and the supplied printer is a Rongta RP326 (80 mm).

Group orders can include multiple pending memberships and individually assigned rentals; the order link can switch between existing and pending members. See [Multiple memberships and rental recipients](MULTI-MEMBER-ORDERS.md).

POS tiles now use saved product images, collapsible category groups and a persistent top Favorites section; see [POS catalog](POS-CATALOG.md). Upload images and mark favorites in the existing Products editor.

## Checkout

The POS catalog lists active products allowed for the cashier, with category dropdown, name/barcode search, Enter-terminated barcode scans, quantities, custom prices for ask-for-price products, and stock availability. Prices, taxability, restrictions, inventory and catalog versions are verified again on the server. Inventory is decremented atomically for tracked, non-payout products. Payout products produce negative line values; a net payout records outgoing tender and cannot overdraw recorded cash.

Cash, card, externally redeemed gift card, check and other methods may be split across up to 12 payment portions (one cash portion). The Take payment window contains method and amount rows, Add payment method, the remaining balance and cash change. Double-clicking an amount fills the remaining due after the other rows. A cash amount means cash received; the client subtracts non-cash payments, applies only the remaining amount from cash and records any excess as change. Non-cash overpayments and excess payouts are blocked. Complete sale records that the entered external payments were received; there is no separate confirmation checkbox or reference field. Saved receipts still retain any references from earlier orders. All money is integer cents, with tax rounded per product line; configurable tax is 0–100% in hundredths of a percent. A missing tax setup blocks taxable sales instead of silently using zero. Owner settings can reuse an existing business `taxRate` fraction as the initial displayed rate; saving writes only the new POS settings subdocument.

Each cashier must have their own open register. The owner has POS access automatically; other staff need the new `processSales` permission in Users & permissions. Staff who may set an eligible product to $0 also need the separate `waiveProducts` permission; the server rechecks this permission and records the waived line on the immutable receipt. Old permission maps remain valid, preserve register defaults, and do not gain POS or waive rights. Creating new staff with these flags is supported by the updated CERMS 5 staff service; existing Auth logins are untouched. All business staff can read saved receipts and register totals, consistent with existing business order/register visibility.

Cart drafts and uncertain save requests are retained locally per user/business. A UUID identifies each sale. The server stores the request fingerprint with its immutable receipt. A repeated identical request returns that receipt, including after its register is closed, rather than adding payments or reducing inventory twice. A failed/unknown network response retains the same request for retry. A confirmed validation/precondition rejection permits correction. POS requires connectivity to complete a sale.

Membership and rental product purchases are financial records only: this checkout does not create/renew memberships, admit members, assign rooms/lockers, or alter visits. Those workflows require their own fulfillment integration. There is no direct card processing, gift-card balance service, sale void/refund workflow or email receipt. Cash drops and product waivers are recorded in the register/sale ledgers; the Dev daily report includes waived units and waived value. Payout products cannot be waived and are not refunds linked to a prior receipt.

## Data and reconciliation

All Firestore access is fixed to named `cerms` in project `cerms-7af24`:

- `system/{business}/sales/{requestId}`: immutable product/price/tax/payment receipt snapshots, actor, register, customer label, receipt settings and server timestamp.
- `system/{business}/registerTotals/{registerId}`: transaction count, net method totals, tax, cash received, change given, cash paid out and expected drawer cash.
- `system/{business}/posSettings/default`: owner-configured tax and receipt header/address/footer.

`completeSale` uses one server transaction for the receipt, register totals and inventory updates. It reads the register, current register-owner claim, saved staff profile/permissions, settings and products inside that transaction. Register closure conflicts with an in-flight checkout; a retry observes the closed register and rejects a new sale. Totals cannot change once the register closes. Existing denomination records remain intact. Expected cash is opening cash + net cash tender; over/short is counted closing cash − expected cash. Card and other tender totals remain separate. Historical counts from before POS do not invent past movements.

New collections allow only scoped reads from the desktop. Direct creates, updates and deletes are denied even to the owner; only authenticated, validated callable code writes them. No client credentials, default-database access, payment processor, legacy collection writes, shared Storage changes or production test transactions are involved.

Sales & payments (also available through History) pages receipts newest first in batches of 50, with search, date/method filters, net card totals for the displayed loaded records, and receipt reprints. Filters explicitly apply to loaded records; load older receipts to extend coverage. Register IDs and external payment references are searchable. No new Firestore composite index is required by these queries.

## Receipt printer

Receipt preview shows the immutable saved sale. Print uses a sandboxed, script-disabled Electron window containing escaped plain text, with no remote resources. It lists OS-installed printers and uses the system print dialog plus the chosen printer's default paper size. Default layout is 80 mm paper / 72 mm printable width, with a 58 mm option. Printer choice and width are saved on this workstation. Paper/cutter settings belong to the driver. Printing failure never retries payment recording.

Manufacturer references: [RP326 specifications](https://www.rongtatech.com/rp326-80mm-thermal-printer-for-receipt-printing_p68.html), [Mac/Windows drivers](https://www.rongtatech.com/download/). Electron API: [webContents printing](https://www.electronjs.org/docs/latest/api/web-contents/).

Physical output/cutter behavior requires the connected printer and correct driver; automated verification stubs print submission and does not send a physical print job.

## Verification and release

Focused server checks cover split-payment accounting, immutable receipt/idempotent retry after closure, stock and price changes, permissions, payout limits and configurable tax. The intercepted Electron flow exercises category/barcode lookup, a $21.60 sale split into $10 cash applied from $20 received (change $10) and $11.60 card, lost-response recovery without double accounting, receipt printing/reopening, settings and register closing. The required local Firestore suite adds scoped POS reads, denied direct writes, bounded history and permission checks. Build/typecheck and targeted cents/permission/request-guard checks are required before deployment. No production data is used in tests.

Deployment falls under the user's standing approval for changes that preserve legacy functionality. Only `completeSale`, `savePosSettings`, the CERMS 5 `createStaffAccount` permission extension, and named `cerms` rules are in scope. Preserve all legacy functions, `(default)` rules/indexes/configuration and existing image services. Deployment completed September 30, 2026 (October 1 UTC). All three targeted services are ACTIVE; exact rules, source hashes and unchanged legacy metadata checks are recorded in [POS-DEPLOYMENT.json](POS-DEPLOYMENT.json). The deployed rule source is `firebase/releases/pos-2026-09-30.rules`; future feature deployments must preserve this baseline.
