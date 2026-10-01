import { expect, it, vi } from 'vitest'
import { catalogMembershipOptions } from '../src/data/catalog-memberships'
import { productDefaults, type CatalogProduct } from '../src/domain/catalog'

const product = (id: string, fields: Partial<CatalogProduct> = {}) => ({
  id,
  version: 1,
  data: { ...productDefaults(), name: id, membership: true, ...fields },
})

it('loads later pages, filters membership visibility, and returns selectable product IDs', async () => {
  const products = vi
    .fn()
    .mockResolvedValueOnce({
      rows: [
        product('inactive', { active: false }),
        product('retail', { membership: false }),
        product('private', { restricted: true, restrictedUsers: ['other-staff'] }),
      ],
      more: true,
    })
    .mockResolvedValueOnce({
      rows: [
        product('dev-annual', { membershipLengthRaw: 3, membershipLengthType: 'month' }),
        product('staff-plan', { restricted: true, restrictedUsers: ['staff'] }),
      ],
      more: false,
    })
  const options = await catalogMembershipOptions({ products }, 'staff')
  expect(products.mock.calls).toEqual([[true], [false]])
  expect(options.map((option) => option.id)).toEqual(['dev-annual', 'staff-plan'])
  expect(options[0]).toMatchObject({
    durationSeconds: 3 * 2628000,
    durationLabel: '3 months',
  })
})

it('returns no fallback for an empty catalog and propagates read failures', async () => {
  expect(
    await catalogMembershipOptions(
      { products: vi.fn().mockResolvedValue({ rows: [], more: false }) },
      'staff',
    ),
  ).toEqual([])
  await expect(
    catalogMembershipOptions(
      { products: vi.fn().mockRejectedValue(new Error('Read denied')) },
      'staff',
    ),
  ).rejects.toThrow('Read denied')
})
