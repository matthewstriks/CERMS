import { it, expect } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { memberNotesEndpoint } from '../src/shared/member-notes-policy'
import { effectivePermissions } from '../src/domain/staff-permissions'
it('allows only bounded, authenticated-service note shapes, never direct note writes', () => {
  const base = {
    business: 'dev',
    memberId: 'guest',
    action: 'add',
    requestId: '10000000-0000-4000-8000-000000000001',
    text: 'Note',
  }
  const allowed = (data: unknown) =>
    allowFirebaseRequest(memberNotesEndpoint, 'POST', JSON.stringify({ data }))
  expect(allowed(base)).toBe(true)
  expect(allowed({ ...base, actorName: 'Forged' })).toBe(false)
  expect(allowed({ ...base, memberId: '../guest' })).toBe(false)
  expect(allowed({ ...base, text: ' ' })).toBe(false)
  expect(allowed({ ...base, text: 'x'.repeat(10001) })).toBe(false)
  const dna = {
    business: 'dev',
    memberId: 'guest',
    action: 'dna',
    requestId: base.requestId,
    enabled: true,
    expectedDna: false,
    reason: '',
  }
  expect(allowed(dna)).toBe(false)
  expect(allowed({ ...dna, reason: 'Incident' })).toBe(true)
  expect(
    allowFirebaseRequest(memberNotesEndpoint + '?other=1', 'POST', JSON.stringify({ data: base })),
  ).toBe(false)
  expect(allowFirebaseRequest(memberNotesEndpoint, 'GET')).toBe(false)
})
it('note removal is an independent admin permission that defaults off', () => {
  expect(effectivePermissions('staff').removeMemberNotes).toBe(false)
  expect(
    effectivePermissions('staff', {
      editMembers: true,
      deleteMembers: true,
      manageProducts: false,
      openRegisters: true,
      closeRegisters: true,
    }).removeMemberNotes,
  ).toBe(false)
})
