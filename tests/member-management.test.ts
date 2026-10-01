import { expect, it } from 'vitest'
import {
  memberEditFields,
  validateMemberEdit,
  type MemberEditDraft,
} from '../src/domain/member-edit'
import {
  canManageMembers,
  memberEditCommit,
  memberDeleteCommit,
  isMemberManagementCommit,
} from '../src/shared/member-management-policy'
import {
  isDeleteProductCommit,
  deleteProductCommit,
} from '../src/shared/catalog-policy'
import { devCreatorUid } from '../src/shared/dev-member-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
const draft = (): MemberEditDraft => ({
  firstName: 'Test',
  middleName: '',
  lastName: 'Guest',
  suffix: '',
  birthDate: '1990-01-02',
  governmentId: '0001',
  governmentIdType: 'TX',
  email: '',
  phone: '',
  expiresAt: 2000000000,
  dna: false,
  tagged: false,
  productId: '',
})
const time = '2026-09-30T12:00:00.123456Z',
  id = 'member-one'
const patch = () => memberEditFields(draft(), 'Existing membership', devCreatorUid)
it('uses the owner fallback without granting staff or rank permissions', () => {
  expect(canManageMembers(devCreatorUid, 'dev')).toBe(true)
  expect(canManageMembers(devCreatorUid, 'club-a')).toBe(true)
  expect(canManageMembers('staff', 'club-a')).toBe(false)
})
it('validates identity, contact and expiration edits and recomputes search fields', () => {
  expect(
    memberEditFields(
      { ...draft(), firstName: ' José ', phone: '2105550123' },
      'Existing membership',
      devCreatorUid,
    ),
  ).toMatchObject({ fname: 'José', searchFirst: 'jose', phone: '+12105550123', searchId: '0001' })
  for (const change of [
    { birthDate: '2020-01-01' },
    { expiresAt: NaN },
    { governmentId: '' },
    { email: 'invalid' },
    { phone: '123' },
    { productId: '../bad' },
  ])
    expect(() => validateMemberEdit({ ...draft(), ...change })).toThrow()
})
it('permits version-checked edits, identity moves and deletion only in cerms', () => {
  const identity = { oldKey: 'a'.repeat(64), oldTime: time, newKey: 'b'.repeat(64) }
  for (const p of [
    memberEditCommit(id, time, patch()),
    memberEditCommit(id, time, { ...patch(), identityKey: identity.newKey }, identity),
    memberDeleteCommit(id, time),
    memberDeleteCommit(id, time, identity),
  ]) {
    const body = JSON.stringify(p)
    expect(isMemberManagementCommit(body)).toBe(true)
    expect(
      allowFirebaseRequest(
        'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
        'POST',
        body,
      ),
    ).toBe(true)
    expect(isMemberManagementCommit(body.replaceAll('/cerms/', '/(default)/'))).toBe(false)
  }
})
it('rejects protected fields, unversioned operations and unrelated companion writes', () => {
  for (const mutate of [
    (p: any) => (p.writes[0].update.fields.access = { stringValue: 'other' }),
    (p: any) => p.writes[0].updateMask.fieldPaths.push('notes'),
    (p: any) => (p.writes[0].currentDocument = { exists: true }),
    (p: any) => (p.writes[0].updateTransforms[0].fieldPath = 'creation_time'),
    (p: any) => (p.writes[0].update.fields.updatedBy = { stringValue: 'invalid/uid' }),
    (p: any) => p.writes.push({ delete: 'users/staff' }),
    (p: any) => (p.writes[0].update.fields.searchFirst = { stringValue: 'wrong' }),
  ]) {
    const p = memberEditCommit(id, time, patch())
    mutate(p)
    expect(isMemberManagementCommit(JSON.stringify(p))).toBe(false)
  }
  expect(
    isMemberManagementCommit(
      JSON.stringify({
        writes: [{ delete: `projects/cerms-7af24/databases/cerms/documents/members/${id}` }],
      }),
    ),
  ).toBe(false)
})
it('restricts product deletion to version-checked product paths', () => {
  const body = JSON.stringify(deleteProductCommit('club-a', 'membership', time))
  expect(isDeleteProductCommit(body)).toBe(true)
  expect(isDeleteProductCommit(body.replace('/products/', '/categories/'))).toBe(false)
  expect(isDeleteProductCommit(body.replace('/cerms/', '/(default)/'))).toBe(false)
  expect(
    isDeleteProductCommit(
      JSON.stringify({
        writes: [
          {
            delete:
              'projects/cerms-7af24/databases/cerms/documents/system/club-a/products/membership',
          },
        ],
      }),
    ),
  ).toBe(false)
})
