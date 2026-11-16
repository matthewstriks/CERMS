import {
  type ReportData,
  type CsvCell,
  summarizeSales,
  summarizeMembers,
  summarizeRentals,
  reportCsv,
} from './reports'
import { paymentMethods } from './pos'
import { displayReference } from './display-reference'
export type ReportExport =
  | 'summary'
  | 'daily'
  | 'products'
  | 'cashiers'
  | 'payments'
  | 'receipts'
  | 'expirations'
  | 'rentals'
  | 'registers'
export const reportExports: {
  kind: ReportExport
  label: string
  source: 'sales' | 'members' | 'rentals' | 'registers'
}[] = [
  { kind: 'summary', label: 'Sales summary', source: 'sales' },
  { kind: 'daily', label: 'Daily sales', source: 'sales' },
  { kind: 'products', label: 'Products', source: 'sales' },
  { kind: 'cashiers', label: 'Cashiers', source: 'sales' },
  { kind: 'payments', label: 'Payment methods', source: 'sales' },
  { kind: 'receipts', label: 'Receipts', source: 'sales' },
  { kind: 'expirations', label: 'Upcoming membership expirations', source: 'members' },
  { kind: 'rentals', label: 'Rental starts by day', source: 'rentals' },
  { kind: 'registers', label: 'Register closeouts', source: 'registers' },
]
export function exportReport(data: ReportData, kind: ReportExport, timeZone: string) {
  const option = reportExports.find((o) => o.kind === kind)
  if (!option || !data[option.source].rows)
    throw new Error('This report is unavailable. Refresh before exporting.')
  const sales = option.source === 'sales' ? summarizeSales(data.sales.rows!, data.range) : null
  let headers: string[] = [],
    rows: CsvCell[][] = []
  if (sales)
    switch (kind) {
      case 'summary':
        headers = ['Metric', 'Value', 'Unit']
        rows = [
          ['Gross sales before payouts and tax', sales.gross / 100, 'USD'],
          ['Payouts before tax', sales.payouts / 100, 'USD'],
          ['Net sales before tax', sales.net / 100, 'USD'],
          ['Net tax', sales.tax / 100, 'USD'],
          ['Net collected', sales.collected / 100, 'USD'],
          ['Completed transactions', sales.orders, 'Count'],
          ['Average transaction including tax/payouts', sales.average / 100, 'USD'],
          ['Cash handed over', sales.cashReceived / 100, 'USD'],
          ['Change given', sales.change / 100, 'USD'],
          ['New memberships', sales.newMemberships, 'Units'],
          ['Membership renewal units', sales.renewals, 'Units'],
          ['New rental units', sales.rentalUnits, 'Units'],
          ['Rental renewal units', sales.rentalRenewals, 'Units'],
          ['Previous period net sales before tax', sales.previous.net / 100, 'USD'],
          ['Previous period transactions', sales.previous.orders, 'Count'],
        ]
        break
      case 'daily':
        headers = ['Date', 'Transactions', 'Net sales USD', 'Collected USD']
        rows = sales.days.map((d) => [d.day, d.orders, d.net / 100, d.collected / 100])
        break
      case 'products':
        headers = [
          'Product / type key',
          'Saved product name',
          'Type',
          'Units',
          'Net sales USD',
          'Tax USD',
          'Collected USD',
        ]
        rows = sales.products.map((p) => [
          p.id,
          p.name,
          p.kind,
          p.units,
          p.net / 100,
          p.tax / 100,
          p.collected / 100,
        ])
        break
      case 'cashiers':
        headers = [
          'Cashier UID',
          'Saved cashier name',
          'Transactions',
          'Net sales USD',
          'Tax USD',
          'Collected USD',
        ]
        rows = sales.cashiers.map((p) => [
          p.id,
          p.name,
          p.orders,
          p.net / 100,
          p.tax / 100,
          p.collected / 100,
        ])
        break
      case 'payments':
        headers = ['Method', 'Incoming USD', 'Outgoing USD', 'Net collected USD']
        rows = sales.methods.map((p) => [
          paymentMethods[p.method],
          p.incoming / 100,
          p.outgoing / 100,
          p.net / 100,
        ])
        break
      case 'receipts':
        headers = [
          'Order reference',
          'Order UUID',
          'Completed ISO',
          'Register reference',
          'Register UUID',
          'Cashier',
          'Net sales USD',
          'Tax USD',
          'Collected USD',
        ]
        rows = sales.selected.map((s) => [
          displayReference('order', s.receiptNumber),
          s.id,
          new Date(s.createdAt).toISOString(),
          displayReference('register', s.registerId),
          s.registerId,
          s.cashierName,
          s.subtotalCents / 100,
          s.taxCents / 100,
          s.totalCents / 100,
        ])
        break
    }
  if (kind === 'expirations') {
    headers = ['Member ID', 'Member', 'Number', 'Membership', 'Expiration ISO']
    rows = summarizeMembers(data.members.rows!, data.loadedAt, data.range).expiring.map((m) => [
      m.id,
      m.name,
      m.number,
      m.plan,
      new Date(m.expiresAt!).toISOString(),
    ])
  }
  if (kind === 'rentals') {
    headers = ['Date', 'Rental starts']
    rows = summarizeRentals(data.rentals.rows!, data.loadedAt, data.range).days.map((d) => [
      d.day,
      d.starts,
    ])
  }
  if (kind === 'registers') {
    headers = [
      'Register reference',
      'Register UUID',
      'Owner',
      'Closed ISO',
      'Closed by',
      'Opening cash USD',
      'Expected cash USD',
      'Counted cash USD',
      'Over / short USD',
      'POS ledger available',
    ]
    rows = data.registers.rows!.map(({ record: r, totals: t, hasLedger }) => [
      displayReference('register', r.id),
      r.id,
      r.ownerName,
      new Date(r.closedAt!).toISOString(),
      r.closedByName ?? '',
      r.openingTotalCents / 100,
      t.expectedCashCents / 100,
      r.closingTotalCents! / 100,
      (r.closingTotalCents! - t.expectedCashCents) / 100,
      hasLedger ? 'Yes' : 'No; expected equals opening cash',
    ])
  }
  const metadata = [
    data.business,
    kind === 'expirations'
      ? 'Current snapshot; next 30 days'
      : `${data.range.from} through ${data.range.through}`,
    timeZone,
    new Date(data.loadedAt).toISOString(),
  ]
  return reportCsv([
    ['Business', 'Scope', 'Time zone', 'Refreshed ISO', ...headers],
    ...rows.map((r) => [...metadata, ...r]),
  ])
}
