import { describe, expect, it } from 'vitest'
import { registerCloseoutText } from '../src/domain/register-closeout'
import { emptyCashCounts, type RegisterRecord } from '../src/domain/registers'
import { emptyRegisterTotals } from '../src/domain/pos'
import { displayReference } from '../src/domain/display-reference'

function fixture() {
  const record: RegisterRecord = {
    id: '10000000-0000-4000-8000-000000000000',
    schemaVersion: 1,
    status: 'closed',
    ownerUid: 'cashier',
    ownerName: 'Cashier Name',
    openingCounts: { ...emptyCashCounts(), bill20: 5 },
    openingTotalCents: 10000,
    openedAt: Date.UTC(2026, 10, 14, 12),
    closingCounts: { ...emptyCashCounts(), bill20: 5, bill10: 1 },
    closingTotalCents: 11000,
    closedAt: Date.UTC(2026, 10, 14, 20),
    closedByUid: 'manager',
    closedByName: 'Closing Manager',
    closeNote: 'Drawer verified',
  }
  const totals = {
    ...emptyRegisterTotals(10000),
    saleCount: 2,
    totalCents: 2160,
    taxCents: 160,
    netByMethod: { cash: 1000, card: 1160, giftCard: 0, check: 0, other: 0 },
    expectedCashCents: 11000,
    cashReceivedCents: 2000,
    changeGivenCents: 1000,
  }
  return {
    business: 'club-a',
    receiptName: 'Synthetic Club',
    receiptAddress: '123 Test Street',
    record,
    totals,
  }
}
describe('register drawer closeout report', () => {
  it('separates card tender from drawer cash, preserves counts and identifies a manager close', () => {
    const data = fixture(),
      report = registerCloseoutText(data)
    for (const text of [
      'REGISTER CLOSEOUT',
      'Synthetic Club',
      '123 Test Street',
      'Business: club-a',
      `Register: ${displayReference('register', data.record.id)}`,
      'Cashier: Cashier Name',
      'Closed by: Closing Manager',
      'Completed transactions: 2',
      'Tax: $1.60',
      'Card: $11.60',
      'Cash received: $20.00',
      'Change given: $10.00',
      'Expected cash: $110.00',
      'Counted cash: $110.00',
      'OVER / SHORT: $0.00',
      'DENOMINATION COUNTS',
      '$2 bills',
      '50¢ coins',
      '1¢ coins',
      'Drawer verified',
    ])
      expect(report).toContain(text)
    expect(data.record.openingTotalCents).toBe(10000)
    expect(data.totals.netByMethod.card).toBe(1160)
  })
  it('reports shortages and overages, and correctly subtracts cash payouts', () => {
    const data = fixture()
    data.totals.netByMethod.cash = -500
    data.totals.cashPaidOutCents = 1500
    data.totals.expectedCashCents = 9500
    data.totals.totalCents = 660
    expect(registerCloseoutText(data)).toContain('OVER / SHORT: $15.00')
    data.record.closingCounts = { ...emptyCashCounts(), bill20: 4 }
    data.record.closingTotalCents = 8000
    expect(registerCloseoutText(data)).toContain('OVER / SHORT: -$15.00')
    expect(registerCloseoutText(data)).toContain('Cash paid out: $15.00')
  })
  it('supports zero-sale older registers without inventing a closer', () => {
    const data = fixture()
    delete data.record.closedByUid
    delete data.record.closedByName
    data.totals = emptyRegisterTotals(data.record.openingTotalCents)
    expect(registerCloseoutText(data)).toContain('Closed by: Not recorded')
    expect(registerCloseoutText(data)).toContain('Completed transactions: 0')
    expect(registerCloseoutText(data)).toContain('Expected cash: $100.00')
  })
  it('refuses open/unconfirmed registers or inconsistent money instead of producing a misleading report', () => {
    const data = fixture()
    expect(() =>
      registerCloseoutText({ ...data, record: { ...data.record, status: 'open', closedAt: null } }),
    ).toThrow('saved, closed')
    expect(() =>
      registerCloseoutText({ ...data, record: { ...data.record, closingTotalCents: 1 } }),
    ).toThrow('saved, closed')
    expect(() =>
      registerCloseoutText({ ...data, totals: { ...data.totals, expectedCashCents: 12000 } }),
    ).toThrow('could not be verified')
    expect(() =>
      registerCloseoutText({ ...data, totals: { ...data.totals, totalCents: NaN } }),
    ).toThrow('could not be verified')
  })
})
