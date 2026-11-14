# Receipt-friendly order and register references

The desktop shows `O-XXXX-XXXX` for orders and `R-XXXX-XXXX` for registers. Eight
uppercase Crockford Base32 symbols avoid I, L, O and U inside the code. Prefixes
identify the record type.

Sale receipts, register closeout reports, count dialogs, the POS open-register
strip, sales history and register lists use the same formatter. Existing UUID
records gain the format immediately when viewed or reprinted, without backfill.
Custom non-UUID historical references are preserved as supplied.

Sales history matches either short order/register reference, and Registers has a
new reference/staff search field. Matching ignores letter case, spaces and
hyphens. Existing full-UUID and name searches remain available. Both lists filter
loaded records; their load-older/load-more controls extend search coverage.

These are display/search aliases, not replacement database identities. Original
UUIDs remain in document paths, order retries, register claims, member/rental
links and exports. No Firestore rules, writes, migrations, backend deployment or
new client permission is needed. The desktop change ships with the next release.

Mapping is fixed: FNV-1a 64-bit over the lowercase complete canonical UUID, lowest
40 bits encoded as eight Base32 symbols, grouped 4/4 with the kind prefix. Do not
change this mapping in a future release: already-printed references must continue
matching. A golden-vector test protects it.

An eight-symbol alias is not an authoritative unique key. Search retains all
matching rows, including any alias collision, so staff can distinguish records
by date, cashier/customer and amounts. Never automatically select one match or
use the short alias as a write target.

Validation: 16 focused reference/receipt/closeout checks plus TypeScript passed;
no full build, live writes or deployment was performed for this change.
