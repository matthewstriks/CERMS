# CERMS changelog

Edit the Unreleased section before publishing. Use release headings (`##`) for
versions and `###` headings for groups of changes. The release command records
these notes under the new version automatically.

## Unreleased

<!-- Add changes for the next version here. -->

## 5.0.0-alpha.11

### Added

- CERMS Assistant, a separate help window opened from the Help icon beside
  Report a bug or from the login page. Includes chat bubbles, an animated
  thinking indicator, readable help articles and guided Ollama setup with
  download progress, pause and retry. Answers run locally and can work offline
  after setup, with no paid AI subscription or per-question charges.
- Assistant quality-assurance reports containing the full conversation and
  original staff name, login email, user ID and business, with signed-out chats
  identified separately. Finish chat, New chat, window close, application quit
  and account/business changes finish the conversation; offline reports queue
  for retry. The visible notice explains quality monitoring without displaying
  a private recipient address.
- Settings controls to check, remove and re-download the local CERMS Assistant
  model. Removal requires confirmation and leaves Ollama and other models
  installed. Bug reports remain available independently of assistant setup.
- Possible duplicate-member checks before creating a membership, using first,
  middle and last names, DOB and ID state/number, including older records.
  Review matching member details, use the existing member while retaining the
  selected membership/order, return to edit, or confirm a different person.
- Member-profile file uploads with original image/PDF viewing and document
  downloads, uploader details and retry handling. Supports multiple files up to
  20 MB each, with Edit member records permission required for uploads. Existing
  attachments remain visible.
- Permission-controlled POS discount-code management. Percentage and dollar
  discounts support eligible products, categories and item types, date windows,
  minimum spend, savings caps and total/per-member usage limits. Receipts,
  refunds, register totals and daily reports retain paid discounts and savings.
- Permission-controlled partial/full returns and refunds linked to original
  receipts, with optional retail restocking and membership/rental cancellation.
  Refunds use original paid prices/tax, update the issuing register and reports,
  and include safe retries and over-refund protection.
- Personal account settings for display name, verified login-email changes,
  password changes and verification emails. Email/password changes require the
  current password and apply to the shared CERMS login.
- Permission-controlled staff profile editing and access removal in Users &
  permissions. Edit CERMS 5 names/profile emails or remove staff access while
  preserving shared logins and legacy CERMS. Owner access remains protected.
- Low inventory emails configured by the owner in Settings, with up to 20
  recipients receiving separate messages. Alerts use each product's Inventory
  warning threshold and check existing low stock when enabled. Remaining low
  does not repeat alerts; replenishing above the threshold rearms the next alert.

### Improved

- Expanded assistant documentation from 16 short summaries to 68 task-based
  guides covering current features, permissions, procedures, confirmations and
  recovery steps. Corrected outdated feature limits and improved matching and
  readability while keeping the initial chat/setup screen concise.
- Distinct error notification tone, with a separate Test error sound button and
  priority over ordinary chimes. Uses the existing mute and volume settings.
- Branded Windows setup with custom welcome artwork and a cleaner Mac installer
  with Retina artwork and a clear drag-to-Applications layout.

## 5.0.0-alpha.10

### Added

- Alpha publishing now prepares Windows and universal Mac downloads together,
  with a Firebase Mac update feed ready for Apple-signed releases. Unsigned Mac
  builds use manual updates until signing/notarization is configured.
- Bug reports and login support can create public CERMS GitHub issues, with an
  issue link in the support email. Private contact details, diagnostics and
  attachment links remain in the email. Activation requires the scoped GitHub
  credential described in `docs/BUG-REPORTS.md`.

## 5.0.0-alpha.9

### Added

- Automatic installation/update confirmation to matthew@rocmtssolutions.com after
  the first successful sign-in on each installation/version, including the user,
  computer name, operating system and persistent installation ID. Repeated logins
  do not send duplicate emails, and development builds remain silent.

## 5.0.0-alpha.8

### Improved

- Login-page Support now opens the report window without requiring sign-in,
  with a reply email, screenshots, attachments and diagnostics.
- Support emails now have a readable layout, priority badges and clear download links.
- Attached image/file downloads retain their original filename, extension and file type.

## 5.0.0-alpha.7

### Added

- Receipt delivery choices after an order: Print, Email, Email + print, or None.
- Customer email confirmation prefilled from the linked member's saved email,
  editable for that receipt before confirming the send. Customer records stay
  unchanged, and email/printing failures do not repeat checkout or email delivery.

## 5.0.0-alpha.6

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
