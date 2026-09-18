import { describe, expect, it } from 'vitest'
import {
  parsePrice,
  productDefaults,
  validCategory,
  validProduct,
  durationUnits,
} from '../src/domain/catalog'
import { canManageCatalog, catalogCommit, isCatalogCommit } from '../src/shared/catalog-policy'
import { devCreatorUid } from '../src/shared/dev-member-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
const data = () => ({ ...productDefaults(), name: 'Synthetic product', cat: 'category' })
const commit = () => catalogCommit('dev', 'products', 'test-product', data(), 1, devCreatorUid)
it('parses money exactly and preserves blank versus zero inventory', () => {
  expect(parsePrice('0.29')).toBe(29)
  expect(parsePrice('100.01')).toBe(10001)
  for (const value of ['', '-1', '1.234', '1e3', 'Infinity'])
    expect(() => parsePrice(value)).toThrow()
  expect(validProduct({ ...data(), inventory: 0 })).toBe(true)
  expect(validProduct({ ...data(), inventory: null })).toBe(true)
  expect(durationUnits.month).toBe(2628000)
})
it('validates dependent product options and category colors', () => {
  expect(validCategory({ name: 'Retail', desc: '', color: '#abcdef' })).toBe(true)
  expect(validCategory({ name: ' ', desc: '', color: 'red' })).toBe(false)
  expect(validProduct({ ...data(), askforprice: true, priceCents: 100 })).toBe(false)
  expect(validProduct({ ...data(), restricted: true })).toBe(false)
  expect(validProduct({ ...data(), restricted: true, restrictedUsers: ['staff'] })).toBe(true)
  expect(validProduct({ ...data(), rental: true, rentalLengthRaw: 0 })).toBe(false)
  expect(validProduct({ ...data(), inventory: -1 })).toBe(false)
})
it('gates temporary admin access without assuming employee ranks', () => {
  expect(canManageCatalog(devCreatorUid, 'TheZSATX')).toBe(true)
  expect(canManageCatalog('staff', 'TheZSATX', 1)).toBe(false)
})
describe('catalog network guard', () => {
  it('allows typed catalog writes only in cerms', () => {
    const body = JSON.stringify(commit())
    expect(isCatalogCommit(body)).toBe(true)
    expect(
      isCatalogCommit(
        JSON.stringify(catalogCommit('TheZSATX', 'products', 'p', data(), 2, devCreatorUid)),
      ),
    ).toBe(true)
    const url =
      'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit'
    expect(allowFirebaseRequest(url, 'POST', body)).toBe(true)
    expect(allowFirebaseRequest(url.replace('/cerms/', '/(default)/'), 'POST', body)).toBe(false)
  })
  it.each([
    (p: any) => (p.writes[0].update.fields.priceCents = { doubleValue: 1.1 }),
    (p: any) => (p.writes[0].update.fields.active = { stringValue: 'true' }),
    (p: any) => (p.writes[0].update.fields.updatedBy = { stringValue: 'staff' }),
    (p: any) => (p.writes[0].update.fields.extra = { stringValue: 'bad' }),
    (p: any) => (p.writes[0].currentDocument.exists = true),
    (p: any) => (p.writes[0].updateTransforms[0].fieldPath = 'creation_time'),
    (p: any) =>
      (p.writes[0].update.name = p.writes[0].update.name.replace(
        'system/dev/products',
        'products',
      )),
    (p: any) => p.writes.push(p.writes[0]),
  ])('rejects an expanded or malformed write', (mutate) => {
    const p = commit()
    mutate(p)
    expect(isCatalogCommit(JSON.stringify(p))).toBe(false)
  })
})
