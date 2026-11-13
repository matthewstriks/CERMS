import { parsePrice, type CatalogProduct, type CatalogRecord } from './catalog'
import type { MemberDraft } from './member-creation'
export interface OrderMember {
  id: string
  name: string
  number?: string
  draft?: MemberDraft
}
export const paymentMethods = {
  cash: 'Cash',
  card: 'Card',
  giftCard: 'Gift card',
  check: 'Check',
  other: 'Other',
} as const
export type PaymentMethod = keyof typeof paymentMethods
export interface PaymentEntry {
  method: PaymentMethod
  amount: string
}
export function paymentAmountDue(
  totalCents: number,
  entries: PaymentEntry[],
  index: number,
): number {
  return Math.max(
    0,
    Math.abs(totalCents) -
      entries.reduce((sum, entry, i) => {
        if (i === index) return sum
        try {
          return sum + parsePrice(entry.amount)
        } catch {
          return sum
        }
      }, 0),
  )
}
/** Cash amount is money handed over; only the outstanding balance enters the ledger. */
export function settlePayments(totalCents: number, entries: PaymentEntry[]) {
  if (entries.filter((p) => p.method === 'cash').length > 1)
    throw new Error('Use one cash portion and split the rest across other methods.')
  const amounts = entries.map((p) => parsePrice(p.amount))
  if (amounts.some((amount) => amount <= 0))
    throw new Error('Enter a positive amount for each payment method.')
  const total = Math.abs(totalCents)
  const nonCash = entries.reduce((sum, p, i) => sum + (p.method === 'cash' ? 0 : amounts[i]!), 0)
  if (nonCash > total) throw new Error('Non-cash payments exceed the total due.')
  const cashIndex = entries.findIndex((p) => p.method === 'cash')
  const cashReceived = cashIndex < 0 ? 0 : amounts[cashIndex]!
  const cashApplied = Math.min(cashReceived, total - nonCash)
  if (cashIndex >= 0 && cashApplied === 0)
    throw new Error('Remove the cash payment; other methods cover the total.')
  if (totalCents < 0 && cashReceived > cashApplied)
    throw new Error('Payout amounts cannot exceed the total due.')
  return {
    remainingCents: total - nonCash - cashApplied,
    changeCents: totalCents < 0 ? 0 : cashReceived - cashApplied,
    payments: entries.map((p, i): Payment => ({
      method: p.method,
      amountCents: p.method === 'cash' ? cashApplied : amounts[i]!,
      receivedCents: amounts[i]!,
      reference: '',
    })),
  }
}
export interface Payment {
  method: PaymentMethod
  amountCents: number
  receivedCents: number
  reference: string
}
export interface CartLine {
  assignedRoom?: string
  rentals?: CartRental[]
  priceInput?: string
  product: CatalogRecord<CatalogProduct>
  quantity: number
  unitPriceCents: number
}
export interface CartRental {
  renewalVisitId?: string
  id: string
  assignedRoom: string
  memberId?: string
}
export interface RentalAssignment {
  renewalVisitId?: string
  id?: string
  productId: string
  assignedRoom: string
  memberId?: string
}
export interface SaleRequest {
  member?: OrderMember
  pendingMembers?: OrderMember[]
  rentals?: RentalAssignment[]
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
  members?: OrderMember[]
  memberships?: { productId: string; memberId: string }[]
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
    r.member ? `Member: ${r.member.number ?? r.member.id}` : '',
    '--------------------------------',
    ...r.lines.flatMap((l) => [
      l.name,
      `${l.quantity} × ${money(l.unitPriceCents)}   ${money(l.subtotalCents)}`,
      ...(r.memberships
        ?.filter((a) => a.productId === l.productId)
        .map(
          (a) =>
            `Membership for: ${r.members?.find((m) => m.id === a.memberId)?.name ?? a.memberId}`,
        ) ?? []),
      ...(r.rentals
        ?.filter((a) => a.productId === l.productId)
        .flatMap((a) => [
          `Assigned to: ${r.members?.find((m) => m.id === (a.memberId ?? r.member?.id))?.name ?? r.member?.name ?? a.memberId ?? ''}`,
          ...(a.renewalVisitId ? ['Rental renewal'] : []),
          `Assigned Room/Number: ${a.assignedRoom}`,
        ]) ?? []),
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
