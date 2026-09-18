import { normalizePhone } from './phone'

/** UI/application model. No Firebase types or legacy field names cross this boundary. */
export interface MemberDraft {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthDate: string
  phone: string
  email: string
  membershipProductId: string
  governmentIdType: string
  governmentId: string
  notes: string
  importExisting: boolean
  createdDate: string
  expiresDate: string
  membershipNumber: string
}
export interface MembershipOption {
  id: string
  name: string
  durationSeconds: number
}
export interface CreatedMember {
  id: string
  number: number
  name: string
}
export interface MemberCreator {
  options(): Promise<MembershipOption[]>
  create(draft: MemberDraft, requestId: string): Promise<CreatedMember>
}
export const emptyMemberDraft = (): MemberDraft => ({
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  birthDate: '',
  phone: '',
  email: '',
  membershipProductId: '',
  governmentIdType: '',
  governmentId: '',
  notes: '',
  importExisting: false,
  createdDate: '',
  expiresDate: '',
  membershipNumber: '',
})
export const suffixes = ['', 'II', 'III', 'IV', 'JR.', 'SR.'] as const
export const idTypes = [
  {
    value: 'AL',
    label: 'Alabama',
  },
  {
    value: 'AK',
    label: 'Alaska',
  },
  {
    value: 'AZ',
    label: 'Arizona',
  },
  {
    value: 'AR',
    label: 'Arkansas',
  },
  {
    value: 'CA',
    label: 'California',
  },
  {
    value: 'CO',
    label: 'Colorado',
  },
  {
    value: 'CT',
    label: 'Connecticut',
  },
  {
    value: 'DE',
    label: 'Delaware',
  },
  {
    value: 'DC',
    label: 'District Of Columbia',
  },
  {
    value: 'FL',
    label: 'Florida',
  },
  {
    value: 'GA',
    label: 'Georgia',
  },
  {
    value: 'HI',
    label: 'Hawaii',
  },
  {
    value: 'ID',
    label: 'Idaho',
  },
  {
    value: 'IL',
    label: 'Illinois',
  },
  {
    value: 'IN',
    label: 'Indiana',
  },
  {
    value: 'IA',
    label: 'Iowa',
  },
  {
    value: 'KS',
    label: 'Kansas',
  },
  {
    value: 'KY',
    label: 'Kentucky',
  },
  {
    value: 'LA',
    label: 'Louisiana',
  },
  {
    value: 'ME',
    label: 'Maine',
  },
  {
    value: 'MD',
    label: 'Maryland',
  },
  {
    value: 'MA',
    label: 'Massachusetts',
  },
  {
    value: 'MI',
    label: 'Michigan',
  },
  {
    value: 'MN',
    label: 'Minnesota',
  },
  {
    value: 'MS',
    label: 'Mississippi',
  },
  {
    value: 'MO',
    label: 'Missouri',
  },
  {
    value: 'MT',
    label: 'Montana',
  },
  {
    value: 'NE',
    label: 'Nebraska',
  },
  {
    value: 'NV',
    label: 'Nevada',
  },
  {
    value: 'NH',
    label: 'New Hampshire',
  },
  {
    value: 'NJ',
    label: 'New Jersey',
  },
  {
    value: 'NM',
    label: 'New Mexico',
  },
  {
    value: 'NY',
    label: 'New York',
  },
  {
    value: 'NC',
    label: 'North Carolina',
  },
  {
    value: 'ND',
    label: 'North Dakota',
  },
  {
    value: 'OH',
    label: 'Ohio',
  },
  {
    value: 'OK',
    label: 'Oklahoma',
  },
  {
    value: 'OR',
    label: 'Oregon',
  },
  {
    value: 'PA',
    label: 'Pennsylvania',
  },
  {
    value: 'RI',
    label: 'Rhode Island',
  },
  {
    value: 'SC',
    label: 'South Carolina',
  },
  {
    value: 'SD',
    label: 'South Dakota',
  },
  {
    value: 'TN',
    label: 'Tennessee',
  },
  {
    value: 'TX',
    label: 'Texas',
  },
  {
    value: 'UT',
    label: 'Utah',
  },
  {
    value: 'VT',
    label: 'Vermont',
  },
  {
    value: 'VA',
    label: 'Virginia',
  },
  {
    value: 'WA',
    label: 'Washington',
  },
  {
    value: 'WV',
    label: 'West Virginia',
  },
  {
    value: 'WI',
    label: 'Wisconsin',
  },
  {
    value: 'WY',
    label: 'Wyoming',
  },
  {
    value: 'military',
    label: 'Military',
  },
  {
    value: 'passport',
    label: 'Passport',
  },
  {
    value: 'other',
    label: 'Other (mention in notes section)',
  },
]
export function dateOnlyMillis(value: string): number {
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== value
  )
    throw new Error('Enter a valid date.')
  return ms
}
export function ageOn(birthDate: string, today = new Date()): number {
  dateOnlyMillis(birthDate)
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number]
  return (
    today.getFullYear() -
    year -
    (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)
      ? 1
      : 0)
  )
}
export function validateMemberDraft(draft: MemberDraft, now = new Date()): MemberDraft {
  const clean = { ...draft, phone: normalizePhone(draft.phone) }
  for (const key of Object.keys(clean) as (keyof MemberDraft)[]) {
    if (typeof clean[key] === 'string')
      Object.assign(clean, { [key]: (clean[key] as string).trim() })
  }
  if (!clean.firstName || !clean.lastName || !clean.governmentId || !clean.membershipProductId)
    throw new Error('First name, last name, ID number, and membership type are required.')
  if (ageOn(clean.birthDate, now) > 125) throw new Error('Check the date of birth.')
  if (clean.email.length > 320) throw new Error('Email is too long.')
  if (ageOn(clean.birthDate, now) < 18) throw new Error('Members must be at least 18 years old.')
  if (!suffixes.includes(clean.suffix as (typeof suffixes)[number]))
    throw new Error('Choose a listed suffix.')
  if (clean.governmentIdType && !idTypes.some((type) => type.value === clean.governmentIdType))
    throw new Error('Choose a listed ID type.')
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))
    throw new Error('Enter a valid email address.')
  if (
    [clean.firstName, clean.middleName, clean.lastName, clean.governmentId].some(
      (value) => value.length > 200,
    ) ||
    clean.notes.length > 10000
  )
    throw new Error('A name, ID, or notes field is too long.')
  if (clean.importExisting) {
    if (clean.createdDate) dateOnlyMillis(clean.createdDate)
    if (clean.expiresDate) dateOnlyMillis(clean.expiresDate)
    if (clean.createdDate && clean.expiresDate && clean.expiresDate < clean.createdDate)
      throw new Error('Expiration cannot precede creation.')
    if (
      clean.membershipNumber &&
      (!/^\d+$/.test(clean.membershipNumber) ||
        !Number.isSafeInteger(Number(clean.membershipNumber)) ||
        Number(clean.membershipNumber) < 1)
    )
      throw new Error('Membership ID must be a positive whole number.')
  } else {
    clean.createdDate = clean.expiresDate = clean.membershipNumber = ''
  }
  return clean
}
export interface MemberScan {
  draft: Partial<MemberDraft>
  expirationDate: string | null
  warnings: string[]
}
export const maxScanLength = 16384
/** Decoded US PDF417 text only. Never retain the raw barcode or unrelated card fields. */
export function decodeMemberScan(raw: string, today = new Date()): MemberScan {
  if (!raw || raw.length > maxScanLength)
    throw new Error('Unable to read this scan. Scan one ID at a time.')
  // Keyboard scanners may preserve CR, LF, record separators, or substitute tabs.
  const lines = raw.replace(/^\]L[0-9]/, '').split(/[\r\n\t\x1d\x1e]+/)
  const fields = new Map<string, string>()
  for (let line of lines) {
    line = line.trim()
    // ANSI header: IIN, version, jurisdiction version, entry count, subfile directory.
    line = line.replace(/^@?\s*ANSI \d{12}(?:(?:DL|ID|Z[A-Z])\d{8})+/, '')
    const match = line.match(/^(?:DL|ID)?(D[A-Z]{2})(.*)$/)
    if (!match) continue
    const [, key, text] = match
    if (fields.has(key!))
      throw new Error('Unable to read this scan. Conflicting or repeated fields.')
    fields.set(key!, text!.trim())
  }
  if (fields.get('DCG') && fields.get('DCG') !== 'USA')
    throw new Error('This scanner flow supports US IDs. Enter this document manually.')
  const dob = fields.get('DBB') ?? ''
  if (!fields.get('DAC') || !fields.get('DCS') || !fields.get('DAQ') || !/^\d{8}$/.test(dob))
    throw new Error(
      'Unable to read this scan. Preserve barcode line breaks or enter details manually.',
    )
  function scanDate(value: string) {
    if (!/^\d{8}$/.test(value)) throw new Error('Enter a valid scanned date.')
    const date = `${value.slice(4)}-${value.slice(0, 2)}-${value.slice(2, 4)}`
    dateOnlyMillis(date)
    return date
  }
  const birthDate = scanDate(dob)
  if (ageOn(birthDate, today) < 0 || ageOn(birthDate, today) > 125)
    throw new Error('The scanned date of birth is not plausible. Check the card.')
  const suffix = (fields.get('DCU') ?? fields.get('DAE') ?? '')
    .toUpperCase()
    .replace(/^(JR|SR)$/, '$1.')
  if (!suffixes.includes(suffix as (typeof suffixes)[number]))
    throw new Error('Unrecognized scanned suffix. Enter the details manually.')
  const governmentIdType = fields.get('DAJ') ?? ''
  if (governmentIdType && !idTypes.some((type) => type.value === governmentIdType))
    throw new Error('Unrecognized scanned state. Enter the details manually.')
  const expirationDate = fields.get('DBA') ? scanDate(fields.get('DBA')!) : null
  const warnings = [
    'Confirm the issuing state on the card. The barcode state is the address state.',
  ]
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (expirationDate && expirationDate < localToday)
    warnings.push('This ID is expired. Check the physical card.')
  if (['DDE', 'DDF', 'DDG'].some((key) => fields.get(key) === 'T'))
    warnings.push('The barcode contains a shortened name. Complete it from the card.')
  if (!expirationDate) warnings.push('No ID expiration was decoded. Check the physical card.')
  const draft = {
    firstName: fields.get('DAC')!,
    middleName: fields.get('DAD') ?? '',
    lastName: fields.get('DCS')!,
    suffix,
    birthDate,
    governmentId: fields.get('DAQ')!,
    governmentIdType,
  }
  if (Object.values(draft).some((value) => value.length > 200 || /[\x00-\x1f]/.test(value)))
    throw new Error('Unable to read this scan. Invalid field length or characters.')
  return { draft, expirationDate, warnings }
}
export function parseMemberScan(raw: string): Partial<MemberDraft> {
  return decodeMemberScan(raw).draft
}
