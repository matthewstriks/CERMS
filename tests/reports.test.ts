import { describe, expect, it } from 'vitest'
import {
  reportRange,
  reportDate,
  reportPreset,
  summarizeSales,
  summarizeMembers,
  summarizeRentals,
  comparison,
  reportCsv,
  type ReportData,
} from '../src/domain/reports'
import { exportReport } from '../src/domain/report-export'
import type { SaleReceipt } from '../src/domain/pos'
const range = reportRange('2026-11-01', '2026-11-07')
const id = '10000000-0000-4000-8000-000000000001'
function receipt(payout = false, createdAt = range.start): SaleReceipt {
  const net = payout ? -200 : 1000,
    tax = payout ? -16 : 80
  return {
    id: payout ? 'payout' : id,
    business: 'dev',
    receiptNumber: id,
    registerId: id,
    createdAt,
    cashierUid: 'cashier',
    cashierName: '=FORMULA',
    customerName: 'Not exported',
    note: 'Private note not exported',
    receiptName: 'Dev',
    receiptAddress: '',
    receiptFooter: '',
    taxRateBps: 800,
    subtotalCents: net,
    taxCents: tax,
    totalCents: net + tax,
    lines: [
      {
        productId: payout ? 'payout' : 'retail',
        name: payout ? 'Cash payout' : 'Saved product',
        version: 1,
        quantity: 1,
        unitPriceCents: Math.abs(net),
        subtotalCents: net,
        taxCents: tax,
        totalCents: net + tax,
        membership: false,
        rental: false,
        payout,
      },
    ],
    payments: payout
      ? [
          {
            method: 'cash',
            amountCents: 216,
            receivedCents: 216,
            changeCents: 0,
            reference: '',
            direction: 'out',
          },
        ]
      : [
          {
            method: 'cash',
            amountCents: 580,
            receivedCents: 1000,
            changeCents: 420,
            reference: '',
            direction: 'in',
          },
          {
            method: 'card',
            amountCents: 500,
            receivedCents: 500,
            changeCents: 0,
            reference: '',
            direction: 'in',
          },
        ],
  }
}
describe('report calendar ranges', () => {
  it('uses inclusive calendar dates, exclusive end, and an equal preceding period', () => {
    expect(range.days).toBe(7)
    expect(reportDate(range.end)).toBe('2026-11-08')
    expect(reportDate(range.previousStart)).toBe('2026-10-25')
    const dst = reportRange('2026-03-08', '2026-03-08')
    expect(dst.days).toBe(1)
    expect(reportDate(dst.previousStart)).toBe('2026-03-07')
    expect(reportDate(dst.end)).toBe('2026-03-09')
  })
  it('rejects malformed/reversed/oversized ranges and invalid calendar dates', () => {
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-11-07', '2026-11-01'],
      ['', '2026-11-01'],
      ['2025-01-01', '2026-01-02'],
    ])
      expect(() => reportRange(from!, to!)).toThrow()
  })
  it('generates presets without treating a month as thirty days', () => {
    const when = new Date(2026, 10, 16, 12).getTime()
    expect(reportPreset('monthToDate', when).from).toBe('2026-11-01')
    expect(reportPreset('week', when).days).toBe(7)
    expect(reportPreset('month', when).days).toBe(30)
  })
})
describe('financial report reconciliation', () => {
  it('reconciles tax, split tenders, cash change and payouts with correct date boundaries', () => {
    const prior = receipt(false, range.previousStart)
    const stats = summarizeSales(
      [
        receipt(),
        receipt(true),
        prior,
        receipt(false, range.end),
        receipt(false, range.previousStart - 1),
      ],
      range,
    )
    expect(stats).toMatchObject({
      orders: 2,
      gross: 1000,
      payouts: 200,
      net: 800,
      tax: 64,
      collected: 864,
      average: 432,
      cashReceived: 1000,
      change: 420,
      previous: { orders: 1, net: 1000 },
    })
    expect(stats.methods.find((m) => m.method === 'cash')).toMatchObject({
      incoming: 580,
      outgoing: 216,
      net: 364,
    })
    expect(stats.methods.reduce((n, m) => n + m.net, 0)).toBe(stats.collected)
    expect(stats.days).toHaveLength(7)
    expect(stats.days[0]?.orders).toBe(2)
    expect(stats.days.at(-1)?.net).toBe(0)
    expect(stats.products.find((p) => p.kind === 'Payout')?.units).toBe(1)
  })
  it('fails explicitly for inconsistent/unsafe saved money or payment values', () => {
    const lineMismatch = receipt()
    lineMismatch.lines[0]!.totalCents++
    const paymentMismatch = receipt()
    paymentMismatch.payments[0]!.amountCents++
    const unsafe = receipt()
    unsafe.subtotalCents = Number.MAX_SAFE_INTEGER + 1
    for (const sale of [lineMismatch, paymentMismatch, unsafe])
      expect(() => summarizeSales([sale], range)).toThrow()
  })
  it('counts new memberships and renewal units separately from rental extensions', () => {
    const sale = receipt()
    sale.memberships = [
      { memberId: 'one', productId: 'plan' },
      { memberId: 'two', productId: 'plan', action: 'renewal' },
      { memberId: 'two', productId: 'plan', action: 'renewal' },
    ]
    sale.rentals = [
      { productId: 'room', assignedRoom: 'A' },
      { productId: 'room', assignedRoom: 'A', renewalVisitId: 'old' },
    ]
    expect(summarizeSales([sale], range)).toMatchObject({
      newMemberships: 1,
      renewals: 2,
      rentalUnits: 1,
      rentalRenewals: 1,
    })
  })
  it('handles an empty period and zero/negative previous baselines honestly', () => {
    expect(summarizeSales([], range)).toMatchObject({ orders: 0, net: 0, average: 0 })
    expect(comparison(10, 0)).toContain('No previous-period baseline')
    expect(comparison(0, 0)).toContain('No change')
    expect(comparison(0, -100)).toContain('+100.0%')
  })
})
it('separates current membership state from selected-date creation and purchases', () => {
  const now = range.end
  const member = {
    id: 'one',
    name: 'Member',
    number: '1',
    plan: 'Plan',
    createdAt: range.start,
    expiresAt: now + 86400000,
    dna: false,
  }
  const stats = summarizeMembers(
    [
      member,
      { ...member, id: 'two', expiresAt: now },
      { ...member, id: 'dna', dna: true },
      { ...member, id: 'unknown', expiresAt: null, createdAt: null },
    ],
    now,
    range,
  )
  expect(stats).toMatchObject({
    total: 4,
    active: 1,
    expired: 1,
    dna: 1,
    unknown: 1,
    next7: 1,
    created: 3,
  })
  expect(stats.expiring.map((m) => m.id)).toEqual(['one'])
})
it('counts rental records separately and deduplicates visiting members; current occupancy is independent', () => {
  const rental = {
    id: 'a',
    memberId: 'one',
    name: 'Room',
    enteredAt: range.start,
    endedAt: null,
    expiresAt: range.end - 1,
    active: true,
    inside: true,
    waiting: false,
  }
  const stats = summarizeRentals(
    [
      rental,
      { ...rental, id: 'b', active: false },
      { ...rental, id: 'c', enteredAt: range.previousStart, waiting: true },
      { ...rental, id: 'd', enteredAt: null, active: false },
    ],
    range.end,
    range,
  )
  expect(stats).toMatchObject({
    starts: 2,
    uniqueMembers: 1,
    active: 2,
    inside: 2,
    waiting: 1,
    overdue: 2,
    priorStarts: 1,
    missingDates: 1,
  })
  expect(stats.hours.reduce((n, h) => n + h.starts, 0)).toBe(2)
})
it('exports scoped CSV with stable IDs, correct units, no private notes, and spreadsheet formula protection', () => {
  const data: ReportData = {
    business: 'dev',
    range,
    loadedAt: range.end,
    sales: { rows: [receipt()] },
    members: { rows: [] },
    rentals: { rows: [] },
    registers: { rows: [] },
  }
  const csv = exportReport(data, 'receipts', 'America/New_York')
  expect(csv).toContain('"dev"')
  expect(csv).toContain('"2026-11-01 through 2026-11-07"')
  expect(csv).toContain('"10.8"')
  expect(csv).toContain(id)
  expect(csv).toContain("'=FORMULA")
  expect(csv).not.toContain('Private note')
  expect(csv).not.toContain('Not exported')
  expect(reportCsv([[' =SUM(A1)', 'a,"b"\nc', -2]])).toContain('"\' =SUM(A1)"')
  expect(reportCsv([[-2]])).toBe('\ufeff"-2"\r\n')
  expect(exportReport(data, 'daily', 'UTC').split('\r\n')).toHaveLength(9)
  expect(() =>
    exportReport({ ...data, sales: { error: 'Unavailable' } }, 'summary', 'UTC'),
  ).toThrow('unavailable')
})
