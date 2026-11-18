import { idTypes, type MemberDraft } from './member-creation'
import type { Member } from './legacy'

export type MemberIdentity = Pick<
  MemberDraft,
  'firstName' | 'middleName' | 'lastName' | 'birthDate' | 'governmentId' | 'governmentIdType'
>
export interface MemberDuplicate {
  member: Member
  reasons: string[]
  score: number
}
const normalized = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
function date(value: string) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!iso && !us) return ''
  return iso
    ? `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`
    : `${us![3]}-${us![1]!.padStart(2, '0')}-${us![2]!.padStart(2, '0')}`
}
function state(value: string) {
  const n = normalized(value)
  return normalized(idTypes.find((type) => normalized(type.label) === n)?.value ?? value)
}
/** One typo or adjacent transposition, only for names with at least four letters. */
function near(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false
  if (a.length > b.length) return near(b, a)
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  if (a.length < b.length) return a.slice(i) === b.slice(i + 1)
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  )
}
export function memberDuplicate(input: MemberIdentity, member: Member): MemberDuplicate | null {
  const first = normalized(input.firstName),
    last = normalized(input.lastName)
  const parts = member.name.trim().split(/\s+/)
  const memberFirst = normalized(member.firstName || parts[0] || '')
  const memberLast = normalized(member.lastName || parts.at(-1) || '')
  const middle = normalized(input.middleName)
  const memberMiddle = normalized(
    member.middleName ?? (parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
  )
  const middleCompatible =
    !middle ||
    !memberMiddle ||
    middle === memberMiddle ||
    (Math.min(middle.length, memberMiddle.length) === 1 && middle[0] === memberMiddle[0])
  const sameFirst = !!first && first === memberFirst
  const sameLast = !!last && last === memberLast
  const sameName = sameFirst && sameLast && middleCompatible
  const sameDob = !!date(input.birthDate) && date(input.birthDate) === date(member.dob)
  const sameId =
    !!normalized(input.governmentId) &&
    normalized(input.governmentId) === normalized(member.governmentId)
  const sameState =
    !!state(input.governmentIdType) &&
    state(input.governmentIdType) === state(member.governmentIdState)
  const similarName = (near(first, memberFirst) && near(last, memberLast)) || sameFirst || sameLast
  if (!(sameId && (sameState || sameDob || sameName)) && !sameName && !(sameDob && similarName))
    return null
  const reasons: string[] = []
  if (sameId) reasons.push(sameState ? 'ID state and number' : 'ID number')
  if (sameName) reasons.push('Name')
  else if (sameDob && similarName) reasons.push('Similar name')
  if (sameDob) reasons.push('Date of birth')
  return {
    member,
    reasons,
    score: (sameId && sameState ? 100 : sameId ? 70 : 0) + (sameDob ? 30 : 0) + (sameName ? 20 : 0),
  }
}
