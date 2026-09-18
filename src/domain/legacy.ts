/** Read adapters only. These view models must never replace a Firestore document. */
export type LegacyDocument = Readonly<Record<string, unknown>>
export interface Member {
  id: string
  number: string
  name: string
  membership: string
  expiresAt: number | null
  dna: boolean
  tagged: boolean
  waiver: boolean
  notes: readonly string[]
  dob: string
  phone?: string
  email: string
  governmentId: string
  governmentIdState: string
  createdBy?: string
  createdAt: number | null
  files: readonly { name: string; url: string }[]
}
export interface Activity {
  id: string
  memberId: string
  active: boolean
  waiting: boolean
  inside: boolean
  rental: string
  location: string
  expiresAt: number | null
  enteredAt: number | null
}
export interface Product {
  id: string
  name: string
  categoryId: string
  price: number | null
  inventory: number | null
  active: boolean
  kind: 'Membership' | 'Rental' | 'Retail'
}
export const collections = Object.freeze({
  members: 'members',
  activity: 'activity',
  products: 'products',
  categories: 'categories',
  discounts: 'discounts',
  orders: 'orders',
  registers: 'registers',
  drops: 'drops',
  users: 'users',
  system: 'system',
  chats: 'chats',
  messages: 'messages',
  mail: 'mail',
})
export function finiteNumber(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

export function unixSecondsToMillis(value: unknown): number | null {
  const seconds = finiteNumber(value)
  if (seconds === null) return null
  const ms = seconds * 1000
  return Number.isFinite(new Date(ms).getTime()) ? ms : null
}
/** Timestamp fields have an explicit decoder; numeric values are not guessed as seconds or ms. */
export function timestampToMillis(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (!value || typeof value !== 'object' || !('seconds' in value)) return null
  const seconds = value.seconds
  const nanos = 'nanoseconds' in value ? value.nanoseconds : 0
  if (
    typeof seconds !== 'number' ||
    !Number.isInteger(seconds) ||
    typeof nanos !== 'number' ||
    !Number.isInteger(nanos) ||
    nanos < 0 ||
    nanos >= 1e9
  )
    return null
  const millis = seconds * 1000 + Math.floor(nanos / 1e6)
  return Number.isFinite(new Date(millis).getTime()) ? millis : null
}
export function assertAccess(document: LegacyDocument, access: string): void {
  if (!access.trim() || document.access !== access)
    throw new Error('Record does not belong to the current club.')
}
export function memberFromLegacy(id: string, doc: LegacyDocument, access: string): Member {
  assertAccess(doc, access)
  return {
    id,
    number:
      typeof doc.id_number === 'number' || typeof doc.id_number === 'string'
        ? String(doc.id_number)
        : '—',
    name:
      ((doc.mname || doc.suffix) && doc.fname && doc.lname
        ? [doc.fname, doc.mname, doc.lname, doc.suffix]
            .filter((part) => typeof part === 'string' && part)
            .join(' ')
        : '') ||
      text(doc.name) ||
      [text(doc.fname), text(doc.lname)].filter(Boolean).join(' ') ||
      'Unnamed member',
    membership: text(doc.membership_type, 'Unspecified'),
    expiresAt: unixSecondsToMillis(doc.id_expiration),
    dna: doc.dna === true,
    tagged: doc.tag === true,
    waiver: doc.waiver_status === true,
    notes: Array.isArray(doc.notes)
      ? doc.notes.filter((note): note is string => typeof note === 'string')
      : typeof doc.notes === 'string'
        ? [doc.notes]
        : [],
    dob: text(doc.dob),
    phone: text(doc.phone),
    createdBy: text(doc.createdBy),
    email: text(doc.email),
    governmentId: text(doc.idnum),
    governmentIdState: text(doc.idstate),
    createdAt: timestampToMillis(doc.creation_time) ?? unixSecondsToMillis(doc.creation_time),
    files: [
      ...(typeof doc.signature === 'string' && doc.signature
        ? [{ name: 'E-signed waiver', url: doc.signature }]
        : []),
      ...(Array.isArray(doc.files)
        ? doc.files.flatMap((url, index) =>
            typeof url === 'string'
              ? [
                  {
                    name: Array.isArray(doc.filesNames)
                      ? text(doc.filesNames[index], `Attachment ${index + 1}`)
                      : `Attachment ${index + 1}`,
                    url,
                  },
                ]
              : [],
          )
        : []),
    ],
  }
}
export function activityFromLegacy(id: string, doc: LegacyDocument, access: string): Activity {
  assertAccess(doc, access)
  const rental: unknown[] = Array.isArray(doc.lockerRoomStatus) ? doc.lockerRoomStatus : []
  return {
    id,
    memberId: text(doc.memberID),
    active: doc.active === true,
    waiting: doc.waitlist === true,
    inside: doc.currIn === true,
    rental: text(rental[2], 'Unassigned'),
    location:
      typeof rental[1] === 'string' || typeof rental[1] === 'number' ? String(rental[1]) : '—',
    expiresAt: unixSecondsToMillis(rental[5]),
    enteredAt: timestampToMillis(doc.timeIn),
  }
}
export function productFromLegacy(id: string, doc: LegacyDocument, access: string): Product {
  assertAccess(doc, access)
  return {
    id,
    name: text(doc.name, 'Unnamed product'),
    categoryId: text(doc.cat),
    price: finiteNumber(doc.price),
    inventory: finiteNumber(doc.inventory),
    active: doc.active === true,
    kind: doc.membership === true ? 'Membership' : doc.rental === true ? 'Rental' : 'Retail',
  }
}
export function membershipStatus(
  member: Member,
  now: number,
): 'Do not admit' | 'Unknown' | 'Expired' | 'Active' {
  if (member.dna) return 'Do not admit'
  if (member.expiresAt === null) return 'Unknown'
  return member.expiresAt <= now ? 'Expired' : 'Active'
}
