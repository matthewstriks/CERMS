export const membershipProduct = () => ({
  name: 'Fixture Monthly',
  desc: '',
  cat: 'memberships',
  barcode: '',
  priceCents: 2500,
  inventory: null,
  inventoryPar: null,
  invWarning: null,
  favorite: false,
  taxable: false,
  active: true,
  core: false,
  rental: false,
  membership: true,
  restricted: false,
  payout: false,
  askforprice: false,
  rentalLengthRaw: 1,
  rentalLengthType: 'hour',
  membershipLengthRaw: 30,
  membershipLengthType: 'day',
  restrictedUsers: [],
  version: 1,
})
export function catalogFields(data) {
  const encode = (value) =>
    value === null
      ? { nullValue: null }
      : typeof value === 'string'
        ? { stringValue: value }
        : typeof value === 'boolean'
          ? { booleanValue: value }
          : typeof value === 'number'
            ? Number.isInteger(value)
              ? { integerValue: String(value) }
              : { doubleValue: value }
            : { arrayValue: { values: value.map(encode) } }
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]))
}
