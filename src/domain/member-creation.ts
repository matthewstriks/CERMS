/** UI/application model. No Firebase types or legacy field names cross this boundary. */
export interface MemberDraft {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthDate: string
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
  const clean = { ...draft }
  for (const key of Object.keys(clean) as (keyof MemberDraft)[]) {
    if (typeof clean[key] === 'string')
      Object.assign(clean, { [key]: (clean[key] as string).trim() })
  }
  if (!clean.firstName || !clean.lastName || !clean.governmentId || !clean.membershipProductId)
    throw new Error('First name, last name, ID number, and membership type are required.')
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
/** Decode the same newline-delimited ID fields supported by CERMS 4. Never persist raw scans. */
export function parseMemberScan(raw: string): Partial<MemberDraft> {
  const fields = new Map<string, string>()
  for (const line of raw.split(/[\r\n]+/)) {
    const match = line.trim().match(/^(?:DL)?(DAC|DAD|DCS|DAE|DBB|DAQ|DAJ)(.*)$/)
    if (match) fields.set(match[1]!, match[2]!.trim())
  }
  const dob = fields.get('DBB') ?? ''
  if (!fields.get('DAC') || !fields.get('DCS') || !fields.get('DAQ') || !/^\d{8}$/.test(dob))
    throw new Error('Unable to read this scan. Enter the details manually or scan again.')
  const birthDate = `${dob.slice(4)}-${dob.slice(0, 2)}-${dob.slice(2, 4)}`
  dateOnlyMillis(birthDate)
  const suffix = (fields.get('DAE') ?? '').toUpperCase().replace(/^(JR|SR)$/, '$1.')
  if (!suffixes.includes(suffix as (typeof suffixes)[number]))
    throw new Error('Unrecognized scanned suffix. Enter the details manually.')
  const governmentIdType = fields.get('DAJ') ?? ''
  if (governmentIdType && !idTypes.some((type) => type.value === governmentIdType))
    throw new Error('Unrecognized scanned state. Enter the details manually.')
  return {
    firstName: fields.get('DAC')!,
    middleName: fields.get('DAD') ?? '',
    lastName: fields.get('DCS')!,
    suffix,
    birthDate,
    governmentId: fields.get('DAQ')!,
    governmentIdType,
  }
}
