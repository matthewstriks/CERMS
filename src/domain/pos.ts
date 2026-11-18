import type { DiscountSelection } from '../shared/discount-policy'
import { parsePrice, type CatalogProduct, type CatalogRecord } from './catalog'
import type { MemberDraft } from './member-creation'
import type { MembershipRenewalMode } from './membership-renewal'
import { displayReference } from './display-reference'
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
  waived?: boolean
  memberships?: CartMembership[]
  assignedRoom?: string
  rentals?: CartRental[]
  priceInput?: string
  product: CatalogRecord<CatalogProduct>
  quantity: number
  unitPriceCents: number
}
export interface CartMembership {
  id: string
  memberId: string
  mode: MembershipRenewalMode
}
export interface MembershipAssignment extends CartMembership {
  productId: string
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
  discount?: DiscountSelection
  noteAcknowledgements?: { memberId: string; revision: number }[]
  membershipAssignments?: MembershipAssignment[]
  member?: OrderMember
  pendingMembers?: OrderMember[]
  rentals?: RentalAssignment[]
  business: string
  requestId: string
  registerId: string
  taxRateBps: number
  customerName: string
  note: string
  lines: {
    productId: string
    version: number
    quantity: number
    unitPriceCents: number
    waived?: boolean
  }[]
  payments: Payment[]
}
export interface PosSettings {
  taxRateBps: number | null
  receiptName: string
  receiptAddress: string
  receiptFooter: string
}
export interface RegisterTotals {
  discountCents?: number
  refundCount?: number
  refundCents?: number
  refundTaxCents?: number
  saleCount: number
  totalCents: number
  taxCents: number
  netByMethod: Record<PaymentMethod, number>
  expectedCashCents: number
  cashDropCents: number
  cashReceivedCents: number
  changeGivenCents: number
  cashPaidOutCents: number
}
export interface SaleReceipt extends Omit<
  SaleRequest,
  'lines' | 'payments' | 'requestId' | 'membershipAssignments' | 'noteAcknowledgements' | 'discount'
> {
  discount?: {
    code: string
    name: string
    kind: 'percent' | 'amount'
    value: number
    version: number
  }
  discountCents?: number
  kind?: 'refund'
  originalSaleId?: string
  originalReceiptNumber?: string
  reason?: string
  members?: OrderMember[]
  memberships?: {
    productId: string
    memberId: string
    action?: 'new' | 'renewal'
    mode?: MembershipRenewalMode
    previousExpiresAt?: number | null
    expiresAt?: number
    id?: string
  }[]
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
    discountCents?: number
    grossSubtotalCents?: number
    subtotalCents: number
    taxCents: number
    totalCents: number
    membership: boolean
    rental: boolean
    payout: boolean
  })[]
  payments: (Payment & { direction: 'in' | 'out'; changeCents: number })[]
}
export function cartTotals(lines: CartLine[], rate: number | null, discounts: number[] = []) {
  const subtotals = lines.map(
    (l, i) =>
      (l.waived ? 0 : l.unitPriceCents) * l.quantity * (l.product.data.payout ? -1 : 1) -
      (discounts[i] ?? 0),
  )
  const subtotalCents = subtotals.reduce((a, b) => a + b, 0)
  const taxCents = lines.reduce(
    (sum, l, i) =>
      sum +
      (l.product.data.taxable
        ? Math.round((Math.abs(subtotals[i]!) * (rate ?? 0)) / 10000) * Math.sign(subtotals[i]!)
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
  cashDropCents: 0,
  cashReceivedCents: 0,
  changeGivenCents: 0,
  cashPaidOutCents: 0,
})
export function receiptText(r: SaleReceipt, timeZone?: string): string {
  const date = (value: number) =>
    new Date(value).toLocaleString(
      'en-US',
      timeZone ? { timeZone, timeZoneName: 'short' } : undefined,
    )
  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100)
  return [
    r.receiptName,
    r.receiptAddress,
    '',
    r.kind === 'refund'
      ? 'RETURN / REFUND RECEIPT'
      : r.totalCents < 0
        ? 'PAYOUT RECEIPT'
        : 'SALES RECEIPT',
    ...(r.kind === 'refund'
      ? [
          `Original order: ${displayReference('order', r.originalSaleId ?? '')}`,
          `Reason: ${r.reason ?? r.note}`,
        ]
      : []),
    date(r.createdAt),
    `Order: ${displayReference('order', r.receiptNumber)}`,
    `Cashier: ${r.cashierName}`,
    `Register: ${displayReference('register', r.registerId)}`,
    r.customerName ? `Customer: ${r.customerName}` : '',
    r.member ? `Member: ${r.member.number ?? r.member.id}` : '',
    '--------------------------------',
    ...r.lines.flatMap((l) => [
      l.name,
      `${l.quantity} × ${money(l.unitPriceCents)}   ${money(l.subtotalCents)}${l.waived ? '   WAIVED' : ''}`,
      ...(r.memberships
        ?.filter((a) => a.productId === l.productId)
        .map(
          (a) =>
            `Membership ${a.action === 'renewal' ? 'renewal' : 'for'}: ${r.members?.find((m) => m.id === a.memberId)?.name ?? a.memberId}${a.mode ? ` · ${a.mode === 'restart' ? 'Start from today' : 'Add to existing expiration'}` : ''}${a.expiresAt !== undefined ? ` · Expires ${date(a.expiresAt * 1000)}` : ''}`,
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
    ...(r.discount
      ? [
          `${r.kind === 'refund' ? 'Discount reversed' : 'Discount'} ${r.discount.code}: ${money(-(r.discountCents ?? 0))}`,
        ]
      : []),
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
