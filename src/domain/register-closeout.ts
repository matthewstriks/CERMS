import { cashTotal, denominations, type RegisterRecord } from './registers'
import { paymentMethods, type RegisterTotals } from './pos'
import { displayReference } from './display-reference'

export function registerCloseoutText({
  business,
  receiptName,
  receiptAddress,
  record,
  totals,
}: {
  business: string
  receiptName: string
  receiptAddress: string
  record: RegisterRecord
  totals: RegisterTotals
}): string {
  const cashDropCents = totals.cashDropCents ?? 0
  if (
    record.status !== 'closed' ||
    record.closedAt === null ||
    record.closingCounts === null ||
    record.closingTotalCents === null ||
    record.openingTotalCents !== cashTotal(record.openingCounts) ||
    record.closingTotalCents !== cashTotal(record.closingCounts)
  )
    throw new Error('A saved, closed register is required for a closeout report.')
  const amounts = [
    totals.totalCents,
    totals.taxCents,
    totals.expectedCashCents,
    totals.cashReceivedCents,
    totals.changeGivenCents,
    totals.cashPaidOutCents,
    cashDropCents,
    ...Object.keys(paymentMethods).map(
      (key) => totals.netByMethod?.[key as keyof typeof paymentMethods],
    ),
  ]
  if (
    !Number.isSafeInteger(totals.saleCount) ||
    totals.saleCount < 0 ||
    !amounts.every(Number.isSafeInteger) ||
    totals.expectedCashCents !==
      record.openingTotalCents + totals.netByMethod.cash - cashDropCents ||
    totals.totalCents !== Object.values(totals.netByMethod).reduce((sum, value) => sum + value, 0)
  )
    throw new Error('Saved payment totals could not be verified. Retry loading the report.')
  const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  const divider = '--------------------------------'
  return [
    receiptName || business,
    ...(receiptAddress ? [receiptAddress] : []),
    '',
    'REGISTER CLOSEOUT',
    `Business: ${business}`,
    `Register: ${displayReference('register', record.id)}`,
    `Cashier: ${record.ownerName || record.ownerUid}`,
    `Opened: ${new Date(record.openedAt).toLocaleString()}`,
    `Closed: ${new Date(record.closedAt).toLocaleString()}`,
    `Closed by: ${record.closedByName || record.closedByUid || 'Not recorded'}`,
    divider,
    `Completed transactions: ${totals.saleCount}`,
    `Net sales before tax: ${money(totals.totalCents - totals.taxCents)}`,
    `Tax: ${money(totals.taxCents)}`,
    `Net transaction total: ${money(totals.totalCents)}`,
    divider,
    'NET PAYMENTS',
    ...Object.entries(paymentMethods).map(
      ([key, label]) =>
        `${label}: ${money(totals.netByMethod[key as keyof typeof paymentMethods])}`,
    ),
    divider,
    'CASH RECONCILIATION',
    `Opening cash: ${money(record.openingTotalCents)}`,
    `Cash received: ${money(totals.cashReceivedCents)}`,
    `Change given: ${money(totals.changeGivenCents)}`,
    `Cash paid out: ${money(totals.cashPaidOutCents)}`,
    `Cash dropped: ${money(cashDropCents)}`,
    `Net cash payments: ${money(totals.netByMethod.cash)}`,
    `Expected cash: ${money(totals.expectedCashCents)}`,
    `Counted cash: ${money(record.closingTotalCents)}`,
    `OVER / SHORT: ${money(record.closingTotalCents - totals.expectedCashCents)}`,
    divider,
    'DENOMINATION COUNTS',
    `${'Denomination'.padEnd(15)}${'Open'.padStart(6)}${'Close'.padStart(6)}`,
    ...denominations.map(
      ({ key, label }) =>
        `${label.padEnd(15)}${String(record.openingCounts[key]).padStart(6)}${String(record.closingCounts![key]).padStart(6)}`,
    ),
    `Opening total: ${money(record.openingTotalCents)}`,
    `Closing total: ${money(record.closingTotalCents)}`,
    ...(record.closeNote ? [divider, 'CLOSING NOTE', record.closeNote] : []),
    divider,
    'Verified by: ___________________',
    'Keep this report with the drawer.',
  ].join('\n')
}
