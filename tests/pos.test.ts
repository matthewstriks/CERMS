import { describe, it, expect } from 'vitest'
import {
  cartTotals,
  receiptText,
  settlePayments,
  paymentAmountDue,
  type SaleReceipt,
} from '../src/domain/pos'
import { productDefaults } from '../src/domain/catalog'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { posEndpoints } from '../src/shared/pos-policy'
import { effectivePermissions } from '../src/domain/staff-permissions'
describe('POS money and access', () => {
  it('calculates integer-cent tax by line with payouts signed consistently', () => {
    const data = { ...productDefaults(), priceCents: 199, taxable: true }
    expect(
      cartTotals(
        [{ product: { id: 'a', version: 1, data }, quantity: 3, unitPriceCents: 199 }],
        725,
      ),
    ).toEqual({ subtotalCents: 597, taxCents: 43, totalCents: 640 })
    expect(
      cartTotals(
        [
          {
            product: { id: 'b', version: 1, data: { ...data, payout: true } },
            quantity: 3,
            unitPriceCents: 199,
          },
        ],
        725,
      ).totalCents,
    ).toBe(-640)
  })
  it('old staff permission records preserve register rights and deny POS until granted', () => {
    const old = {
      editMembers: false,
      deleteMembers: false,
      manageProducts: false,
      openRegisters: true,
      closeRegisters: true,
    }
    expect(effectivePermissions('staff', old)).toEqual({
      ...old,
      removeMemberNotes: false,
      processSales: false,
      waiveProducts: false,
      deleteProducts: false,
      closeOtherRegisters: false,
    })
    expect(effectivePermissions('staff', { ...old, processSales: true }).processSales).toBe(true)
  })
  it('only permits the scoped callable and keeps direct writes to sales blocked', () => {
    const body = JSON.stringify({
      data: {
        business: 'club-a',
        requestId: '10000000-0000-4000-8000-000000000001',
        registerId: '10000000-0000-4000-8000-000000000002',
        taxRateBps: 0,
        customerName: '',
        note: '',
        lines: [{ productId: 'a', version: 1, quantity: 1, unitPriceCents: 100 }],
        payments: [],
      },
    })
    expect(allowFirebaseRequest(posEndpoints.completeSale, 'POST', body)).toBe(true)
    expect(
      allowFirebaseRequest(
        posEndpoints.cashDrop,
        'POST',
        JSON.stringify({
          data: {
            business: 'club-a',
            requestId: '10000000-0000-4000-8000-000000000001',
            registerId: '10000000-0000-4000-8000-000000000002',
            amountCents: 2500,
            note: 'Safe drop',
          },
        }),
      ),
    ).toBe(true)
    expect(allowFirebaseRequest(posEndpoints.completeSale + '?extra=1', 'POST', body)).toBe(false)
    expect(
      allowFirebaseRequest(
        'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
        'POST',
        JSON.stringify({
          writes: [
            {
              update: {
                name: 'projects/cerms-7af24/databases/cerms/documents/system/club-a/sales/a',
                fields: {},
              },
            },
          ],
        }),
      ),
    ).toBe(false)
  })
  it('receipt describes cash received and change separately from card amount', () => {
    const r = {
      id: 'abc',
      cashierUid: 'staff',
      business: 'club',
      receiptName: 'Club',
      receiptAddress: '',
      receiptFooter: 'Thanks',
      createdAt: 1,
      receiptNumber: 'abc',
      registerId: 'r',
      cashierName: 'Staff',
      customerName: '',
      note: '',
      lines: [],
      taxRateBps: 0,
      subtotalCents: 1500,
      taxCents: 0,
      totalCents: 1500,
      payments: [
        {
          method: 'cash',
          amountCents: 500,
          receivedCents: 1000,
          reference: '',
          direction: 'in',
          changeCents: 500,
        },
        {
          method: 'card',
          amountCents: 1000,
          receivedCents: 1000,
          reference: 'external-1',
          direction: 'in',
          changeCents: 0,
        },
      ],
    } as SaleReceipt
    expect(receiptText(r)).toContain('Cash received: $10.00')
    expect(receiptText(r)).toContain('Change: $5.00')
    expect(receiptText(r)).toContain('Card paid: $10.00')
  })
})

describe('simple payment amounts', () => {
  it('applies cash after noncash and records the excess as change regardless of row order', () => {
    const entries = [
      { method: 'cash' as const, amount: '20.00' },
      { method: 'card' as const, amount: '11.60' },
    ]
    const settled = settlePayments(2160, entries)
    expect(settled.remainingCents).toBe(0)
    expect(settled.changeCents).toBe(1000)
    expect(settled.payments[0]).toEqual({
      method: 'cash',
      amountCents: 1000,
      receivedCents: 2000,
      reference: '',
    })
    expect(settlePayments(2160, [...entries].reverse()).changeCents).toBe(1000)
    expect(
      paymentAmountDue(
        2160,
        [
          { method: 'cash', amount: '10.00' },
          { method: 'card', amount: '1.00' },
        ],
        1,
      ),
    ).toBe(1160)
    expect(paymentAmountDue(2160, [{ method: 'cash', amount: '1.00' }], 0)).toBe(2160)
  })
  it('shows the remaining amount for partial payments and rejects noncash overpayment or excess payouts', () => {
    expect(settlePayments(2160, [{ method: 'card', amount: '10.00' }]).remainingCents).toBe(1160)
    expect(() => settlePayments(2160, [{ method: 'card', amount: '30.00' }])).toThrow('exceed')
    expect(() => settlePayments(-2160, [{ method: 'cash', amount: '30.00' }])).toThrow(
      'cannot exceed',
    )
    expect(() =>
      settlePayments(2160, [
        { method: 'cash', amount: '10.00' },
        { method: 'cash', amount: '11.60' },
      ]),
    ).toThrow('one cash')
    expect(settlePayments(0, []).remainingCents).toBe(0)
    expect(() => settlePayments(2160, [{ method: 'cash', amount: '' }])).toThrow()
  })
})

describe('group order requests and receipts', () => {
  it('permits bounded pending-membership and recipient assignments through the existing callable only', () => {
    const data = {
      business: 'dev',
      requestId: '10000000-0000-4000-8000-000000000001',
      registerId: '10000000-0000-4000-8000-000000000002',
      taxRateBps: 0,
      customerName: '',
      note: '',
      member: { id: 'buyer', name: 'Existing buyer' },
      pendingMembers: [
        {
          id: '10000000-0000-4000-8000-000000000003',
          name: 'Pending guest',
          draft: { membershipProductId: 'plan' },
        },
      ],
      lines: [{ productId: 'plan', version: 1, quantity: 1, unitPriceCents: 100 }],
      payments: [],
      rentals: [
        {
          id: '10000000-0000-4000-8000-000000000004',
          productId: 'room',
          memberId: 'friend',
          assignedRoom: 'A-1',
        },
      ],
    }
    const allowed = (request: unknown) =>
      allowFirebaseRequest(posEndpoints.completeSale, 'POST', JSON.stringify({ data: request }))
    expect(allowed(data)).toBe(true)
    expect(allowed({ ...data, pendingMembers: Array(21).fill(data.pendingMembers[0]) })).toBe(false)
    expect(allowed({ ...data, rentals: [{ ...data.rentals[0], memberId: '../foreign' }] })).toBe(
      false,
    )
    expect(
      allowed({ ...data, pendingMembers: [{ ...data.pendingMembers[0], id: 'invalid' }] }),
    ).toBe(false)
  })
  it('prints each membership and rental recipient for repeated product units', () => {
    const receipt = {
      receiptName: 'Club',
      receiptAddress: '',
      receiptFooter: '',
      createdAt: 1,
      receiptNumber: 'sale',
      registerId: 'register',
      cashierName: 'Cashier',
      customerName: 'Buyer',
      member: { id: 'buyer', name: 'Buyer', number: '1' },
      members: [
        { id: 'new-a', name: 'Guest A', number: '2' },
        { id: 'friend', name: 'Friend B', number: '3' },
      ],
      memberships: [{ productId: 'plan', memberId: 'new-a' }],
      rentals: [
        { id: 'r1', productId: 'room', memberId: 'new-a', assignedRoom: 'A-1' },
        { id: 'r2', productId: 'room', memberId: 'friend', assignedRoom: 'B-2' },
      ],
      lines: [
        { productId: 'plan', name: 'Plan', quantity: 1, unitPriceCents: 100, subtotalCents: 100 },
        { productId: 'room', name: 'Room', quantity: 2, unitPriceCents: 100, subtotalCents: 200 },
      ],
      payments: [],
      subtotalCents: 300,
      totalCents: 300,
      taxCents: 0,
      taxRateBps: 0,
      note: '',
    } as unknown as SaleReceipt
    const printed = receiptText(receipt)
    expect(printed).toContain('Membership for: Guest A')
    expect(printed).toContain('Assigned to: Guest A')
    expect(printed).toContain('Assigned to: Friend B')
    expect(printed).toContain('Assigned Room/Number: B-2')
  })
})

it('allows only the bounded rental edit endpoint and valid renewal visit identifiers through the request guard', () => {
  const edit = {
    business: 'dev',
    visitId: 'sale_unit',
    expectedRevision: 0,
    assignedRoom: 'A-1',
    notes: '',
    inside: false,
    waiting: true,
  }
  const allowed = (d: unknown) =>
    allowFirebaseRequest(posEndpoints.updateRental, 'POST', JSON.stringify({ data: d }))
  expect(allowed(edit)).toBe(true)
  expect(allowed({ ...edit, expiresAt: 9999999999 })).toBe(false)
  expect(allowed({ ...edit, expectedRevision: -1 })).toBe(false)
  expect(allowed({ ...edit, visitId: '../foreign' })).toBe(false)
  expect(allowed({ ...edit, inside: 'true' })).toBe(false)
})

it('requires both completion confirmations and bounded checkout details through the request guard', () => {
  const d = {
    business: 'dev',
    visitId: 'visit_1',
    expectedRevision: 0,
    expectedExpiresAt: 1800000000,
    rentalCompleted: true,
    itemsReturned: true,
  }
  const allowed = (data: unknown) =>
    allowFirebaseRequest(posEndpoints.checkOutRental, 'POST', JSON.stringify({ data }))
  expect(allowed(d)).toBe(true)
  for (const bad of [
    { itemsReturned: false },
    { rentalCompleted: false },
    { itemsReturned: 'true' },
    { expectedRevision: -1 },
    { expectedExpiresAt: null },
    { visitId: '../x' },
    { active: false },
  ])
    expect(allowed({ ...d, ...bad })).toBe(false)
})
