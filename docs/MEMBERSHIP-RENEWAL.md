# Membership purchases and renewals

Adding a membership product in POS opens **Add membership to order**. The operator
can create a new membership through the existing owner-only Dev flow, or select an
existing member and assign the purchased time. Existing-member assignments require
saved-business `processSales`; they do not require general member-edit permission.
New-member creation rights are unchanged.

For an existing member, choose:

- **Add to existing expiration** (default): add the configured product duration to
  `max(existing expiration, server checkout time)`, retaining remaining time.
- **Start from today**: replace remaining time with the configured product duration
  starting at server checkout time.

Durations use the existing catalog hour/day/week/month/year conversion unchanged.
No arbitrary expiration/date input is accepted. If an older member has no usable
expiration, choose Start from today; extension rejects an unknown baseline.

Each membership unit has a stable assignment UUID, product, existing recipient and
mode. Explicit recipients do not change when the order's linked member changes.
Repeated units for the same recipient must use the same product and mode; their
combined duration is applied once. Different recipients can use different products
and modes in one order. Up to 100 existing-member units, 20 new memberships and 50
involved members are supported within the existing 100-product order limit.

Assignments appear in the cart and persist with its local draft. Removing a unit
adjusts quantity; removing a product also removes its pending new-member forms and
existing-member units. No member is changed when selecting products, canceling
payment, leaving POS or clearing a cart.

The optional `membershipAssignments` request field is validated by the desktop
guard and `completeSale`. The server rechecks member existence/business/DNA,
catalog availability/permissions/version/price and configured duration inside the
sale transaction. Every membership line quantity must be fully assigned to pending
new members or existing-member units. Pending recipients cannot also be submitted
as existing-member renewals.

Successful existing-member renewal updates only `membership_type` and
`id_expiration`. Existing identity, number, creation metadata, original `productId`,
notes, waiver and unrelated fields are preserved. A rental check-in in the same
order may additionally set `checkedIn` through its existing authorized path.
Renewal is applied to the in-transaction member state before rental eligibility
checks, so a previously expired member can renew and check in atomically. An
already-active visit is still protected against duplicate admission.

Member expiration, receipt, inventory, register totals and any rental fulfillment
commit together. Unsuccessful or canceled checkout adds no time. Identical-request
retries return the existing immutable receipt, without adding time again, even
after the register closes. Old requests without membership assignments retain
their existing validation, fingerprint and retry behavior.

Receipt membership snapshots identify the renewal recipient, mode, prior expiration
when known and resulting expiration. Repeated units show their shared combined
result. No pending drafts or private identity fields are copied onto receipts.
The existing daily report already includes these purchases in sales, product,
payment and membership-recipient rows; its function is not changed by this release.

No direct desktop member writes, wider new-member creation, general profile
mutations, legacy data changes, rules or indexes are introduced. Deployment targets
only `functions:cerms-staff:completeSale` via `firebase.checkout.json`, following
`npm run build:checkout-domain`. Compatibility evidence is recorded in
`docs/MEMBERSHIP-RENEWAL-DEPLOYMENT.json`.

Focused verification: 21 checkout/server checks, 11 POS/renewal client checks,
TypeScript check and one intercepted POS renewal flow. The flow covers canceled
payment, saved draft restoration, recipient selection, extension, lost-response
retry, restart and receipt output. One desktop build supplied that focused UI
check; no broad client/rules suites or live member/sale writes were used.

The renewal dialog now reads the selected member's current expiration and displays
their status and remaining time. Expired memberships (including expiration at the
current instant) automatically start from checkout time. Active memberships offer
Start from today and Add to existing expiration, with the calculation and resulting
expiration shown for both. Previews include matching membership units already in
the cart; changing the choice applies it consistently to those units. Dates are
estimates, with the final expiration calculated atomically at successful checkout.
The redesigned dialog groups the plan, recipient and time options into responsive
cards. Missing expiration uses Start from now automatically.

This follow-up is desktop-only; deployed checkout already applies the required
expiration calculation. Four focused preview/domain tests, TypeScript checking,
one desktop build and the intercepted renewal checkout flow passed, including
active choices, expired automatic restart and canceled checkout without mutation.

Clicking Create order for an expired member now opens this membership picker
automatically after the POS catalog loads. The recipient is preselected and fixed
to that member, with available permitted plans, prices and expiration calculations.
Adding a plan places its renewal in the order; canceling adds nothing and leaves
the member-linked order open. Dismissing the prompt is saved with the local draft
so merely returning to POS does not reopen it. Active members retain the normal
Create order behavior; Check in eligibility is unchanged. The intercepted renewal
flow verifies both entry paths, recipient selection, cancellation and assignment.
No backend deployment or live data changes are required.
