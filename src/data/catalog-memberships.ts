import type { MembershipOption } from '../domain/member-creation'
import { durationUnits, type CatalogProduct } from '../domain/catalog'
import type { CatalogClient } from './firebase-catalog'

export function catalogMembershipOption(
  id: string,
  data: CatalogProduct,
  uid: string,
): MembershipOption | null {
  if (!data.active || !data.membership || (data.restricted && !data.restrictedUsers.includes(uid)))
    return null
  return {
    id,
    name: data.name,
    durationSeconds: Math.max(
      1,
      Math.floor(data.membershipLengthRaw * durationUnits[data.membershipLengthType]),
    ),
    durationLabel: `${data.membershipLengthRaw} ${data.membershipLengthType}${data.membershipLengthRaw === 1 ? '' : 's'}`,
  }
}

export async function catalogMembershipOptions(
  catalog: Pick<CatalogClient, 'products'>,
  uid: string,
): Promise<MembershipOption[]> {
  const options: MembershipOption[] = []
  for (let page = 0; page < 100; page++) {
    const result = await catalog.products(page === 0)
    for (const { id, data } of result.rows) {
      const option = catalogMembershipOption(id, data, uid)
      if (option) options.push(option)
    }
    if (!result.more) return options
  }
  throw new Error(
    'The catalog is too large to load membership choices. Contact your administrator.',
  )
}
