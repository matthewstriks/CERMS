import { beforeEach, expect, it, vi } from 'vitest'
import { emptyCashCounts } from '../src/domain/registers'
const mock = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  fetch: vi.fn(),
  uid: 'staff',
  data: new Map<string, any>(),
}))
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDoc: mock.getDoc,
  getDocs: mock.getDocs,
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (...args: unknown[]) => ['orderBy', ...args],
  limit: (n: number) => ['limit', n],
  startAfter: (snapshot: unknown) => ['startAfter', snapshot],
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({
    db: {},
    auth: { currentUser: { uid: mock.uid, getIdToken: async () => 'synthetic' } },
  }),
}))
import { createRegisters } from '../src/data/firebase-registers'
const id = '20000000-0000-4000-8000-000000000001'
const path = `system/club-a/registers/${id}`
const record = () => ({
  schemaVersion: 1,
  status: 'open',
  ownerUid: 'staff',
  ownerName: 'Staff',
  openingCounts: emptyCashCounts(),
  openingTotalCents: 0,
  openedAt: { toMillis: () => 1000 },
  closingCounts: null,
  closingTotalCents: null,
  closedAt: null,
  closeNote: '',
})
const client = () => createRegisters({ uid: 'staff', club: 'club-a' })
beforeEach(() => {
  mock.uid = 'staff'
  mock.data.clear()
  mock.data.set('users/staff', { uid: 'staff', access: 'club-a', displayName: 'Staff' })
  mock.getDoc.mockReset().mockImplementation(async (path: string) => ({
    id: path.split('/').at(-1),
    exists: () => mock.data.has(path),
    data: () => mock.data.get(path),
  }))
  mock.getDocs.mockReset().mockResolvedValue({ docs: [], size: 0 })
  mock.fetch.mockReset().mockResolvedValue({ status: 200 })
  vi.stubGlobal('fetch', mock.fetch)
})
it('opens atomically without updating a user profile and closes only its register', async () => {
  await client().open(id, emptyCashCounts())
  let writes = JSON.parse(mock.fetch.mock.calls[0]![1].body).writes
  expect(writes.map((write: any) => write.update.name.split('/documents/')[1])).toEqual([
    path,
    'system/club-a/registerOwners/staff',
  ])
  mock.data.set(path, record())
  await client().close(id, emptyCashCounts(), '')
  writes = JSON.parse(mock.fetch.mock.calls[1]![1].body).writes
  expect(writes).toHaveLength(1)
  expect(writes[0].updateMask.fieldPaths).not.toContain('openingCounts')
})
it('rejects a second open, another owner close, and a changed business without writing', async () => {
  mock.data.set('system/club-a/registerOwners/staff', { registerId: id })
  mock.data.set(path, record())
  await expect(
    client().open('20000000-0000-4000-8000-000000000002', emptyCashCounts()),
  ).rejects.toThrow('already have')
  mock.data.set(path, { ...record(), ownerUid: 'other' })
  await expect(client().close(id, emptyCashCounts(), '')).rejects.toThrow('permission')
  mock.data.set('users/staff', { uid: 'staff', access: 'club-b', displayName: 'Staff' })
  await expect(client().open(id, emptyCashCounts())).rejects.toThrow('access changed')
  expect(mock.fetch).not.toHaveBeenCalled()
})
it('confirms a lost response by reading the same immutable register', async () => {
  mock.fetch.mockImplementation(async () => {
    mock.data.set(path, record())
    throw new Error('lost response')
  })
  await client().open(id, emptyCashCounts())
  await client().open(id, emptyCashCounts())
  expect(mock.fetch).toHaveBeenCalledTimes(1)
  await expect(client().open(id, { ...emptyCashCounts(), bill1: 1 })).rejects.toThrow(
    'different details',
  )
})
it('keeps closed records idempotent and rejects changed ending counts', async () => {
  mock.data.set(path, {
    ...record(),
    status: 'closed',
    closingCounts: emptyCashCounts(),
    closingTotalCents: 0,
    closedAt: { toMillis: () => 2000 },
  })
  await client().close(id, emptyCashCounts(), '')
  await expect(client().close(id, { ...emptyCashCounts(), coin1: 1 }, '')).rejects.toThrow(
    'different values',
  )
  expect(mock.fetch).not.toHaveBeenCalled()
})
it('uses business-scoped, bounded chronological queries', async () => {
  await client().list('open')
  expect(mock.getDocs).toHaveBeenCalledWith([
    'system/club-a/registers',
    ['where', 'status', '==', 'open'],
    ['orderBy', 'openedAt', 'desc'],
    ['limit', 50],
  ])
})

it('closes another staff register with independent permission and records the actual closer', async () => {
  mock.data.set('system/club-a/staffPermissions/staff', {
    permissions: {
      editMembers: false,
      deleteMembers: false,
      manageProducts: false,
      openRegisters: false,
      closeRegisters: false,
      closeOtherRegisters: true,
    },
  })
  mock.data.set(path, { ...record(), ownerUid: 'other' })
  await client().close(id, emptyCashCounts(), 'Left early')
  const writes = JSON.parse(mock.fetch.mock.calls[0]![1].body).writes
  expect(writes).toHaveLength(1)
  expect(writes[0].update.fields.closedByUid).toEqual({ stringValue: 'staff' })
  expect(writes[0].update.fields.closedByName).toEqual({ stringValue: 'Staff' })
  expect(writes[0].updateMask.fieldPaths).not.toContain('ownerUid')
})
