import type { SaleReceipt, PaymentMethod, RegisterTotals } from './pos'
import { paymentMethods } from './pos'
import type { RegisterRecord } from './registers'

export interface ReportRange {
  from: string
  through: string
  start: number
  end: number
  previousStart: number
  days: number
}
export const reportDate = (value: number) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function reportRange(from: string, through: string): ReportRange {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a start and end date.')
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(y!, m! - 1, d!)
    if (reportDate(date.getTime()) !== value) throw new Error('Choose valid calendar dates.')
    return date
  }
  const start = parse(from),
    last = parse(through)
  const days =
    Math.round(
      (Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
        86400000,
    ) + 1
  if (days < 1 || days > 366) throw new Error('Choose an ordered date range of up to 366 days.')
  const end = new Date(last),
    previous = new Date(start)
  end.setDate(end.getDate() + 1)
  previous.setDate(previous.getDate() - days)
  return { from, through, start: +start, end: +end, previousStart: +previous, days }
}
export function reportPreset(kind: 'today' | 'week' | 'month' | 'monthToDate', now = Date.now()) {
  const end = new Date(now),
    start = new Date(now)
  if (kind === 'week') start.setDate(start.getDate() - 6)
  if (kind === 'month') start.setDate(start.getDate() - 29)
  if (kind === 'monthToDate') start.setDate(1)
  return reportRange(reportDate(+start), reportDate(+end))
}
export interface ReportMember {
  id: string
  name: string
  number: string
  plan: string
  expiresAt: number | null
  createdAt: number | null
  dna: boolean
}
export interface ReportRental {
  id: string
  memberId: string
  name: string
  enteredAt: number | null
  endedAt: number | null
  expiresAt: number | null
  active: boolean
  inside: boolean
  waiting: boolean
}
export interface ReportRegister {
  record: RegisterRecord
  totals: RegisterTotals
  hasLedger: boolean
}
export type ReportSource<T> = { rows: T[]; error?: never } | { rows?: never; error: string }
export interface ReportData {
  business: string
  range: ReportRange
  loadedAt: number
  sales: ReportSource<SaleReceipt>
  members: ReportSource<ReportMember>
  rentals: ReportSource<ReportRental>
  registers: ReportSource<ReportRegister>
}
const moneyValue = (value: number) => {
  if (!Number.isSafeInteger(value))
    throw new Error(
      'A saved report contains an invalid money value. No partial financial totals are shown.',
    )
  return value
}
const sum = (values: number[]) => values.reduce((a, b) => moneyValue(a + moneyValue(b)), 0)
export const inPeriod = (value: number | null, start: number, end: number) =>
  value !== null && value >= start && value < end
export function summarizeSales(rows: SaleReceipt[], range: ReportRange) {
  const selected = rows.filter((r) => inPeriod(r.createdAt, range.start, range.end))
  const prior = rows.filter((r) => inPeriod(r.createdAt, range.previousStart, range.start))
  const totals = (sales: SaleReceipt[]) => ({
    orders: sales.length,
    net: sum(sales.map((s) => s.subtotalCents)),
    tax: sum(sales.map((s) => s.taxCents)),
    collected: sum(sales.map((s) => s.totalCents)),
  })
  const current = totals(selected),
    previous = totals(prior)
  const days = new Map<string, { day: string; net: number; collected: number; orders: number }>()
  const cursor = new Date(range.start)
  while (+cursor < range.end) {
    const day = reportDate(+cursor)
    days.set(day, { day, net: 0, collected: 0, orders: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  type Group = {
    id: string
    name: string
    kind: string
    units: number
    orders: number
    net: number
    tax: number
    collected: number
  }
  const products = new Map<string, Group>(),
    cashiers = new Map<string, Group>()
  const methods = Object.fromEntries(
    Object.keys(paymentMethods).map((method) => [
      method,
      { method: method as PaymentMethod, incoming: 0, outgoing: 0, net: 0 },
    ]),
  ) as Record<
    PaymentMethod,
    { method: PaymentMethod; incoming: number; outgoing: number; net: number }
  >
  let gross = 0,
    payouts = 0,
    cashReceived = 0,
    change = 0,
    newMemberships = 0,
    renewals = 0,
    rentalUnits = 0,
    rentalRenewals = 0
  for (const sale of selected) {
    if (
      sum(sale.lines.map((l) => l.subtotalCents)) !== sale.subtotalCents ||
      sum(sale.lines.map((l) => l.taxCents)) !== sale.taxCents ||
      sum(sale.lines.map((l) => l.totalCents)) !== sale.totalCents ||
      sum([sale.subtotalCents, sale.taxCents]) !== sale.totalCents
    )
      throw new Error('A saved receipt does not reconcile. No partial financial totals are shown.')
    const day = days.get(reportDate(sale.createdAt))!
    day.net = sum([day.net, sale.subtotalCents])
    day.collected = sum([day.collected, sale.totalCents])
    day.orders++
    const staff = cashiers.get(sale.cashierUid) ?? {
      id: sale.cashierUid,
      name: sale.cashierName || sale.cashierUid,
      kind: 'Cashier',
      units: 0,
      orders: 0,
      net: 0,
      tax: 0,
      collected: 0,
    }
    staff.orders++
    staff.net = sum([staff.net, sale.subtotalCents])
    staff.tax = sum([staff.tax, sale.taxCents])
    staff.collected = sum([staff.collected, sale.totalCents])
    cashiers.set(staff.id, staff)
    for (const line of sale.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0)
        throw new Error('A saved receipt contains an invalid quantity.')
      const kind = line.payout
        ? 'Payout'
        : line.membership
          ? 'Membership'
          : line.rental
            ? 'Rental'
            : 'Retail'
      const id = `${line.productId}:${kind}`
      const p = products.get(id) ?? {
        id,
        name: line.name,
        kind,
        units: 0,
        orders: 0,
        net: 0,
        tax: 0,
        collected: 0,
      }
      p.units += line.quantity
      p.net = sum([p.net, line.subtotalCents])
      p.tax = sum([p.tax, line.taxCents])
      p.collected = sum([p.collected, line.totalCents])
      products.set(id, p)
      if (line.payout) payouts = sum([payouts, -line.subtotalCents])
      else gross = sum([gross, line.subtotalCents])
    }
    let tenderTotal = 0
    for (const payment of sale.payments) {
      if (!Object.hasOwn(methods, payment.method) || !['in', 'out'].includes(payment.direction))
        throw new Error('A saved receipt has an unsupported payment method.')
      const p = methods[payment.method],
        amount = moneyValue(payment.amountCents)
      if (amount < 0) throw new Error('A saved payment amount is invalid.')
      p[payment.direction === 'in' ? 'incoming' : 'outgoing'] = sum([
        p[payment.direction === 'in' ? 'incoming' : 'outgoing'],
        amount,
      ])
      const signed = amount * (payment.direction === 'out' ? -1 : 1)
      p.net = sum([p.net, signed])
      tenderTotal = sum([tenderTotal, signed])
      if (payment.method === 'cash' && payment.direction === 'in') {
        cashReceived = sum([cashReceived, payment.receivedCents])
        change = sum([change, payment.changeCents])
      }
    }
    if (tenderTotal !== sale.totalCents)
      throw new Error('Saved payments do not match a receipt total.')
    newMemberships += (sale.memberships ?? []).filter((m) => m.action !== 'renewal').length
    renewals += (sale.memberships ?? []).filter((m) => m.action === 'renewal').length
    rentalUnits += (sale.rentals ?? []).filter((r) => !r.renewalVisitId).length
    rentalRenewals += (sale.rentals ?? []).filter((r) => !!r.renewalVisitId).length
  }
  return {
    ...current,
    previous,
    gross,
    payouts,
    cashReceived,
    change,
    newMemberships,
    renewals,
    rentalUnits,
    rentalRenewals,
    average: current.orders ? Math.round(current.collected / current.orders) : 0,
    days: [...days.values()],
    products: [...products.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)),
    cashiers: [...cashiers.values()].sort(
      (a, b) => b.collected - a.collected || a.name.localeCompare(b.name),
    ),
    methods: Object.values(methods),
    selected: selected.sort((a, b) => b.createdAt - a.createdAt),
  }
}
export function summarizeMembers(rows: ReportMember[], now: number, range: ReportRange) {
  const active = rows.filter((m) => !m.dna && m.expiresAt !== null && m.expiresAt > now)
  const expired = rows.filter((m) => !m.dna && m.expiresAt !== null && m.expiresAt <= now)
  const expiring = active
    .filter((m) => m.expiresAt! <= now + 30 * 86400000)
    .sort((a, b) => a.expiresAt! - b.expiresAt! || a.id.localeCompare(b.id))
  return {
    total: rows.length,
    active: active.length,
    expired: expired.length,
    dna: rows.filter((m) => m.dna).length,
    unknown: rows.filter((m) => !m.dna && m.expiresAt === null).length,
    expiring,
    next7: expiring.filter((m) => m.expiresAt! <= now + 7 * 86400000).length,
    created: rows.filter((m) => inPeriod(m.createdAt, range.start, range.end)).length,
  }
}
export function summarizeRentals(rows: ReportRental[], now: number, range: ReportRange) {
  const selected = rows.filter((r) => inPeriod(r.enteredAt, range.start, range.end))
  const live = rows.filter((r) => r.active)
  const types = new Map<string, { name: string; starts: number }>()
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, starts: 0 }))
  const days = new Map<string, number>()
  const cursor = new Date(range.start)
  while (+cursor < range.end) {
    days.set(reportDate(+cursor), 0)
    cursor.setDate(cursor.getDate() + 1)
  }
  for (const rental of selected) {
    const name = rental.name || 'Unspecified rental',
      type = types.get(name) ?? { name, starts: 0 }
    type.starts++
    types.set(name, type)
    hours[new Date(rental.enteredAt!).getHours()]!.starts++
    const day = reportDate(rental.enteredAt!)
    days.set(day, days.get(day)! + 1)
  }
  return {
    selected,
    starts: selected.length,
    uniqueMembers: new Set(selected.map((r) => r.memberId).filter(Boolean)).size,
    priorStarts: rows.filter((r) => inPeriod(r.enteredAt, range.previousStart, range.start)).length,
    active: live.length,
    inside: live.filter((r) => r.inside).length,
    waiting: live.filter((r) => r.waiting).length,
    overdue: live.filter((r) => r.expiresAt !== null && r.expiresAt <= now).length,
    missingDates: rows.filter((r) => r.enteredAt === null).length,
    hours,
    days: [...days].map(([day, starts]) => ({ day, starts })),
    types: [...types.values()].sort((a, b) => b.starts - a.starts),
  }
}
export function comparison(current: number, previous: number) {
  if (previous === 0)
    return current === 0 ? 'No change from previous period' : 'No previous-period baseline'
  const percent = ((current - previous) / Math.abs(previous)) * 100
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}% from previous period`
}
export type CsvCell = string | number | null
export function reportCsv(rows: CsvCell[][]): string {
  const cell = (value: CsvCell) => {
    let text = value === null ? '' : String(value)
    if (typeof value === 'string' && (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)))
      text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
