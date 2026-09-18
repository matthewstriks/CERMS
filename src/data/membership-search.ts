import type { MemberSearchField } from './membership-contracts'

export function nameVariants(input: string): string[] {
  const value = input.trim().replace(/\s+/g, ' ')
  return [
    ...new Set([
      value,
      value.toUpperCase(),
      value.toLowerCase(),
      value.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()),
    ]),
  ]
}
export function dobVariants(input: string): string[] {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.trim())
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim())
  if (!match && !slash) throw new Error('Enter a date as YYYY-MM-DD or MM/DD/YYYY.')
  const year = Number(match ? match[1] : slash![3])
  const month = Number(match ? match[2] : slash![1])
  const day = Number(match ? match[3] : slash![2])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error('Enter a valid date of birth.')
  const mm = String(month).padStart(2, '0'),
    dd = String(day).padStart(2, '0')
  return [
    ...new Set([
      `${year}-${mm}-${dd}`,
      `${mm}/${dd}/${year}`,
      `${year}-${month}-${day}`,
      `${month}/${day}/${year}`,
    ]),
  ]
}
export function searchDescription(field: MemberSearchField): string {
  return {
    name: 'Exact first, last, or full name; common capitalization variants are included.',
    dob: 'Date of birth in YYYY-MM-DD or MM/DD/YYYY format.',
    id: 'Exact government/state ID number.',
    number: 'Exact CERMS membership number.',
    type: 'Exact membership type name.',
  }[field]
}
