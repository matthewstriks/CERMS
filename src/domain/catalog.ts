export const durationUnits = {
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2628000,
  year: 31540000,
} as const
export type DurationUnit = keyof typeof durationUnits
export interface CatalogProduct {
  name: string
  desc: string
  cat: string
  barcode: string
  priceCents: number
  inventory: number | null
  inventoryPar: number | null
  invWarning: number | null
  favorite: boolean
  taxable: boolean
  active: boolean
  core: boolean
  rental: boolean
  membership: boolean
  restricted: boolean
  payout: boolean
  askforprice: boolean
  rentalLengthRaw: number
  rentalLengthType: DurationUnit
  membershipLengthRaw: number
  membershipLengthType: DurationUnit
  restrictedUsers: string[]
}
export interface CatalogCategory {
  name: string
  desc: string
  color: string
}
export interface CatalogRecord<T> {
  id: string
  version: number
  data: T
}
export const productDefaults = (): CatalogProduct => ({
  name: '',
  desc: '',
  cat: '',
  barcode: '',
  priceCents: 0,
  inventory: null,
  inventoryPar: null,
  invWarning: null,
  favorite: false,
  taxable: false,
  active: true,
  core: false,
  rental: false,
  membership: false,
  restricted: false,
  payout: false,
  askforprice: false,
  rentalLengthRaw: 1,
  rentalLengthType: 'hour',
  membershipLengthRaw: 1,
  membershipLengthType: 'year',
  restrictedUsers: [],
})
export function parsePrice(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter a price from 0 to 9,999,999.99 with at most two decimal places.')
  const [whole, fraction = ''] = value.trim().split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
function text(value: unknown, max: number, required = false): value is string {
  return typeof value === 'string' && value.length <= max && (!required || !!value.trim())
}
export function validCategory(value: unknown): value is CatalogCategory {
  const d = value as CatalogCategory
  return (
    !!d &&
    Object.keys(d).sort().join() === 'color,desc,name' &&
    text(d.name, 200, true) &&
    text(d.desc, 4000) &&
    /^#[0-9a-fA-F]{6}$/.test(d.color)
  )
}
export function validProduct(value: unknown): value is CatalogProduct {
  const d = value as CatalogProduct
  if (!d || Object.keys(d).sort().join() !== Object.keys(productDefaults()).sort().join())
    return false
  if (
    !text(d.name, 200, true) ||
    !text(d.desc, 4000) ||
    !text(d.cat, 128, true) ||
    !/^[a-zA-Z0-9_-]+$/.test(d.cat) ||
    !text(d.barcode, 200) ||
    !Number.isSafeInteger(d.priceCents) ||
    d.priceCents < 0 ||
    d.priceCents > 999999999
  )
    return false
  for (const k of ['inventory', 'inventoryPar', 'invWarning'] as const)
    if (d[k] !== null && (!Number.isSafeInteger(d[k]) || d[k]! < 0 || d[k]! > 1000000000))
      return false
  for (const k of [
    'favorite',
    'taxable',
    'active',
    'core',
    'rental',
    'membership',
    'restricted',
    'payout',
    'askforprice',
  ] as const)
    if (typeof d[k] !== 'boolean') return false
  if (d.askforprice && d.priceCents !== 0) return false
  for (const kind of ['rental', 'membership'] as const) {
    const count = d[`${kind}LengthRaw`],
      unit = d[`${kind}LengthType`]
    if (
      !Object.hasOwn(durationUnits, unit) ||
      !Number.isFinite(count) ||
      count <= 0 ||
      count > 1000
    )
      return false
  }
  return (
    Array.isArray(d.restrictedUsers) &&
    d.restrictedUsers.length <= 100 &&
    new Set(d.restrictedUsers).size === d.restrictedUsers.length &&
    d.restrictedUsers.every(
      (uid) => typeof uid === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(uid),
    ) &&
    (d.restricted ? d.restrictedUsers.length > 0 : d.restrictedUsers.length === 0)
  )
}
