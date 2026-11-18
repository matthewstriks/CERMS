import { expect, it } from 'vitest'
import {
  priceDiscount,
  validDiscountRule,
  discountEndpoint,
  isDiscountRequest,
  type DiscountRule,
} from '../src/shared/discount-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { effectivePermissions, ownerUid } from '../src/domain/staff-permissions'
const rule = (): DiscountRule => ({
  code: 'SAVE10',
  name: 'Save ten',
  description: '',
  kind: 'percent',
  value: 1000,
  active: true,
  productIds: [],
  categoryIds: [],
  productKinds: [],
  startsAt: null,
  endsAt: null,
  minimumCents: 0,
  maxDiscountCents: null,
  maxUses: null,
  maxUsesPerMember: null,
})
const line = (productId: string, unitPriceCents: number) => ({
  productId,
  quantity: 1,
  unitPriceCents,
  categoryId: 'snacks',
  kind: 'retail' as const,
  payout: false,
})
it('prices percentages and capped fixed amounts across only eligible items with exact-cent allocation', () => {
  const r = rule()
  expect(priceDiscount(r, [line('a', 1000), line('b', 500)], 0)).toEqual({
    discountCents: 150,
    lineDiscounts: [100, 50],
  })
  r.kind = 'amount'
  r.value = 100
  expect(priceDiscount(r, [line('a', 100), line('b', 100), line('c', 100)], 0)).toEqual({
    discountCents: 100,
    lineDiscounts: [34, 33, 33],
  })
  r.value = 1000
  expect(priceDiscount(r, [line('a', 100)], 0).discountCents).toBe(100)
  r.kind = 'percent'
  r.value = 5000
  r.maxDiscountCents = 50
  r.productIds = ['a']
  expect(priceDiscount(r, [line('a', 500), line('b', 500)], 0)).toEqual({
    discountCents: 50,
    lineDiscounts: [50, 0],
  })
})
it('honors category/type selection, minimums, dates, waived lines and payout exclusion', () => {
  const r = rule()
  r.categoryIds = ['snacks']
  r.productKinds = ['retail']
  expect(
    priceDiscount(r, [line('a', 100), { ...line('b', 100), kind: 'rental' }], 10).lineDiscounts,
  ).toEqual([10, 0])
  r.minimumCents = 200
  expect(() => priceDiscount(r, [line('a', 100)], 10)).toThrow(/minimum/)
  r.minimumCents = 0
  r.startsAt = 20
  expect(() => priceDiscount(r, [line('a', 100)], 10)).toThrow(/started/)
  r.startsAt = null
  r.endsAt = 10
  expect(() => priceDiscount(r, [line('a', 100)], 10)).toThrow(/expired/)
  r.endsAt = null
  expect(() => priceDiscount(r, [{ ...line('a', 100), waived: true }], 10)).toThrow(/eligible/)
  expect(() => priceDiscount(r, [{ ...line('a', 100), payout: true }], 10)).toThrow(/payout/)
})
it('keeps management default-off and rejects client-forged counters or stacked codes', () => {
  expect(effectivePermissions('staff').manageDiscountCodes).toBe(false)
  expect(effectivePermissions(ownerUid).manageDiscountCodes).toBe(true)
  const data = { action: 'save', business: 'dev', rule: rule(), expectedVersion: 0 }
  expect(isDiscountRequest(JSON.stringify({ data }))).toBe(true)
  expect(allowFirebaseRequest(discountEndpoint, 'POST', JSON.stringify({ data }))).toBe(true)
  expect(isDiscountRequest(JSON.stringify({ data: { ...data, usedCount: 0 } }))).toBe(false)
  expect(validDiscountRule({ ...rule(), kind: 'percent', value: 10001 })).toBe(false)
})
