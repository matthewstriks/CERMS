import { getFirebaseServices } from './firebase-membership'
import {
  discountEndpoint,
  isDiscountRequest,
  type DiscountRecord,
  type DiscountRule,
  type DiscountQuote,
} from '../shared/discount-policy'
import type { SaleRequest } from '../domain/pos'
export function createDiscounts(reader: { uid: string; club: string }) {
  const { auth } = getFirebaseServices()
  async function call<T>(data: Record<string, unknown>): Promise<T> {
    if (auth.currentUser?.uid !== reader.uid) throw Error('Sign in again to use discounts.')
    const body = JSON.stringify({ data: { business: reader.club, ...data } })
    if (!isDiscountRequest(body)) throw Error('Check the discount settings and selected products.')
    const response = await fetch(discountEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body,
      signal: AbortSignal.timeout(20000),
    })
    const p = await response.json()
    if (!response.ok || p.error)
      throw Error(p.error?.message || 'Discount request was not confirmed. Reload before retrying.')
    return p.result
  }
  return {
    list: (cursor?: string) =>
      call<{ rows: DiscountRecord[]; more: boolean; cursor: string | null }>({
        action: 'list',
        ...(cursor ? { cursor } : {}),
      }),
    save: (rule: DiscountRule, expectedVersion: number) =>
      call({ action: 'save', rule, expectedVersion }),
    archive: (code: string, expectedVersion: number) =>
      call({ action: 'archive', code, expectedVersion }),
    quote: (code: string, lines: SaleRequest['lines'], memberId: string | null) =>
      call<DiscountQuote>({ action: 'quote', code, lines, memberId }),
  }
}
