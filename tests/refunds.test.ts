import { expect, it } from 'vitest'
import { refundLineAmounts, refundEndpoint } from '../src/shared/refund-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { effectivePermissions, ownerUid } from '../src/domain/staff-permissions'
it('partial quantities recover exact original cents including the last rounded tax cent', () => {
  const line = { quantity: 3, subtotalCents: 99, taxCents: 8 }
  const parts = [0, 1, 2].map((q) => refundLineAmounts(line, q, 1))
  expect(parts.map((p) => p.taxCents)).toEqual([3, 2, 3])
  expect(parts.reduce((sum, p) => sum + p.totalCents, 0)).toBe(107)
  expect(() => refundLineAmounts(line, 2, 2)).toThrow()
  expect(effectivePermissions('staff').processRefunds).toBe(false)
  expect(effectivePermissions(ownerUid).processRefunds).toBe(true)
})
it('allows only scoped refund payloads', () => {
  expect(
    allowFirebaseRequest(
      refundEndpoint,
      'POST',
      JSON.stringify({
        data: { action: 'quote', business: 'dev', saleId: '10000000-0000-4000-8000-000000000001' },
      }),
    ),
  ).toBe(true)
  expect(
    allowFirebaseRequest(
      refundEndpoint,
      'POST',
      JSON.stringify({
        data: {
          action: 'quote',
          business: 'dev',
          saleId: '10000000-0000-4000-8000-000000000001',
          totalCents: 100,
        },
      }),
    ),
  ).toBe(false)
})
