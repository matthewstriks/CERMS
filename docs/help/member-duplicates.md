---
id: member-duplicates
keywords: duplicate similar already exists match same person first middle last name dob identification ID state number creation
---

# Reviewing a possible duplicate member

## When it appears

Before a new member goes into an order, CERMS checks existing members in the selected business. Matching ID state/number, matching names with compatible middle names/initials, or matching DOB with supporting name similarities can trigger Member may already exist. Formatting differences and older records without search metadata are included. A DOB by itself does not prove a duplicate.

## Steps

1. Compare the entered details with each possible member's full name, membership number, DOB, ID state/type/number, plan, expiration and flags. The popup lists the matching reasons.
2. For the same person, choose Use existing member beside the correct result. The selected membership product is retained and the normal existing-member membership dialog opens. Review whether to extend or restart time before adding it to the order.
3. If the entry is wrong, choose Back to form or Escape. Your form details remain available for correction.
4. Only for a different person, check I checked the matches. This is a different person, then Continue as new member.

## Result and limits

Selecting a match does not change the member or complete payment. In POS it preserves the existing cart and primary recipient. Starting from Members retains the usual confirmation before replacing an unsaved order. Failed lookup must be retried before continuing. The similarity warning is advisory; original server identity checks still apply at checkout. Do not bypass a clear same-person match by changing ID punctuation.
