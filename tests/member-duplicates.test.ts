import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memberFromLegacy } from '../src/domain/legacy'
import { memberDuplicate, type MemberIdentity } from '../src/domain/member-duplicates'
import { findMemberDuplicates } from '../src/data/firebase-member-duplicates'

const f = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'c7D7AH07kgXmjn8tSiOgzHscLZ12' } },
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  query: vi.fn((...args) => args),
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ auth: f.auth, db: 'named-cerms-only' }),
}))
vi.mock('firebase/firestore/lite', () => ({
  collection: (...args: unknown[]) => args,
  doc: (...args: unknown[]) => args,
  documentId: () => '__name__',
  getDocs: f.getDocs,
  getDoc: f.getDoc,
  query: f.query,
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (...args: unknown[]) => ['orderBy', ...args],
  startAfter: (...args: unknown[]) => ['startAfter', ...args],
  limit: (n: number) => ['limit', n],
}))
const reader = { uid: 'c7D7AH07kgXmjn8tSiOgzHscLZ12', club: 'dev' }
const input: MemberIdentity = {
  firstName: 'José',
  middleName: 'Andrew',
  lastName: "O'Neil",
  birthDate: '1980-02-09',
  governmentId: 'AB-123 45',
  governmentIdType: 'TX',
}
const record = (changes = {}) => ({
  access: 'dev',
  fname: 'Jose',
  mname: 'A',
  lname: 'ONeil',
  dob: '2/9/1980',
  idnum: 'ab12345',
  idstate: 'Texas',
  ...changes,
})
const match = (changes = {}) =>
  memberDuplicate(input, memberFromLegacy('existing', record(changes), 'dev'))
beforeEach(() => {
  vi.clearAllMocks()
  f.auth.currentUser = { uid: reader.uid }
  f.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ ...reader, access: reader.club }),
  })
})
describe('possible duplicate members', () => {
  it('matches normalized state/ID, all name parts, DOB variants and older fields without search metadata', () => {
    expect(match()?.reasons).toEqual(['ID state and number', 'Name', 'Date of birth'])
    expect(match({ fname: 'Different', lname: 'Name', dob: '1970-01-01' })?.reasons).toEqual([
      'ID state and number',
    ])
    expect(match({ idnum: 'changed', idstate: 'NY' })?.reasons).toEqual(['Name', 'Date of birth'])
    expect(match({ dob: '1970-01-01', idnum: 'changed' })?.reasons).toEqual(['Name'])
  })
  it('uses middle names/initials and DOB to distinguish names and flag typos or changed surnames', () => {
    expect(match({ mname: 'Brian', dob: '1970-01-01', idnum: 'other' })).toBeNull()
    expect(match({ mname: 'Brian', idnum: 'other' })?.reasons).toEqual([
      'Similar name',
      'Date of birth',
    ])
    expect(match({ lname: 'Newname', idnum: 'other' })?.reasons).toContain('Similar name')
    expect(
      memberDuplicate(
        { ...input, firstName: 'Joseph', lastName: 'Striks', middleName: '' },
        memberFromLegacy(
          'typo',
          record({ fname: 'Joesph', lname: 'Strik', mname: '', idnum: 'other' }),
          'dev',
        ),
      )?.reasons,
    ).toContain('Similar name')
    expect(match({ fname: 'Someone', lname: 'Else', idnum: 'other' })).toBeNull()
    expect(match({ fname: 'Someone', lname: 'Else', idstate: 'NY', dob: '1970-01-01' })).toBeNull()
  })
  it('paginates the entire business, including undated older records; makes read-only scoped queries', async () => {
    const docs = Array.from({ length: 250 }, (_, i) => ({
      id: `unrelated-${i}`,
      data: () => record({ fname: 'Other', lname: 'Person', idnum: 'other', dob: '1970-01-01' }),
    }))
    f.getDocs
      .mockResolvedValueOnce({ docs, size: 250 })
      .mockResolvedValueOnce({ docs: [{ id: 'old-match', data: () => record() }], size: 1 })
    const result = await findMemberDuplicates(reader, input)
    expect(result.map((m) => m.member.id)).toEqual(['old-match'])
    expect(f.query).toHaveBeenCalledTimes(2)
    expect(f.query.mock.calls[0]).toEqual([
      ['named-cerms-only', 'members'],
      ['where', 'access', '==', 'dev'],
      ['orderBy', '__name__'],
      ['limit', 250],
    ])
    expect(f.query.mock.calls[1]).toContainEqual(['startAfter', docs.at(-1)])
    expect(f.getDoc).toHaveBeenCalledTimes(2)
  })
  it('does not continue when the database check fails or the business/session changes', async () => {
    f.getDocs.mockRejectedValueOnce(new Error('Offline'))
    await expect(findMemberDuplicates(reader, input)).rejects.toThrow('Offline')
    f.getDocs.mockResolvedValue({ docs: [], size: 0 })
    f.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: reader.uid, access: 'other' }),
    })
    await expect(findMemberDuplicates(reader, input)).rejects.toThrow('business access changed')
    f.auth.currentUser = { uid: 'staff' }
    await expect(findMemberDuplicates(reader, input)).rejects.toThrow('permission')
    f.auth.currentUser = { uid: reader.uid }
    const abort = new AbortController()
    abort.abort()
    await expect(findMemberDuplicates(reader, input, abort.signal)).rejects.toThrow()
  })
})
