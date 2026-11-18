export const refundEndpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/refundSale'
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const uuid = (v: unknown) =>
  typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === keys.sort().join()
export const refundMethods = ['cash', 'card', 'giftCard', 'check', 'other'] as const
export type RefundMethod = (typeof refundMethods)[number]
export interface RefundRequest {
  action: 'refund'
  business: string
  saleId: string
  registerId: string
  requestId: string
  expectedRevision: number
  reason: string
  confirmed: true
  lines: { index: number; quantity: number; restock: boolean; cancelService: boolean }[]
  payments: { method: RefundMethod; amountCents: number; reference: string }[]
}
export interface RefundQuote {
  revision: number
  returnedQuantities: number[]
  remainingByMethod: Record<RefundMethod, number>
  restockable: boolean[]
}
export function validRefundData(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const d = v as Record<string, unknown>
  if (!id(d.business) || !uuid(d.saleId)) return false
  if (d.action === 'quote') return exact(d, ['action', 'business', 'saleId'])
  return (
    exact(d, [
      'action',
      'business',
      'saleId',
      'registerId',
      'requestId',
      'expectedRevision',
      'reason',
      'confirmed',
      'lines',
      'payments',
    ]) &&
    d.action === 'refund' &&
    uuid(d.registerId) &&
    uuid(d.requestId) &&
    d.saleId !== d.requestId &&
    Number.isSafeInteger(d.expectedRevision) &&
    Number(d.expectedRevision) >= 0 &&
    typeof d.reason === 'string' &&
    !!d.reason.trim() &&
    d.reason.length <= 500 &&
    d.confirmed === true &&
    Array.isArray(d.lines) &&
    d.lines.length > 0 &&
    d.lines.length <= 100 &&
    new Set(d.lines.map((l) => l?.index)).size === d.lines.length &&
    d.lines.every(
      (l) =>
        exact(l, ['index', 'quantity', 'restock', 'cancelService']) &&
        Number.isSafeInteger(l.index) &&
        Number(l.index) >= 0 &&
        Number(l.index) < 100 &&
        Number.isSafeInteger(l.quantity) &&
        Number(l.quantity) > 0 &&
        Number(l.quantity) <= 1000 &&
        typeof l.restock === 'boolean' &&
        typeof l.cancelService === 'boolean',
    ) &&
    Array.isArray(d.payments) &&
    d.payments.length <= 5 &&
    new Set(d.payments.map((p) => p?.method)).size === d.payments.length &&
    d.payments.every(
      (p) =>
        exact(p, ['method', 'amountCents', 'reference']) &&
        refundMethods.includes(p.method as RefundMethod) &&
        Number.isSafeInteger(p.amountCents) &&
        Number(p.amountCents) > 0 &&
        Number(p.amountCents) <= 999999999 &&
        typeof p.reference === 'string' &&
        p.reference.length <= 120,
    )
  )
}
export function isRefundRequest(body?: string): boolean {
  try {
    if (!body || body.length > 40000) return false
    const d = JSON.parse(body)
    return exact(d, ['data']) && validRefundData(d.data)
  } catch {
    return false
  }
}
/** Cumulative rounding makes the final partial return exactly match the original tax. */
export function refundLineAmounts(
  line: { quantity: number; subtotalCents: number; taxCents: number },
  already: number,
  quantity: number,
) {
  if (
    !Number.isSafeInteger(line.quantity) ||
    line.quantity <= 0 ||
    !Number.isSafeInteger(already) ||
    already < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    already + quantity > line.quantity ||
    ![line.subtotalCents, line.taxCents].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 999999999,
    )
  )
    throw Error('Return quantity exceeds the remaining receipt quantity.')
  const portion = (value: number) =>
    Math.round((value * (already + quantity)) / line.quantity) -
    Math.round((value * already) / line.quantity)
  const subtotalCents = portion(line.subtotalCents),
    taxCents = portion(line.taxCents)
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents }
}
