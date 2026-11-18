---
id: member-new
keywords: create new customer member membership registration guest form scan dev owner checkout
---

# Creating a new customer membership

## Before you start

New-member creation is currently restricted to the designated owner in Dev System. It creates a customer membership, not a staff login. Use an active permitted membership product with a configured duration. Completing the sale requires your own open register and POS access.

## Steps

1. In Members select Create membership, or in POS choose Add membership → Create new membership.
2. Choose the membership product. Enter first, middle and last names, DOB, contact details and ID state/type/number. You may scan a supported ID, but review the populated fields. Complete all required fields; members must be at least 18.
3. Continue to checkout/Add membership to order. CERMS first searches the selected business for possible existing members using names, DOB and ID details.
4. If Member may already exist appears, compare the records. Use the correct existing member, return to edit, or explicitly confirm a different person before continuing as new.
5. Review the linked order, add other products/recipients if needed, record external payment and complete the sale.

## Result and recovery

The new member and purchased membership are saved only after successful checkout. Canceling the form/payment creates no member. The membership starts at successful checkout, not when the form opened. If checkout is uncertain, retry the same order; do not enter the member again. Waiver signing is not included in this creation flow. Member-file uploads are available separately after the saved member exists.
