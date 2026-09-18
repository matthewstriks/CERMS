import type { Member } from '../domain/legacy'

export type MemberSearchField = 'name' | 'dob' | 'id' | 'number' | 'type'
export interface MembershipQuery {
  search: string
  field: MemberSearchField
  dnaOnly: boolean
  cursor?: string
}
export interface MembershipPage {
  members: readonly Member[]
  nextCursor: string | null
}
export interface MemberVisit {
  id: string
  enteredAt: number | null
  leftAt: number | null
  rental: string
  location: string
}
export interface MemberOrder {
  id: string
  placedAt: number | null
  card: number | null
  giftCard: number | null
  cash: number | null
  total: number | null
}
export interface MembershipHistory {
  visits: readonly MemberVisit[]
  orders: readonly MemberOrder[]
  visitsLimited: boolean
  ordersLimited: boolean
}
export interface MembershipReader {
  readonly uid: string
  readonly club: string
  readonly staffName: string
  list(query: MembershipQuery): Promise<MembershipPage>
  history(memberId: string): Promise<MembershipHistory>
  close(): void
}
