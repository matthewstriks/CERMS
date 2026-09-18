import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allowFirebaseRequest,
  canSwitchSystems,
  firebaseProjectId,
  systemSwitcherUid,
} from '../src/shared/firebase-policy'
import { allowSystemSwitchAuthorization } from '../src/main/system-switch-authorization'

const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/cerms/documents:commit`
const commit = () => ({
  writes: [
    {
      update: {
        name: `projects/${firebaseProjectId}/databases/cerms/documents/users/${systemSwitcherUid}`,
        fields: { access: { stringValue: 'club-b' } },
      },
      updateMask: { fieldPaths: ['access'] },
      currentDocument: { exists: true },
    },
  ],
})
describe('narrow system-switch write exception', () => {
  it('allows exactly the authorized existing user access update', () => {
    expect(canSwitchSystems(systemSwitcherUid)).toBe(true)
    expect(canSwitchSystems('other-user')).toBe(false)
    expect(canSwitchSystems(undefined)).toBe(false)
    expect(allowFirebaseRequest(commitUrl, 'POST', JSON.stringify(commit()))).toBe(true)
    expect(
      allowFirebaseRequest(commitUrl + '?key=public-client-key', 'POST', JSON.stringify(commit())),
    ).toBe(true)
  })
  it('rejects every broader write shape', () => {
    expect(
      allowFirebaseRequest(
        commitUrl.replace('/cerms/', '/(default)/'),
        'POST',
        JSON.stringify(commit()),
      ),
    ).toBe(false)
    const cases = [
      (body: any) =>
        (body.writes[0].update.name = body.writes[0].update.name.replace('/cerms/', '/(default)/')),
      (body: any) => body.writes.push(body.writes[0]),
      (body: any) => (body.writes[0].update.name += '-other'),
      (body: any) =>
        (body.writes[0].update.name = body.writes[0].update.name.replace('/users/', '/members/')),
      (body: any) => (body.writes[0].update.fields.rank = { stringValue: 'admin' }),
      (body: any) => body.writes[0].updateMask.fieldPaths.push('rank'),
      (body: any) => delete body.writes[0].updateMask,
      (body: any) => delete body.writes[0].currentDocument,
      (body: any) => (body.writes[0].currentDocument.exists = false),
      (body: any) => (body.writes[0].updateTransforms = []),
      (body: any) => (body.writes[0].delete = body.writes[0].update.name),
      (body: any) => (body.transaction = 'unapproved'),
      (body: any) => (body.writes[0].update.fields.access = { integerValue: '5' }),
      (body: any) => (body.writes[0].update.fields.access.stringValue = 'bad/path'),
      (body: any) => (body.writes[0].update.fields.access.stringValue = ' '),
    ]
    for (const mutate of cases) {
      const body = commit()
      mutate(body)
      expect(allowFirebaseRequest(commitUrl, 'POST', JSON.stringify(body))).toBe(false)
    }
    for (const body of ['null', '[]', '{', '{}'])
      expect(allowFirebaseRequest(commitUrl, 'POST', body)).toBe(false)
  })
  it('requires the designated UID in a Firebase bearer token before forwarding a commit', () => {
    const now = Date.now()
    const claims = {
      sub: systemSwitcherUid,
      aud: firebaseProjectId,
      iss: `https://securetoken.google.com/${firebaseProjectId}`,
      exp: now / 1000 + 3600,
    }
    const token = (overrides = {}, alg = 'RS256') =>
      `Bearer ${Buffer.from(JSON.stringify({ alg })).toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url')}.test-signature`
    // These are claim-filter tests; Firebase still verifies real token signatures.
    expect(allowSystemSwitchAuthorization(token(), now)).toBe(true)
    for (const header of [
      undefined,
      '',
      'Bearer invalid',
      token({ sub: 'someone-else' }),
      token({ aud: 'another-project' }),
      token({ iss: 'forged' }),
      token({ exp: now / 1000 - 1 }),
      token({}, 'none'),
    ])
      expect(allowSystemSwitchAuthorization(header, now)).toBe(false)
  })
})

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: '' } as { uid: string } | null },
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ auth: mocks.auth, db: {} }),
}))
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  collection: (_db: unknown, name: string) => name,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  updateDoc: mocks.updateDoc,
}))
import { changeSystemAccess, listSystems } from '../src/data/firebase-system-access'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.currentUser = { uid: systemSwitcherUid }
  mocks.getDoc.mockImplementation(async (path: string) => ({
    exists: () => true,
    data: () =>
      path.startsWith('users/')
        ? { access: 'club-a', displayName: 'Staff', rank: 9 }
        : { businessName: 'Club B' },
  }))
  mocks.updateDoc.mockResolvedValue(undefined)
})
describe('system access service', () => {
  it('does not read or write for any other account or signed-out session', async () => {
    for (const user of [null, { uid: 'another-user' }]) {
      mocks.auth.currentUser = user
      await expect(listSystems()).rejects.toThrow('cannot switch')
      await expect(changeSystemAccess('club-b')).rejects.toThrow('cannot switch')
    }
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })
  it('lists system IDs and labels without writing or exposing other fields', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [{ id: 'club-b', data: () => ({ businessName: 'Club B', unrelated: 'private' }) }],
    })
    await expect(listSystems()).resolves.toEqual([{ id: 'club-b', name: 'Club B' }])
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })
  it('updates only access after verifying the target and profile exist', async () => {
    await changeSystemAccess('club-b')
    expect(mocks.getDoc.mock.calls).toEqual([['system/club-b'], [`users/${systemSwitcherUid}`]])
    expect(mocks.updateDoc.mock.calls).toEqual([
      [`users/${systemSwitcherUid}`, { access: 'club-b' }],
    ])
  })
  it('does not write an unchanged selection', async () => {
    await changeSystemAccess('club-a')
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })
  it('rejects invalid and missing target systems and missing profiles', async () => {
    for (const id of ['', ' ', 'bad/path', '.', '..', '__hidden__'])
      await expect(changeSystemAccess(id)).rejects.toThrow('valid system')
    mocks.getDoc.mockResolvedValue({ exists: () => false })
    await expect(changeSystemAccess('missing')).rejects.toThrow('no longer exists')
    mocks.getDoc.mockResolvedValueOnce({ exists: () => true })
    await expect(changeSystemAccess('club-b')).rejects.toThrow('profile')
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })
  it('rechecks authentication before writing and preserves denied errors', async () => {
    mocks.getDoc.mockImplementation(async () => {
      mocks.auth.currentUser = { uid: 'someone-else' }
      return { exists: () => true, data: () => ({ access: 'club-a' }) }
    })
    await expect(changeSystemAccess('club-b')).rejects.toThrow('cannot switch')
    expect(mocks.updateDoc).not.toHaveBeenCalled()
    mocks.auth.currentUser = { uid: systemSwitcherUid }
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ access: 'club-a' }) })
    mocks.updateDoc.mockRejectedValue({ code: 'permission-denied' })
    await expect(changeSystemAccess('club-b')).rejects.toEqual({ code: 'permission-denied' })
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1)
  })
})
