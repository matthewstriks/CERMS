---
id: feature-limits
keywords: unsupported unavailable not implemented limitations integrations QuickBooks waiver signing gift card processing room inventory Linux
---

# Recognizing unavailable features and release differences

## Check before troubleshooting

1. Verify Settings → Version and the selected business.
2. Check Users & permissions for the needed action. Disabled access and an unimplemented feature are different problems.
3. Review What's new for your installed update. Source/documentation changes become available to installed clients only after the owner publishes and you install a release.

## Current boundaries

- New customer creation remains designated-owner-only in Dev System; existing-member sales/renewals/rentals use their assigned POS permission.
- CERMS records external card/gift-card payments/refunds; it does not process cards or maintain gift-card balances.
- New waiver signing, member-file deletion, category deletion, message editing/deletion/participant reassignment, and room-availability/unique-room reservation are not implemented.
- QuickBooks and general Settings integrations/club-preference configuration are not implemented. Desktop reports export CSV; the separate scheduled daily email is Dev-only.
- Events remains a placeholder/prototype; a navigation item or feature preview is not a working event scheduler. Completed-sale voiding and a multi-order suspended-order manager are not implemented; use authorized refunds and the current local draft/retry workflow.
- Public GitHub issues need owner credential activation. Email support is available separately.
- Mac auto-updates need a signed update-enabled installation; unsigned builds update manually. Local AI setup is offered for Windows/Mac, uses Ollama and needs a separate model download.

## What to do

Ask the owner/support for an unsupported workflow rather than following invented menus or editing records to imitate it. Do not change a shared login through staff-profile administration, delete a member to refund a sale, or mark a rental Outside to end a visit. AI instructions are advisory and cannot enable an unavailable feature.
