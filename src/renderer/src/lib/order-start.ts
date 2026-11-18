import { requestNotificationSound } from './notification-audio'
import type { CartLine, OrderMember } from '../../../domain/pos'
import type { MembershipReader } from '../../../data/membership-contracts'
export interface OrderStart {
  member: OrderMember
  cart: CartLine[]
  rentalsOnly?: boolean
  promptMembership?: boolean
  membershipProductId?: string
}
export function startMemberOrder(reader: MembershipReader, order: OrderStart) {
  const key = `cerms.pos.${reader.uid}.${reader.club}`
  const draft = JSON.parse(localStorage.getItem(key) || 'null')
  if (draft?.pending)
    throw new Error('Resolve the pending POS order before starting another order.')
  if (draft?.cart?.length) {
    requestNotificationSound()
    if (!window.confirm('Replace the current unsaved order with this member’s order?')) return false
  }
  localStorage.setItem(
    key,
    JSON.stringify({
      schemaVersion: 1,
      cart: order.cart,
      member: order.member,
      customerName: order.member.name,
      note: '',
      pending: null,
      rentalsOnly: order.rentalsOnly ?? false,
      promptMembership: order.promptMembership === true,
      membershipProductId: order.membershipProductId,
    }),
  )
  window.location.hash = 'sales'
  return true
}
