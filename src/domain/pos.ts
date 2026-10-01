import type { CatalogProduct, CatalogRecord } from './catalog'
export const paymentMethods = {
  cash: 'Cash',
  card: 'Card',
  giftCard: 'Gift card',
  check: 'Check',
  other: 'Other',
} as const
export type PaymentMethod = keyof typeof paymentMethods
export interface Payment {
  method: PaymentMethod
  amountCents: number
  receivedCents: number
  reference: string
}
export interface CartLine {
  priceInput?: string
  product: CatalogRecord<CatalogProduct>
  quantity: number
  unitPriceCents: number
}
export interface SaleRequest {
  business: string
  requestId: string
  registerId: string
  taxRateBps: number
  customerName: string
  note: string
  lines: { productId: string; version: number; quantity: number; unitPriceCents: number }[]
  payments: Payment[]
}
export interface PosSettings {
  taxRateBps: number | null
  receiptName: string
  receiptAddress: string
  receiptFooter: string
}
export interface RegisterTotals {
  saleCount: number
  totalCents: number
  taxCents: number
  netByMethod: Record<PaymentMethod, number>
  expectedCashCents: number
  cashReceivedCents: number
  changeGivenCents: number
  cashPaidOutCents: number
}
export interface SaleReceipt extends Omit<SaleRequest, 'lines' | 'payments' | 'requestId'> {
  id: string
  receiptNumber: string
  createdAt: number
  cashierUid: string
  cashierName: string
  receiptName: string
  receiptAddress: string
  receiptFooter: string
  subtotalCents: number
  taxCents: number
  totalCents: number
  lines: (SaleRequest['lines'][number] & {
    name: string
    subtotalCents: number
    taxCents: number
    totalCents: number
    membership: boolean
    rental: boolean
    payout: boolean
  })[]
  payments: (Payment & { direction: 'in' | 'out'; changeCents: number })[]
}
export function cartTotals(lines: CartLine[], rate: number | null) {
  const subtotalCents = lines.reduce(
    (s, l) => s + l.unitPriceCents * l.quantity * (l.product.data.payout ? -1 : 1),
    0,
  )
  const taxCents = lines.reduce(
    (s, l) =>
      s +
      (l.product.data.taxable
        ? Math.round((l.unitPriceCents * l.quantity * (rate ?? 0)) / 10000) *
          (l.product.data.payout ? -1 : 1)
        : 0),
    0,
  )
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents }
}
export const emptyRegisterTotals = (opening: number): RegisterTotals => ({
  saleCount: 0,
  totalCents: 0,
  taxCents: 0,
  netByMethod: { cash: 0, card: 0, giftCard: 0, check: 0, other: 0 },
  expectedCashCents: opening,
  cashReceivedCents: 0,
  changeGivenCents: 0,
  cashPaidOutCents: 0,
})
export function receiptText(r: SaleReceipt): string {
  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100)
  return [
    r.receiptName,
    r.receiptAddress,
    '',
    r.totalCents < 0 ? 'PAYOUT RECEIPT' : 'SALES RECEIPT',
    new Date(r.createdAt).toLocaleString(),
    `Receipt: ${r.receiptNumber}`,
    `Cashier: ${r.cashierName}`,
    `Register: ${r.registerId}`,
    r.customerName ? `Customer: ${r.customerName}` : '',
    '--------------------------------',
    ...r.lines.flatMap((l) => [
      l.name,
      `${l.quantity} × ${money(l.unitPriceCents)}   ${money(l.subtotalCents)}`,
    ]),
    '--------------------------------',
    `Subtotal: ${money(r.subtotalCents)}`,
    `Tax (${r.taxRateBps / 100}%): ${money(r.taxCents)}`,
    `TOTAL: ${money(r.totalCents)}`,
    '',
    ...r.payments.flatMap((p) => [
      `${paymentMethods[p.method]} ${p.direction === 'out' ? 'paid out' : 'paid'}: ${money(p.amountCents)}`,
      ...(p.method === 'cash' && p.direction === 'in'
        ? [`Cash received: ${money(p.receivedCents)}`, `Change: ${money(p.changeCents)}`]
        : []),
      ...(p.reference ? [`Reference: ${p.reference}`] : []),
    ]),
    r.note ? `Note: ${r.note}` : '',
    '',
    r.receiptFooter,
  ]
    .filter((s, i, a) => s !== '' || a[i - 1] !== '')
    .join('\n')
}
