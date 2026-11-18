---
id: order-recovery
keywords: retry same order uncertain connection lost pending sale failed timeout locked offline duplicate payment recover draft
---

# Recovering an uncertain order without duplicating payment

## Recognize the state

A request can succeed on the server while its response is lost. A connection error alone does not establish whether the sale failed. CERMS preserves an unconfirmed order's original request and locks it for retry.

## Steps

1. Keep the pending order and its details. Do not clear it, replace it, change accounts/businesses or run a second checkout to test the result.
2. Check internet and retry using the original order's offered Retry action. Reopening CERMS/POS can restore the saved pending request on the same workstation/account/business.
3. If already saved, the retry retrieves the same receipt without repeating payment records, inventory changes, discount use, membership time or rental fulfillment.
4. If the app confirms rejection and permits editing, correct the stated issue, review the cart and resubmit through the offered flow.
5. If the result remains unknown, contact support with the version, time, business, receipt/order reference if shown and exact error. Keep sensitive customer/payment data out of a public ticket description.

## Separate failures

Do not confuse a saved sale followed by a print/email error with an unpaid order. Retry only receipt delivery in that case. Closing a register can prevent a new sale, but a previously saved identical request can still return its receipt. Local drafts are recovery aids, not proof that a transaction completed or an offline checkout service.
