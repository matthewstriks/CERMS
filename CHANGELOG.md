# CERMS changelog

Edit the Unreleased section before publishing. Use release headings (`##`) for
versions and `###` headings for groups of changes. The release command records
these notes under the new version automatically.

## Unreleased

### Added

- Bug reporting from the desktop with a separate popup, priority and
  description fields, CERMS 5 screenshots, file attachments, renderer
  diagnostics, secure support links, and email follow-up through Firebase.
- Cash drops for staff with POS access, including idempotent server processing,
  register-ledger history, and cash-drop deductions in closeout reconciliation.
- Permission-controlled product waivers that set selected order lines to $0 and
  identify waived units and value in Dev daily reports.

## 5.0.0-alpha.5

### Added

- Incoming-message and app-notification sounds, with account-saved enabled/volume
  controls and a Test sound option in Settings. Sounds default to 100% volume.

- Reports & analytics with date comparisons, sales/payment/product/cashier reports,
  membership expiration follow-up, rental demand, register reconciliation, receipt
  drill-downs, and Excel-compatible CSV exports.

- A live unread-message count badge on the Messages navigation tab.
- An in-place register-opening prompt when starting a member or POS order without
  an active register, preserving the order draft.

### Changed

- Direct View, Edit, and Check out buttons on rental rows, plus Renew for expired
  rentals, on Overview and Admissions & rentals.

- Expired members can check in after an optional renewal prompt; cashiers can
  continue without renewing.

## 5.0.0-alpha.4

### Added

- Private staff messaging with direct and group conversations, staff search,
  searchable history, timestamps, unread indicators, and read receipts.
- Member notes labeled with the staff member's name and time, admin-controlled
  removal, and required note review for members marked Read notes.
- Required reasons when marking a member Do not admit, saved as highlighted notes.
- Rental checkout from Overview and Admissions & rentals, with confirmation that
  the rental is complete and all required items have been returned.
- A What's new option on available updates so staff can review release notes.
