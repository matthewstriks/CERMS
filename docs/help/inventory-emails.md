---
id: inventory-emails
keywords: low inventory stock warning threshold email recipients multiple alert replenish notification par
---

# Low inventory email alerts

## Before you start

Only the owner configures recipients in Settings → Low inventory emails for the selected business. Catalog managers configure individual product inventory/warnings in Products.

## Steps

1. In Products set tracked Inventory and Inventory warning for each relevant active product. Alerts trigger when inventory is at or below its warning, including zero. Blank/untracked inventory or a blank warning does not alert. Inventory par is not the warning trigger.
2. In Settings enable inventory alerts and enter up to 20 email recipients separated by commas or new lines. Duplicate addresses are removed.
3. Select Save inventory alerts and wait for confirmation. Enabling checks products that are already low; each recipient receives a separate email.
4. After replenishment, save stock above the warning level. A later drop to/below the warning can start the next alert episode.

## Repeated alerts and delivery

More sales while a product remains low do not send an email every time. Disabling stops new alerts; re-enabling starts a fresh check. Editing recipients affects future alerts rather than resending completed episodes. Emails are server notifications, so CERMS need not remain open.

## If missing

Check selected business, saved enabled state, recipient spelling/spam, product active status, tracked stock and warning threshold. A new recipient alone does not replay an old episode. Do not lower stock artificially to test a production alert; report the actual configuration/error to the owner.
