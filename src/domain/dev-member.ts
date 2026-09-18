import { validateMemberDraft, type MemberDraft } from './member-creation'
import { encodeLegacyMember } from '../data/member-creation-legacy'

export const devMembership = {
  id: 'dev-annual',
  name: 'Development membership',
  durationSeconds: 365 * 86400,
}
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
  if (draft.membershipProductId !== devMembership.id)
    throw new Error('Choose the development membership.')
  return draft
}
export function devMemberRecord(
  draft: MemberDraft,
  uid: string,
  number: number,
  identityKey: string,
  fingerprint: string,
  now = new Date(),
) {
  const legacy = encodeLegacyMember(draft, devMembership, {
    club: 'dev',
    staffName: 'Dev staff',
    now,
    number,
  })
  return {
    ...legacy,
    schemaVersion: 2,
    createdBy: uid,
    productId: devMembership.id,
    identityKey,
    fingerprint,
    searchFirst: normalizeMemberSearch(draft.firstName),
    searchLast: normalizeMemberSearch(draft.lastName),
    searchName: normalizeMemberSearch(`${draft.firstName} ${draft.lastName}`),
    searchId: normalizeGovernmentId(draft.governmentId),
    searchEmail: draft.email.trim().toLowerCase(),
  }
}
