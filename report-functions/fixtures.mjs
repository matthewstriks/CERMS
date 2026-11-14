import { Timestamp } from 'firebase-admin/firestore'
import { reportWindow } from './report-data.mjs'
export function fixtureData() {
  const window = reportWindow('2026-11-14T13:00:00Z')
  const ts = (iso) => Timestamp.fromDate(new Date(iso))
  const zeros = () =>
    Object.fromEntries(
      [
        'bill100',
        'bill50',
        'bill20',
        'bill10',
        'bill5',
        'bill2',
        'bill1',
        'coin100',
        'coin50',
        'coin25',
        'coin10',
        'coin5',
        'coin1',
      ].map((k) => [k, 0]),
    )
  const sale = {
    id: 'sale-1',
    receiptNumber: 'sale-1',
    business: 'dev',
    status: 'completed',
    registerId: 'reg-1',
    cashierUid: 'cashier-1',
    cashierName: 'A/B: Cashier',
    customerName: 'Synthetic Member',
    createdAt: ts('2026-11-13T18:00:00Z'),
    subtotalCents: 2000,
    taxCents: 160,
    totalCents: 2160,
    lines: [
      {
        productId: 'snack',
        categoryId: 'snacks',
        name: '=Synthetic snack <item>',
        quantity: 2,
        unitPriceCents: 1000,
        subtotalCents: 2000,
        taxCents: 160,
        totalCents: 2160,
        membership: false,
        rental: false,
        payout: false,
      },
    ],
    payments: [
      {
        method: 'cash',
        direction: 'in',
        amountCents: 1000,
        receivedCents: 2000,
        changeCents: 1000,
        reference: '',
      },
      {
        method: 'card',
        direction: 'in',
        amountCents: 1160,
        receivedCents: 1160,
        changeCents: 0,
        reference: 'External #1',
      },
    ],
    note: '=Literal user note',
    members: [{ id: 'member-1', name: 'Synthetic Member', number: 123456789 }],
    rentals: [
      { id: 'rental-1', productId: 'rental', memberId: 'member-1', assignedRoom: 'Room 7' },
    ],
    memberships: [{ productId: 'membership', memberId: 'member-1' }],
  }
  const register = {
    id: 'reg-1',
    status: 'closed',
    ownerUid: 'cashier-1',
    ownerName: 'A/B: Cashier',
    openedAt: ts('2026-11-12T22:00:00Z'),
    closedAt: ts('2026-11-13T23:00:00Z'),
    closedByUid: 'manager',
    closedByName: 'Manager',
    openingCounts: { ...zeros(), bill20: 5 },
    openingTotalCents: 10000,
    closingCounts: { ...zeros(), bill20: 5, bill10: 1, bill1: 2 },
    closingTotalCents: 11200,
    closeNote: 'Synthetic register note <safe>',
  }
  return {
    window,
    name: 'Dev System <Preview>',
    address: '123 Synthetic Street',
    sales: [sale],
    registers: [register],
    openRegisters: [],
    categories: [{ id: 'snacks', name: 'Beverages' }],
    products: [{ id: 'snack', name: 'Renamed product — must not replace snapshot', cat: 'snacks' }],
    totals: new Map([
      [
        'reg-1',
        {
          saleCount: 3,
          totalCents: 5000,
          taxCents: 300,
          expectedCashCents: 11000,
          netByMethod: { cash: 1000, card: 4000, giftCard: 0, check: 0, other: 0 },
          cashReceivedCents: 2000,
          changeGivenCents: 1000,
          cashPaidOutCents: 0,
        },
      ],
    ]),
  }
}
