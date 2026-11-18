# POS discount codes

Open **POS → Discount codes** to create, edit, activate/inactivate or archive promotions. The owner can grant **Manage discount codes** in Users & permissions. It defaults off for other staff and is separate from selling, refunds and product editing. Code managers receive scoped catalog read access to choose eligibility; that permission does not allow changing/deleting products or selling. Cashiers with the existing POS permission can apply a known code.

## Promotion settings

- Percentage off, with two decimal places from 0.01% through 100%, or a fixed dollar amount off.
- All products, selected products or selected categories. Product/category selections are a union; optional retail/membership/rental type selections further restrict them. Empty selections mean all within that dimension. Only active, cashier-permitted products may be purchased.
- Start/end date and time (entered in the workstation’s local time and stored as epoch milliseconds). Start is inclusive; end is exclusive.
- Minimum eligible spend before tax, and an optional maximum savings cap.
- Optional total uses and uses per member. Both count completed orders, not units. Per-member limits require the existing primary member linked to the order; they do not count every recipient in a group order. Pending new members are not eligible as the linked member for that limit.
- Name, internal notes and an active switch. Codes are case-insensitive, normalized to uppercase and limited to 32 letters/digits/underscores/hyphens. Archived code IDs remain reserved and may be restored by editing. Used counts/history are retained on every edit, archive and restoration; use a new code for a new count budget.

One code applies per order. Payout orders cannot use codes. Waived lines never receive a further discount; other eligible lines can still qualify. Fixed savings never exceed eligible spend. A code that produces no savings is rejected rather than consuming a use. Saving a total-use limit below the existing count is rejected; deactivate/archive instead.

## Checkout and financial records

Enter the code in the cart and choose **Apply code**. A read-only server quote checks the rule, prices, products, eligibility, dates and use limits. Cart/member changes revalidate the code and disable payment until the quote is current. A failed/expired/ineligible code remains visible and must be corrected or removed; it is never silently omitted from payment.

Savings are allocated to eligible lines in proportion to their original pre-tax amounts. Integer arithmetic with deterministic largest-remainder allocation preserves every cent. Tax is rounded per line after discount. Original unit prices remain on the receipt, together with line gross subtotals, allocated savings and the applied code/name/type/value/version snapshot. Sales without codes keep their existing financial behavior.

`completeSale` rechecks the current code/version, amount, dates, global/per-member use budgets and catalog inside the same transaction as payment, register totals, inventory and fulfillment. Failed/cancelled orders consume nothing. Identical sale retries consume only one use, even after a code is archived or the original register closes. Concurrent checkouts cannot exceed a use cap. Rule changes while a cashier is paying reject an unsaved stale request and require reapplying/reviewing the discount.

Refunds use original discounted amounts and tax; they never recalculate using a current promotion or refund undiscounted list prices. Partial returns also reverse only their corresponding discount portion. Code use counts are not restored on refunds. Registers, printed closeouts, sales summaries/CSV and the Dev daily email/workbook show discount savings net of returns. Payment/tax totals already include savings, so reporting never subtracts them twice. Daily Orders/Order Items sheets and receipt CSV retain code/savings details; older receipts with no discount fields show zero/no code.

## Storage and permissions

All records use the existing named **cerms** Standard database in project **cerms-7af24**:

- `system/{business}/discountCodes/{CODE}`: validated rule, configuration version, aggregate uses, archive state and verified actor/server timestamps.
- `system/{business}/discountCodes/{CODE}/memberUses/{memberId}`: server-only per-member redemption count.

The dedicated `discountCodes` callable verifies saved business and the applicable permission inside transactions. Managers list codes in pages of 100; cashiers can only quote a supplied code. Only the server writes code/rule/use records; direct desktop reads/writes stay denied. Product/category references are checked in the selected business at save time. Missing/deleted products can be removed from a rule by editing; past receipts remain immutable.

No existing user grants are enabled automatically, no past receipts/counters are backfilled, no accounts are changed and no payment processor is introduced. Existing system selection, owner protection, fulfillment gates, named-database request guard and default denial remain intact.

## Verification and deployment

Focused checks cover percentage/fixed/capped pricing, eligibility, dates, minimums, exact-cent allocation, permission separation, management version conflicts, limits, discounted tax/receipt values, zero-payment orders, refund reconciliation and idempotent retries. The isolated demo emulator checks competing checkouts against a single-use promotion. The isolated/intercepted Electron flow creates a restricted percentage code with a limit, applies it case-insensitively, completes a discounted order and recovers a lost response without double use. Report checks verify code/savings fields and daily totals. Tests never create production codes/orders, alter stock/member/account records, process payments, print or send real emails.

The required synthetic rules suite passed 397 checks using exact prepared rules at `firebase/releases/discounts-2026-11-17.rules`. Scoped configuration is `firebase.discounts.json`: `discountCodes`, `completeSale`, `refundSale`, the compatible `createStaffAccount` permission extension, `sendSaleReceipt`, `sendDevDailyReport`, and named-cerms rules only. The receipt formatter is regenerated from shared sources; the daily schedule/recipients/Dev scope remain unchanged. Deployed November 17, 2026; all six targeted functions are ACTIVE and the exact named rules were verified. Evidence is saved in [DISCOUNTS-DEPLOYMENT.json](DISCOUNTS-DEPLOYMENT.json). All unrelated functions, legacy/default/Storage rules, both databases’ settings/indexes, bucket/IAM/secret policies and schedules were verified unchanged.

No release packaging, publishing or version increment accompanies this feature. Desktop controls ship in the next explicitly requested release.
