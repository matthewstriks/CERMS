import { validateMemberDraft, type MemberDraft, type MembershipOption } from './member-creation'
import { encodeLegacyMember } from '../data/member-creation-legacy'

export function normalizeMemberSearch(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}
export function normalizeGovernmentId(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase()
}
export async function memberHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export function validateDevMember(input: MemberDraft): MemberDraft {
  const draft = validateMemberDraft(input)
  if (draft.importExisting) throw new Error('Import overrides are not enabled for Dev System.')
  if (!draft.governmentIdType) throw new Error('Choose the issuing state or ID type.')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(draft.membershipProductId))
    throw new Error('Choose an active membership product.')
  return draft
}
export function devMemberRecord(
  draft: MemberDraft,
  uid: string,
  number: number,
  identityKey: string,
  fingerprint: string,
  membership: MembershipOption,
  now = new Date(),
) {
  const legacy = encodeLegacyMember(draft, membership, {
    club: 'dev',
    staffName: 'Dev staff',
    now,
    number,
  })
  return {
    ...legacy,
    schemaVersion: 2,
    createdBy: uid,
    productId: membership.id,
    identityKey,
    fingerprint,
    searchFirst: normalizeMemberSearch(draft.firstName),
    searchLast: normalizeMemberSearch(draft.lastName),
    searchName: normalizeMemberSearch(`${draft.firstName} ${draft.lastName}`),
    searchId: normalizeGovernmentId(draft.governmentId),
    searchEmail: draft.email.trim().toLowerCase(),
  }
}
