import type { Activity, Member, Product } from '../domain/legacy'
export interface MemberQuery {
  search?: string
  status?: 'all' | 'active' | 'expired' | 'dna'
  offset?: number
  limit?: number
}
export interface Page<T> {
  items: readonly T[]
  total: number
  nextOffset: number | null
}
/** Future live adapters derive access from users/{auth.uid}, never from an editable UI field. */
export interface ClubRepository {
  readonly mode: 'demo'
  readonly clubName: string
  listMembers(query: MemberQuery): Promise<Page<Member>>
  getMember(id: string): Promise<Member | null>
  listActivity(): Promise<readonly Activity[]>
  listProducts(): Promise<readonly Product[]>
}
