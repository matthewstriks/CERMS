import { canCreateDevMember } from '../shared/dev-member-policy'
import type { MemberCreator } from '../domain/member-creation'
import { createCatalog } from './firebase-catalog'
import { catalogMembershipOptions } from './catalog-memberships'
/** Desktop creation is fulfilled only by completeSale; this adapter lists choices. */
export function createDevMemberCreator(uid: string, club: string): MemberCreator {
  if (!canCreateDevMember(uid, club))
    throw new Error('Member creation is owner-only in Dev System.')
  return {
    options: () => catalogMembershipOptions(createCatalog({ uid, club }), uid),
    async create() {
      throw new Error('Complete the linked checkout to create this member.')
    },
  }
}
