import { expect, it } from 'vitest'
import { membershipRenewalExpiry, membershipRenewalPreview } from '../src/domain/membership-renewal'
import { durationUnits } from '../src/domain/catalog'
import { isPosRequest, posEndpoints } from '../src/shared/pos-policy'
const now = Date.UTC(2026, 10, 14)
it('previews active membership choices with remaining time and all same-member units', () => {
  const current = now + 5 * 86400000
  const preview = membershipRenewalPreview(current, 30 * 86400, now, 2)
  expect(preview).toMatchObject({
    active: true,
    remainingMillis: 5 * 86400000,
    restartExpiresAt: now + 60 * 86400000,
    extendExpiresAt: now + 65 * 86400000,
    units: 2,
  })
})
it('expired, exactly-expiring and missing dates always preview a fresh duration from now', () => {
  for (const expiry of [now - 86400000, now, null]) {
    const preview = membershipRenewalPreview(expiry, 86400, now)
    expect(preview.active).toBe(false)
    expect(preview.remainingMillis).toBe(0)
    expect(preview.restartExpiresAt).toBe(now + 86400000)
    expect(preview.extendExpiresAt).toBe(preview.restartExpiresAt)
  }
})
it('uses configured hours/days/weeks/months/years with distinct restart and extension semantics', () => {
  for (const seconds of Object.values(durationUnits)) {
    expect(membershipRenewalExpiry(now / 1000 + 1000, seconds, 'restart', now)).toBe(
      now / 1000 + seconds,
    )
    expect(membershipRenewalExpiry(now / 1000 + 1000, seconds, 'extend', now)).toBe(
      now / 1000 + 1000 + seconds,
    )
    expect(membershipRenewalExpiry(now / 1000 - 1000, seconds, 'extend', now)).toBe(
      now / 1000 + seconds,
    )
  }
  expect(() => membershipRenewalExpiry(null, 86400, 'extend', now)).toThrow('Start from today')
  expect(membershipRenewalExpiry(null, 86400, 'restart', now)).toBe(now / 1000 + 86400)
})
it('permits bounded membership assignments only through checkout and preserves old request shapes', () => {
  const data = {
    business: 'dev',
    requestId: '10000000-0000-4000-8000-000000000001',
    registerId: '20000000-0000-4000-8000-000000000001',
    taxRateBps: 0,
    customerName: '',
    note: '',
    lines: [{ productId: 'plan', version: 1, quantity: 1, unitPriceCents: 100 }],
    payments: [],
  }
  const allowed = (d: unknown) =>
    isPosRequest(posEndpoints.completeSale, JSON.stringify({ data: d }))
  const assignment = {
    id: '30000000-0000-4000-8000-000000000001',
    productId: 'plan',
    memberId: 'member',
    mode: 'extend',
  }
  expect(allowed(data)).toBe(true)
  expect(allowed({ ...data, membershipAssignments: [assignment] })).toBe(true)
  for (const bad of [
    { ...assignment, memberId: '../foreign' },
    { ...assignment, mode: 'invalid' },
    { ...assignment, expiresAt: 99999999 },
  ])
    expect(allowed({ ...data, membershipAssignments: [bad] })).toBe(false)
  expect(allowed({ ...data, membershipAssignments: Array(101).fill(assignment) })).toBe(false)
})
