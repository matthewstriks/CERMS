import { ageOn, idTypes, suffixes } from './member-creation'
import { normalizePhone } from './phone'
import { normalizeGovernmentId, normalizeMemberSearch } from './dev-member'

export interface MemberEditDraft {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthDate: string
  governmentId: string
  governmentIdType: string
  email: string
  phone: string
  expiresAt: number
  dna: boolean
  tagged: boolean
  productId: string
}
export function validateMemberEdit(input: MemberEditDraft): MemberEditDraft {
  const draft = { ...input }
  for (const key of [
    'firstName',
    'middleName',
    'lastName',
    'suffix',
    'birthDate',
    'governmentId',
    'governmentIdType',
    'email',
    'phone',
    'productId',
  ] as const)
    draft[key] = draft[key].trim()
  if (!draft.firstName || !draft.lastName || !draft.governmentId)
    throw new Error('First name, last name and ID number are required.')
  if (
    [draft.firstName, draft.middleName, draft.lastName, draft.governmentId].some(
      (value) => value.length > 200,
    )
  )
    throw new Error('Names and ID number must be 200 characters or fewer.')
  if (ageOn(draft.birthDate) < 18 || ageOn(draft.birthDate) > 125)
    throw new Error('Check the date of birth; members must be at least 18.')
  if (
    !suffixes.includes(draft.suffix as (typeof suffixes)[number]) ||
    !idTypes.some((type) => type.value === draft.governmentIdType)
  )
    throw new Error('Choose a valid suffix and issuing state or ID type.')
  if (draft.email.length > 320 || (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)))
    throw new Error('Enter a valid email address.')
  if (
    !Number.isSafeInteger(draft.expiresAt) ||
    draft.expiresAt < 0 ||
    draft.expiresAt > 253402300799
  )
    throw new Error('Enter a valid membership expiration.')
  if (
    typeof draft.dna !== 'boolean' ||
    typeof draft.tagged !== 'boolean' ||
    (draft.productId && !/^[a-zA-Z0-9_-]{1,128}$/.test(draft.productId))
  )
    throw new Error('Check membership details.')
  draft.phone = normalizePhone(draft.phone)
  return draft
}
export function memberEditFields(input: MemberEditDraft, membershipName: string, actorUid: string) {
  const d = validateMemberEdit(input)
  if (!membershipName.trim() || membershipName.length > 200)
    throw new Error('Choose a valid membership type.')
  return {
    fname: d.firstName,
    mname: d.middleName,
    lname: d.lastName,
    suffix: d.suffix,
    name: `${d.firstName} ${d.lastName}`,
    dob: d.birthDate,
    idnum: d.governmentId,
    idstate: d.governmentIdType,
    email: d.email,
    phone: d.phone,
    membership_type: membershipName,
    id_expiration: d.expiresAt,
    dna: d.dna,
    tag: d.tagged,
    searchFirst: normalizeMemberSearch(d.firstName),
    searchLast: normalizeMemberSearch(d.lastName),
    searchName: normalizeMemberSearch(`${d.firstName} ${d.lastName}`),
    searchId: normalizeGovernmentId(d.governmentId),
    searchEmail: d.email.toLowerCase(),
    updatedBy: actorUid,
    ...(d.productId ? { productId: d.productId } : {}),
  }
}
