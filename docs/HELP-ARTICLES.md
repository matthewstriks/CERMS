# Help articles and feature coverage

The local support library contains 68 customer-facing, task-based guides in
[help/](help/). These replace the earlier 16 short summaries. The articles are
bundled with the installed app and are the actual source used by local AI support;
updating them does not retrain or download a model. They become available to
installed customers in the next explicitly published desktop release.

## Coverage review

The source/UI review found outdated claims that refunds, staff profile management
and member-file uploads were unavailable, plus missing processes for discounts,
account changes, duplicate matching, messaging, detailed reporting and recovery.
Those gaps are covered below. Login service status, About/menu commands, optional
renewal during expired-member check-in and immutable closeouts are also documented.
Unavailable/prototype features are identified explicitly rather than described as
working procedures. There are no remaining uncovered implemented feature areas
identified in this review; this is a source review, not a hardware or live-service
certification.

The guides cover prerequisites/permissions, named controls and numbered steps,
required confirmations, saved effects, recovery and limitations. Distinct customer,
staff, profile-email and shared-login concepts are kept separate. Production test
transactions, credential sharing, security bypasses and invented menus are never
recommended as troubleshooting.

## Article index

### Getting started, access and personal settings

- [Getting started and finding the right screen](help/getting-started.md)
- [Signing in and resetting a password](help/login.md)
- [Checking the login-page service indicators](help/service-status.md)
- [Finding app details, menu commands and keyboard shortcuts](help/app-details.md)
- [Checking business access and changing system](help/business-access.md)
- [Changing your own display name](help/account-name.md)
- [Changing and verifying your login email](help/account-email.md)
- [Changing your password while signed in](help/account-password.md)
- [Changing appearance and notification sounds](help/theme-sounds.md)

### Members, identity, notes and attachments

- [Finding a member by search or ID scan](help/members-search.md)
- [Creating a new customer membership](help/member-new.md)
- [Reviewing a possible duplicate member](help/member-duplicates.md)
- [Editing a member record](help/member-edit.md)
- [Deleting a member record](help/member-delete.md)
- [Adding and removing member notes](help/notes.md)
- [Setting or clearing Do not admit (DNA)](help/member-dna.md)
- [Confirming required member notes during an order](help/member-note-review.md)
- [Uploading, viewing and downloading member files](help/member-files.md)
- [Reviewing member details, history and activity logs](help/member-history.md)

### POS, payments, receipts, returns and promotions

- [Building an order in Point of sale](help/checkout.md)
- [Recording cash, card and split payments](help/payments.md)
- [Recovering an uncertain order without duplicating payment](help/order-recovery.md)
- [Combining multiple members, memberships and rentals in one order](help/group-orders.md)
- [Renewing an existing membership](help/renewal.md)
- [Waiving a product or recording a payout](help/waivers-payouts.md)
- [Configuring tax and receipt information](help/tax.md)
- [Printing or emailing a receipt](help/receipt.md)
- [Confirming a customer's receipt email](help/receipt-email.md)
- [Returning items and recording a refund](help/refunds.md)
- [Choosing whether a refund also cancels membership or rentals](help/refund-services.md)
- [Applying a discount code to an order](help/discount-apply.md)
- [Creating and managing discount codes](help/discount-manage.md)

### Rentals and admissions

- [Using Overview and Admissions & rentals](help/overview.md)
- [Checking in a member with a rental](help/rental.md)
- [Editing a rental, in/out status or waitlist](help/rental-edit.md)
- [Adding paid time to an active rental](help/rental-renewal.md)
- [Checking out and completing a rental visit](help/rental-checkout.md)

### Catalog and inventory

- [Creating, editing and deleting products](help/products.md)
- [Creating categories and organizing the POS catalog](help/categories.md)
- [Adding or replacing product images](help/product-images.md)
- [Low inventory email alerts](help/inventory-emails.md)

### Registers and cash handling

- [Opening and closing a register](help/register.md)
- [Counting and closing your own register](help/register-close.md)
- [Closing another staff member's register](help/register-manager.md)
- [Recording a cash drop during a shift](help/cash-drop.md)
- [Reviewing a register's payments and cash ledger](help/register-ledger.md)
- [Printing a saved register closeout](help/register-print.md)

### Staff administration and communication

- [Creating a staff login account](help/staff-create.md)
- [Staff accounts and permissions](help/permissions.md)
- [Editing staff profiles and removing CERMS 5 access](help/staff-management.md)
- [Starting a private staff conversation](help/messages.md)
- [Searching messages and understanding read receipts](help/message-history.md)

### Reports and exports

- [Reports and daily emails](help/reports.md)
- [Reviewing sales, payment methods, products and cashiers](help/report-sales.md)
- [Reporting on memberships and rental activity](help/report-members-rentals.md)
- [Reporting on register closeouts](help/report-registers.md)
- [Exporting report data to CSV](help/report-export.md)
- [Understanding the daily report email and workbook](help/daily-email.md)

### Installation, updates, AI and support

- [Installing CERMS on Windows or Mac](help/installation.md)
- [Updating CERMS and Mac installation](help/updates.md)
- [Installation and update confirmation emails](help/installation-email.md)
- [Setting up CERMS Assistant](help/local-ai.md)
- [Removing or reinstalling the CERMS Assistant download](help/assistant-remove.md)
- [Chatting with CERMS Assistant and finishing a conversation](help/ai-conversations.md)
- [Submitting a support ticket or bug report](help/support-tickets.md)
- [Attaching screenshots and downloading support files](help/support-attachments.md)
- [Connection problems and support tickets](help/connection.md)
- [Recognizing unavailable features and release differences](help/feature-limits.md)

## Maintaining coverage

1. For every feature or changed process, update/add a focused guide in `docs/help/`
   in the same change. Check the actual controls, permissions and server behavior,
   not an old roadmap or generic module feature preview.
2. Start each Markdown file with `id` and `keywords` front matter and one H1 title.
   Keep IDs stable for citations. Use short task-focused headings, numbered steps,
   prerequisites, confirmations, result and failure/retry guidance. Split a long
   process into focused guides rather than dropping important instructions.
3. Keep only customer-facing information here. Internal database paths, service
   accounts, deployment commands/secrets and operational incident notes belong in
   engineering docs outside this folder and are never ingested automatically.
4. Add the guide to this index and the focused support-coverage/retrieval checks.
   Include representative user wording and synonyms in metadata, without making
   claims that the UI/backend does not implement. Update unsupported-feature
   guidance when a feature becomes available.
5. Run `npx vitest run tests/support-knowledge.test.ts tests/ai-support.test.ts`.
   Only a loader/rendering change needs a focused build/desktop check. Do not
   package, deploy, bump a version or run unrelated suites for an article edit.

`src/main/support-knowledge.ts` imports only these Markdown guides as bundled raw
text. Weighted title/keyword retrieval, plural/action normalization and a small
follow-up tie-break select up to three complete guides within a 6,000-character
article budget. Current-topic terms control retrieval so an earlier question does
not dominate a new topic. Recent chat is separately bounded for the local model.
The model must use supplied docs, cite their titles and admit missing coverage;
unknown subjects have a documentation-not-found fallback. Help article paragraphs
and numbered steps preserve line breaks when expanded in the support window.

Focused validation covers the article catalog/all permission labels, representative
support questions, context limits, changed topics, unknown questions and corrected
feature boundaries. Model responses and all external effects are mocked. Real
local-model answer quality/speed still depend on the installed model/hardware; the
checks verify supplied knowledge and integration, not factual obedience of an LLM.
No Firebase deployment, live account/data/email action, paid model API, release
packaging or version increment is part of this documentation update.
