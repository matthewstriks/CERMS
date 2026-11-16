# Register opening and closing

The user authorized live register deployment on September 30, 2026. Register-only rules were deployed to named `cerms` in `cerms-7af24`, and the required index is **READY**. See [deployment evidence](REGISTERS-DEPLOYMENT.json) for readiness and verification. The exact released rules are archived in `firebase/releases/registers-2026-09-30.rules`; `firebase/cerms.rules` still includes separate, undeployed membership changes. The legacy `(default)` database, its register records, Auth, Storage, user profiles and existing checkout remain unchanged.

The user authorized each signed-in staff member to open one register per business and close only their own, with open registers visible to staff in that business. Cashiers with POS access can record a cash drop from their own open register during a shift. This version stores opening and closing denomination counts, calculated totals, staff identity, server timestamps and an optional closing note. The UI shows the cash change, expected cash, and over/short amount.

## Workflow

Registers opens to the business's open registers. Staff can refresh or load subsequent pages of 50. Their own open register is loaded independently, so the Close my register action is available even if their register is on a later page. The Closed registers tab retains count history, with a read-only View counts action for opening/closing quantities and totals. Lists are ordered by opening time, newest first. Refresh updates changes from other staff; this screen does not use a live subscription.

Open register and Close my register accept whole-number quantities for $100, $50, $20, $10, $5, $2 and $1 bills; and $1, 50¢, 25¢, 10¢, 5¢ and 1¢ coins. Blank means zero; quantities are bounded to 10,000 per denomination. Totals are computed in integer cents without floating-point dollar arithmetic. A failed save keeps the entered values. Closing counts do not overwrite opening counts. After closing, staff can open a new register.

## Data and permissions

- `system/{business}/registers/{uuid}`: schemaVersion, status, ownerUid, ownerName, openingCounts, openingTotalCents, openedAt, closingCounts, closingTotalCents, closedAt and closeNote. All fields are required; closing counts/total/time are null and note empty until closed. The business is defined by the path, never accepted as a mutable record field.
- `system/{business}/registerOwners/{uid}`: only registerId, pointing to that staff member's last register. Other staff cannot read or modify this pointer. It is retained after closing and advanced on the next deliberate open, without modifying a user profile.
- Open is an atomic two-document commit: create the UUID register and create/update the user's pointer. Rules require reciprocal references, a new register, and the previous register to be closed. Concurrent opens cannot both commit.
- Close is one update with an exact field mask: status, closingCounts, closingTotalCents and closeNote, plus the server closedAt timestamp. Only the stored owner may close an open register. Ownership, opening counts/total/time and staff name remain unchanged. Closed records cannot be edited, reopened or deleted.
- Staff access is determined by Auth UID and the saved own-profile business, with an existing business document. All register records are readable within that business. Rules and the desktop request guard validate count schemas, bounds, totals, timestamps and exact write shapes. No general Firestore write API is enabled.
- `system/{business}/registers/{registerId}/cashDrops/{requestId}`: immutable server-owned cash-drop audit records containing the amount in cents, actor, note, request fingerprint and server timestamp. A drop is accepted only for the signed-in cashier's own open register, and the same request UUID is idempotent.
- The client rechecks the session before reads/writes, uses stable request UUIDs, and reads back uncertain saves. An identical retry succeeds without another write; conflicting opening or closing values are rejected.

The prepared index is `registers(status ASC, openedAt DESC)`, collection scope. It serves open and closed register queries under a specific business, bounded to 50 per page. The existing member index remains in the configuration. No legacy imports or live test writes are required.

## Verification

- `npm run check`: 152 unit tests passed, two emulator-only tests skipped, TypeScript check and production build passed.
- `npm run test:rules`: 224 synthetic allow/deny checks passed on the named `cerms` database in loopback-only `demo-cerms-rules`, plus a race proving exactly one concurrent opening succeeds. This includes cross-business and anonymous denial, forged ownership, independent staff registers, invalid quantities/totals, missing fields, immutable opening values, close ownership, closed-history protection and scoped list queries. Closing validation relies on the diff guard preserving previously validated opening values to remain within Firestore's rule-expression limit.
- `node scripts/registers-smoke.mjs`: intercepted Electron flow passed for opening denomination totals, seeing another cashier, preventing a second own register, reloading saved state, denied-close retry with preserved inputs, closing/history and a new shift. Every external request was intercepted; no production request was sent.
- Screenshots: `artifacts/register-opening.png` and `artifacts/register-closed.png`.

The exact register-only release passed 42 focused synthetic emulator checks before deployment. Read-only verification confirmed the legacy `(default)` release and all 28 legacy indexes remained unchanged; existing `cerms` indexes were preserved. No live register documents were created or changed for testing. Audit details are recorded in `REGISTER-RULES-AUDIT.json`.

## POS integration

The subsequent POS release connects immutable server-owned payment totals to each register. Expected cash includes net cash tender (received less change, minus payouts); card and other tenders are tracked separately. Closing over/short compares denomination counts to expected cash. See `POINT-OF-SALE.md` and `POS-DEPLOYMENT.json`. Historical no-POS statements above describe the earlier register-only release.

## Cash drops

The **Cash drop** action is available on an open cashier register to staff with POS access. Enter a positive dollar amount and an optional note to record cash removed from the drawer mid-shift. The server verifies the register owner, current open status and available recorded cash, then atomically writes the audit record and updates the register ledger. Dropped cash is subtracted from expected cash and is therefore not counted as a shortage when the register closes. Cash drops cannot be edited or deleted, and retries with the same request are safe.

## Manager closeout

The subsequent manager-closeout feature adds independent `closeOtherRegisters` permission to Users & permissions. It defaults off for existing staff and is always available to the fixed owner. Authorized staff can select **Close register** beside another cashier’s open register, enter all ending denominations and an optional note, and save. Their own-close permission is separate. No open register is required for the manager.

New closes save verified `closedByUid` and `closedByName` with the server closing timestamp. Closed history displays the actual closer. Historical records remain readable without invented closer information; older clients may still close their own register without actor fields. Closing other staff’s registers requires those fields and matching authenticated profile information. Ownership, opening values, claims and POS totals are preserved. Closed registers remain immutable; the original cashier can open a new register afterward. The POS transaction’s open-register check prevents sales committing after closure.

Verification: 18 focused client checks, four staff-service checks, 311 required synthetic rules checks, build, and intercepted Electron opening/closing plus manager closeout flow passed. No live register writes were performed.

## Printable drawer closeout — November 14, 2026

After a successful close, CERMS opens a **Register closeout report** preview. Staff
select the installed receipt printer and click **Print closeout report**. Closed
register rows also have **Print closeout** for reprints. Printing is deliberate;
closing does not automatically spool a job. The same printer and 80 mm/58 mm paper
preferences are shared with sale receipts, including the Rongta RP326 option.

The report contains the current business receipt header/address, business and
register identifiers, original cashier, actual closer when recorded, saved open
and close times, transaction count, net sales/tax, each payment method, opening
cash, cash received/change/payouts, expected and counted cash, over/short, every
opening/closing denomination count, closing note and a verifier signature line.
Missing historical closer information is labeled **Not recorded**. Payment totals
use only this register's CERMS 5 POS ledger, with the existing no-POS-record
fallback; no legacy sales or cash movements are inferred. The business header is
read from current receipt settings at print time, rather than an immutable header
snapshot. Saved register counts and closed POS totals remain unchanged on reprint.

Report loading reads the saved closed register and server-owned payment totals in
the signed-in staff member's saved business. Open/unconfirmed registers and
inconsistent counts/totals cannot be printed as a completed closeout. No additional
permission or backend/rules deployment is needed: existing business-scoped read
rights apply. No profile, register, receipt or ledger writes are added by printing.

A failed report load disables printing and offers **Retry loading report**. A
printer failure keeps the preview available for retry and explicitly confirms
that the register remains closed; neither error repeats closing or rolls it back.
The existing trusted-window print IPC, installed-driver validation, escaped print
HTML and native print dialog are reused. The native error fallback now refers to
the saved record so it applies to both sale receipts and closeout reports.

Validation: 190 client checks passed (two existing tests skipped), production
build/typecheck passed, and intercepted Electron register/POS flows passed. The
register flow covers report contents, denied-close behavior, load retry, print
failure/retry, 80/58 mm output, manager closeouts, history reprint and unchanged
saved documents. Sale receipt printing/reopening and checkout still pass. All
Firebase requests and print jobs were intercepted; physical RP326 output remains
to be checked with its installed driver. Screenshot:
`artifacts/register-closeout-report.png`. No live business writes, real print jobs,
Firebase deployments or alpha publications were performed for this feature.

Deployed under standing approval. Current rules archive: `firebase/releases/register-managers-2026-09-30.rules`. Evidence: [manager deployment](REGISTER-MANAGERS-DEPLOYMENT.json); legacy configuration and services verified unchanged.

## Opening a register when an order starts

POS checks the signed-in user's own register afresh when an order begins: the first retail/barcode item, a membership selection, or a member-linked order arriving from member creation/check-in. If none is open, it presents the existing denomination-count opening dialog in place. Opening refreshes POS and keeps the complete order draft; canceling keeps the draft and checkout stays disabled until a register is open. The register strip also offers Open register to revisit the prompt. Staff without `openRegisters` see an explanation to ask an administrator for permission; no rights are granted automatically. Empty POS/history views do not prompt, and unresolved sale retries retain their original request/register. Member notes review and membership dialogs resume after the register prompt.

This desktop-only change uses the existing scoped register client and permissions; no backend deployment or production test writes. `node scripts/pos-smoke.mjs --register-prompt` intercepts every HTTPS request and covers first-item detection after a synthetic register close, cancel/draft preservation, opening denomination counts and checkout readiness, member check-in, and pending new memberships.
