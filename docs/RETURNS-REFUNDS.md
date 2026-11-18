# Returns and refunds

In POS → Sales & payments (or History), open **Return / refund** on an original receipt. Select quantities, choose any stock/service options, enter the reason and confirm the outgoing payment amounts. A saved refund has its own printable receipt and a link to the original order. The original receipt is never edited.

The owner can grant **Process returns and refunds** independently in Users & permissions. It defaults off for all other staff. Selling permission alone does not allow refunds; refund-only staff may use History and their own open register. Server authorization reloads the saved business and refund permission inside every transaction.

## Payments and inventory

CERMS records external refunds. It never calls a card processor or changes gift-card balances. Staff must complete those operations on the external terminal/service. The form requires explicit confirmation of refund payments and recovery of applicable items. Amounts can be split across the original payment methods, capped by each method’s remaining paid amount. Cash must fit the issuing register’s recorded drawer balance.

Partial returns use saved receipt prices/tax, including waived lines, rather than today’s catalog prices. Cumulative per-line tax rounding makes all partial returns sum exactly to the original charged cents. Remaining quantities and payment amounts are protected by a server-owned `system/{business}/saleRefunds/{originalSaleId}` ledger with a revision. Payout orders and refunds themselves are not refundable. Zero-value returned units may be recorded, including optional restocking, without inventing a payment.

Retail stock is restored only when **Restock returned items** is deliberately selected and the current product still has tracked inventory. Deleted/untracked products may be refunded without restocking. Product versions increment atomically, allowing the existing low-stock system to rearm naturally when stock rises above its warning level. No Storage objects or legacy product data are touched.

## Optional service cancellation

Leaving cancellation unchecked issues the financial refund while preserving the membership/rental.

- **Undo membership purchase:** requires every remaining unit of that product to be returned. For new purchases, the member’s profile remains and membership expires immediately. For a renewal, the previous expiry and saved previous membership label are restored. The member’s current expiry and purchase marker must still match the receipt. New checkout snapshots now record those values. Older receipts without a trustworthy reversible snapshot/marker, or memberships renewed/changed later, must be refunded without automatic cancellation and reviewed separately. No historical backfill is performed.
- **Cancel related rentals:** requires every remaining unit of that product to be returned and physical rental items recovered. Only the purchase’s linked visits are ended. Later renewal orders block cancellation through an older receipt. Other active rentals keep the admission claim/member checked in; the final cancellation releases the claim and clears checked-in status. Ended visits and their history remain recorded.
- A membership cannot be undone while unrelated active rentals remain. Cancel all related rentals in the same return or check the member out first. Cancellation does not delete members, identity/number reservations, notes or original fulfillment/receipt history.

The option applies to all recipients linked to the returned product line, which matters for group purchases. Rental-renewal cancellation ends the related rental; it does not roll its clock back while leaving the visit active.

## Registers and reports

`refundSale` atomically saves a negative completed receipt in the existing `sales` collection, return-state quantities/method amounts, optional stock/service effects and the issuing register’s ledger. Refund count/amount/tax are separate from completed sale count; net method totals, net sales/tax, cash paid out and expected drawer cash include refunds. A later sale preserves the new refund counters.

Refunds belong to their recording date and issuing register. An older/closed original shift is never changed. A closed issuing register blocks a new refund; an identical saved retry may still retrieve its result after closing. The local pending request survives closing the dialog/app and can be resumed from History. Unknown responses keep the original UUID/details, preventing duplicate payments, restocking or cancellation on retry.

Register reconciliation, printed closeout reports, register report tables/CSV, sales summaries and product/payment totals include refunds. Daily Dev report email/text and workbook show refund counts/amount/tax, negative net money and a dedicated Refunds worksheet with original-order linkage and reason. Returned product units reduce net units rather than create new sales. Purchase/fulfillment counts do not count refund receipts as new memberships/rentals. Refund-only days, including returns for older orders, remain reportable. The existing daily schedule, recipients and Dev-only scope are preserved.

## Verification and deployment

Focused checks cover quantity/tender caps, permission isolation, original receipt preservation, partial tax, restocking, ledger continuity, closed-register protection, service cancellation and safe retries. The isolated demo emulator verifies concurrent identical requests and over-refund rejection. The intercepted Electron flow exercises a partial return, a lost response, closing/reopening the saved request, exact retry, refund receipt and ledger totals. Daily report tests verify the workbook/email and a refund-only day. No real refunds, payments, stock changes, member/visit changes, production test writes, print jobs or emails are used.

The required named-cerms rules suite passed 391 synthetic checks. Scoped deployment uses `firebase.refunds.json`: only `refundSale`, `completeSale`, the compatible `createStaffAccount` permission extension, `sendDevDailyReport`, and rules archived at `firebase/releases/refunds-2026-11-17.rules`. Direct desktop writes to receipts, return state and register totals remain denied. Deployed November 17, 2026; all four targeted functions are ACTIVE and the exact named rules were verified. Evidence is recorded in [REFUNDS-DEPLOYMENT.json](REFUNDS-DEPLOYMENT.json). All unrelated functions, legacy/default/Storage rules, both databases’ settings/indexes, bucket/IAM/secret policies and schedules were verified unchanged. No installer packaging, publication or version bump is part of this feature.
