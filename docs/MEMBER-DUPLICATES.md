# Duplicate checks during member creation

The desktop checks existing members before adding a new membership to checkout, for both manual entry and scanned IDs. It reads only members in the signed-in user's saved business in the named `cerms` database. Current creation remains restricted to the designated owner in Dev System. No legacy/default database access, profile mutations, new permissions, backend deployment or release is needed.

Possible matches include:

- Matching ID state/type and number, even if the name or DOB differs. State labels and abbreviations, capitalization, spaces and punctuation are normalized.
- Matching first/last names with compatible middle names (missing values or matching initials are allowed), even if other details differ.
- Matching DOB with a matching first or last name, or small spelling differences in both. A DOB alone does not trigger a warning. DOB accepts existing padded/unpadded ISO and US slash formats.
- Matching ID number with differing/missing state when the name or DOB also supports the match.

The **Member may already exist** popup shows the entered details and each possible member's full name, number, DOB, ID state/number, membership, expiration and flags, with the matching reasons. **Use existing member** opens the normal existing-member membership dialog with the selected product and recipient. Staff retain the choice to extend or restart active membership time. From POS, the existing cart and primary recipient are preserved. From Members, the usual unsaved-order replacement confirmation still applies.

**Back to form** or Escape retains all entered details. Continuing as new requires explicitly checking that the matches belong to a different person. Unmatched members follow the existing pending-member checkout flow. No member is created or changed by the lookup or selection; successful checkout still owns fulfillment and the existing atomic identity reservations.

The lookup pages by document ID, 250 records at a time, using existing business-filtered read access. This includes older records without normalized search fields or creation timestamps, with no new indexes/backfills. It scans the business on each submission; large member lists incur proportional read time/cost. Results are held only in memory, never persisted as a customer cache. Failed reads or changed sessions/access prevent continuing until a successful retry. This is an advisory similarity check, not a fuzzy identity reservation or guarantee against another checkout creating a similar member later.

Focused validation: `npm run test:member-duplicates` covers matching, false positives, legacy formats, paging, access/session failures and cancellation. `node scripts/member-duplicates-smoke.mjs` uses the built app in a disposable Electron profile with every Firebase request intercepted: popup details, back to form, Members/POS handoffs, original cart preservation, confirmed different-person continuation and unmatched creation. No live test members, orders, accounts, emails or print jobs are used.
