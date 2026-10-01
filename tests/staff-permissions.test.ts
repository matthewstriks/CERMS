import { expect, it } from 'vitest'
import {
  defaultStaffPermissions,
  allStaffPermissions,
  effectivePermissions,
  ownerUid,
  hasStaffPermission,
} from '../src/domain/staff-permissions'
import {
  staffPermissionCommit,
  isStaffPermissionCommit,
  staffAccountEndpoint,
} from '../src/shared/staff-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
it('protects the owner and resolves assigned permissions without trusting rank/email', () => {
  expect(effectivePermissions(ownerUid, {})).toEqual(allStaffPermissions)
  expect(effectivePermissions('staff')).toEqual(defaultStaffPermissions)
  expect(hasStaffPermission('staff', 'editMembers')).toBe(false)
  expect(
    hasStaffPermission('staff', 'editMembers', { ...defaultStaffPermissions, editMembers: true }),
  ).toBe(true)
  expect(effectivePermissions('staff', { rank: 'owner' }).openRegisters).toBe(false)
})
it('allows only exact permission commits and the bounded staff-account endpoint', () => {
  const commit = staffPermissionCommit('club-a', 'staff', defaultStaffPermissions)
  expect(isStaffPermissionCommit(JSON.stringify(commit))).toBe(true)
  expect(
    isStaffPermissionCommit(
      JSON.stringify(staffPermissionCommit('club-a', ownerUid, defaultStaffPermissions)),
    ),
  ).toBe(false)
  const body = JSON.stringify({
    data: {
      business: 'club-a',
      requestId: '10000000-0000-4000-8000-000000000001',
      displayName: 'Synthetic',
      email: 'staff@example.test',
      password: 'synthetic-password',
      permissions: defaultStaffPermissions,
    },
  })
  expect(allowFirebaseRequest(staffAccountEndpoint, 'POST', body)).toBe(true)
  expect(allowFirebaseRequest(staffAccountEndpoint + 'Other', 'POST', body)).toBe(false)
  expect(
    allowFirebaseRequest(staffAccountEndpoint, 'POST', body.replace('editMembers', 'owner')),
  ).toBe(false)
  expect(allowFirebaseRequest(staffAccountEndpoint, 'GET', body)).toBe(false)
  expect(
    allowFirebaseRequest('https://identitytoolkit.googleapis.com/v1/accounts:signUp', 'POST', body),
  ).toBe(false)
})
