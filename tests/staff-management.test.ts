import { expect, it } from 'vitest'
import {
  defaultStaffPermissions,
  effectivePermissions,
  ownerUid,
} from '../src/domain/staff-permissions'
import {
  isStaffManagementRequest,
  staffManagementEndpoint,
} from '../src/shared/staff-management-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
it('staff management defaults off and only exact profile fields are accepted', () => {
  expect(effectivePermissions('staff').editStaffProfiles).toBe(false)
  expect(effectivePermissions('staff').removeStaffAccounts).toBe(false)
  expect(effectivePermissions(ownerUid).removeStaffAccounts).toBe(true)
  expect(
    effectivePermissions('admin', { ...defaultStaffPermissions, editStaffProfiles: true })
      .editStaffProfiles,
  ).toBe(true)
  const data = {
    action: 'update',
    business: 'dev',
    uid: 'staff',
    requestId: '10000000-0000-4000-8000-000000000001',
    expectedProfileVersion: '100.000000001',
    profile: { displayName: 'Updated name', email: 'contact@example.test' },
  }
  const body = JSON.stringify({ data })
  expect(isStaffManagementRequest(body)).toBe(true)
  expect(allowFirebaseRequest(staffManagementEndpoint, 'POST', body)).toBe(true)
  expect(
    isStaffManagementRequest(
      JSON.stringify({ data: { ...data, profile: { ...data.profile, access: 'foreign' } } }),
    ),
  ).toBe(false)
  expect(allowFirebaseRequest(staffManagementEndpoint + '?x=1', 'POST', body)).toBe(false)
})
