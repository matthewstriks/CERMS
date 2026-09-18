import { describe, expect, it } from 'vitest'
import {
  ageOn,
  emptyMemberDraft,
  parseMemberScan,
  validateMemberDraft,
} from '../src/domain/member-creation'
import { encodeLegacyMember } from '../src/data/member-creation-legacy'
import { memberFromLegacy } from '../src/domain/legacy'
import { assertMemberLabTarget } from '../src/data/emulator-member-creator'
export const adultDraft = () => ({
  ...emptyMemberDraft(),
  firstName: 'Test',
  middleName: 'Middle',
  lastName: 'Guest',
  suffix: 'JR.',
  birthDate: '1990-01-02',
  governmentId: 'FAKE-123',
  governmentIdType: 'NY',
  membershipProductId: 'annual',
  notes: 'Synthetic notes',
})
describe('member creation compatibility', () => {
  it('preserves legacy field names, types, defaults, IDs and existing reader compatibility', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    const record = encodeLegacyMember(
      validateMemberDraft(adultDraft()),
      { id: 'annual', name: 'Annual', durationSeconds: 31540000 },
      { now, number: 123456, club: 'fixture-club', staffName: 'Test staff' },
    )
    expect(record).toMatchObject({
      name: 'Test Guest',
      fname: 'Test',
      mname: 'Middle',
      suffix: 'JR.',
      id_number: 123456,
      membership_type: 'Annual',
      checkedIn: false,
      waiver_status: false,
      dna: false,
      dob: '1990-01-02',
      idnum: 'FAKE-123',
    })
    expect(record.id_expiration).toBe(now.getTime() / 1000 + 31540000)
    expect(record.notes[0]).toContain('Test staff [')
    expect(memberFromLegacy('stable-id', record, 'fixture-club')).toMatchObject({
      id: 'stable-id',
      number: '123456',
      name: 'Test Middle Guest JR.',
      membership: 'Annual',
    })
  })
  it('handles birthdays correctly and rejects minors on submit even without change events', () => {
    const today = new Date(2026, 8, 16)
    expect(ageOn('2008-09-16', today)).toBe(18)
    expect(ageOn('2008-10-01', today)).toBe(17)
    expect(() => validateMemberDraft({ ...adultDraft(), birthDate: '2008-09-17' }, today)).toThrow(
      '18',
    )
    expect(() => validateMemberDraft({ ...adultDraft(), birthDate: '2000-02-30' })).toThrow('date')
  })
  it('validates import dates/numbers and ignores hidden overrides in normal mode', () => {
    expect(
      validateMemberDraft({ ...adultDraft(), membershipNumber: '500', createdDate: 'invalid' })
        .membershipNumber,
    ).toBe('')
    expect(() =>
      validateMemberDraft({ ...adultDraft(), importExisting: true, membershipNumber: '1.5' }),
    ).toThrow('whole')
    expect(() =>
      validateMemberDraft({
        ...adultDraft(),
        importExisting: true,
        createdDate: '2026-02-02',
        expiresDate: '2026-01-01',
      }),
    ).toThrow('precede')
    const record = encodeLegacyMember(
      validateMemberDraft({
        ...adultDraft(),
        importExisting: true,
        createdDate: '2020-01-01',
        expiresDate: '2021-01-01',
      }),
      { id: 'annual', name: 'Annual', durationSeconds: 1 },
      { now: new Date(), number: 42, club: 'fixture-club', staffName: 'Test' },
    )
    expect(record.creation_time.toISOString()).toBe('2020-01-01T00:00:00.000Z')
    expect(record.id_expiration).toBe(Date.parse('2021-01-01T00:00:00Z') / 1000)
  })
  it('decodes supported scanner fields and rejects malformed scans', () => {
    expect(
      parseMemberScan('DAQFAKE123\nDCSTEST\nDACGUEST\nDADMIDDLE\nDAEJR\nDBB01021990\nDAJNY'),
    ).toMatchObject({
      firstName: 'GUEST',
      lastName: 'TEST',
      birthDate: '1990-01-02',
      suffix: 'JR.',
      governmentId: 'FAKE123',
    })
    expect(() => parseMemberScan('not an ID')).toThrow('Unable')
    expect(() => parseMemberScan('DAQFAKE\nDCSGUEST\nDACTEST\nDBB02301990')).toThrow('date')
  })
  it('rejects every nonlocal or non-demo target before initialization', () => {
    for (const [project, host, port] of [
      ['cerms-7af24', '127.0.0.1', 8080],
      ['demo-cerms-members', 'firestore.googleapis.com', 8080],
      ['demo-cerms-members', '127.0.0.1', NaN],
    ] as const)
      expect(() => assertMemberLabTarget(project, host, port)).toThrow('isolated')
  })
})
