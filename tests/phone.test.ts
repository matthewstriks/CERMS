import { describe, expect, it } from 'vitest'
import { normalizePhone, phoneLabel } from '../src/domain/phone'
import { emptyMemberDraft, validateMemberDraft } from '../src/domain/member-creation'
import { devMemberRecord, devMembership } from '../src/domain/dev-member'
import { devCreatorUid } from '../src/shared/dev-member-policy'

describe('optional member phones', () => {
  it('normalizes national and international numbers and formats display', () => {
    expect(normalizePhone(' (210) 555-0123 ')).toBe('+12105550123')
    expect(normalizePhone('+44 20 7946 0018')).toBe('+442079460018')
    expect(phoneLabel('+12105550123')).toBe('(210) 555-0123')
    expect(phoneLabel('+442079460018')).toBe('+44 20 7946 0018')
    expect(normalizePhone('  ')).toBe('')
    expect(phoneLabel()).toBe('Not recorded')
  })
  it.each(['123', '1111111111', '+999123456789', 'call 2105550123', '2105550123 ext 2'])(
    'rejects invalid or ambiguous input: %s',
    (value) => {
      expect(() => normalizePhone(value)).toThrow('valid phone')
    },
  )
  it('omits blank phone from storage and normalizes entered phone', () => {
    const draft = {
      ...emptyMemberDraft(),
      firstName: 'Test',
      lastName: 'Guest',
      birthDate: '1990-01-02',
      governmentId: 'FAKE',
      governmentIdType: 'TX',
      membershipProductId: devMembership.id,
    }
    const record = (phone: string) =>
      devMemberRecord(
        validateMemberDraft({ ...draft, phone }),
        devCreatorUid,
        123456789,
        'a'.repeat(64),
        'b'.repeat(64),
      )
    expect(record('')).not.toHaveProperty('phone')
    expect(record('210-555-0123')).toHaveProperty('phone', '+12105550123')
  })
})
