import { describe, it, expect } from 'vitest'
import { cartTotals, receiptText, type SaleReceipt } from '../src/domain/pos'
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
      processSales: false,
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
