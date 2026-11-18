---
id: report-export
keywords: export CSV Excel download report spreadsheet rows pages dates timezone summary products cashiers receipts
---

# Exporting report data to CSV

## Steps

1. In Reports & analytics select/apply the intended dates and wait for the relevant source to finish loading.
2. Check the applied business, time zone and refresh time.
3. Use Export CSV and choose sales summary, daily sales, products, cashiers, payment methods, receipt detail, upcoming membership expirations, daily rental starts or register closeouts as appropriate.
4. Save/open the downloaded file in Excel or another CSV reader. Currency columns are USD dollars; date/scope metadata accompanies the export.
5. Preserve the original exported file when investigating a discrepancy so its refresh/range context is retained.

## Completeness and limits

Exports contain every loaded source row, not only the current visible table page. Unavailable/oversized sources have disabled exports rather than silently truncated totals. Current-expiration exports are snapshots and do not reconstruct historical member status. Receipt/register exports keep full identifiers as well as display references. Prior comparison receipts are not mixed into the selected-period export.

## If the file is missing

Check the workstation's download location and operating-system download prompt. Refresh a failed source before retrying; narrowing financial dates may resolve a size limit. CSV is a deliberate local download, not an automatic email, QuickBooks import or new accounting integration. Private notes and payment references are not included in these report CSVs; keep business exports in an authorized location.
