import { beforeEach, expect, it, vi } from 'vitest'
import { devCreatorUid } from '../src/shared/dev-member-policy'
const mock = vi.hoisted(() => ({
  getDoc: vi.fn(),
  fetch: vi.fn(),
  uid: 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
}))
vi.mock('firebase/firestore/lite', () => ({
  doc: (_: unknown, ...segments: string[]) => segments.join('/'),
  getDoc: mock.getDoc,
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({
    db: {},
    auth: { currentUser: { uid: mock.uid, getIdToken: async () => 'synthetic' } },
  }),
}))
import { createMemberLog } from '../src/data/firebase-member-log'
const reader = {
  uid: devCreatorUid,
  club: 'dev',
  staffName: 'Untrusted client name',
  list: vi.fn(),
  history: vi.fn(),
  close: vi.fn(),
}
const eventId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  mock.uid = devCreatorUid
  mock.getDoc
    .mockReset()
    .mockImplementation(async (path: string) => ({
      exists: () => path.startsWith('users/'),
      data: () => ({ access: 'dev', displayName: 'Saved staff name' }),
    }))
  mock.fetch.mockReset().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', mock.fetch)
})
it('uses saved staff identity and the same event ID for an uncertain write', async () => {
  mock.fetch.mockRejectedValue(new Error('response lost'))
  mock.getDoc.mockImplementation(async (path: string) => ({
    exists: () => true,
    data: () =>
      path.startsWith('users/')
        ? { access: 'dev', displayName: 'Saved staff name' }
        : { type: 'member.viewed', actorUid: devCreatorUid },
  }))
  await expect(createMemberLog(reader, 'member').viewed(eventId)).resolves.toBeUndefined()
  const body = JSON.parse(mock.fetch.mock.calls[0]![1].body)
  expect(body.writes[0].update.fields.actorName.stringValue).toBe('Saved staff name')
  expect(body.writes[0].update.name).toContain('/member/events/' + eventId)
})
it('does not silently accept a failed view without a saved event', async () => {
  mock.fetch.mockResolvedValue({ ok: false })
  await expect(createMemberLog(reader, 'member').viewed(eventId)).rejects.toThrow(
    'could not be recorded',
  )
})
it('blocks changed business access before sending a view', async () => {
  mock.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ access: 'other' }) })
  await expect(createMemberLog(reader, 'member').viewed(eventId)).rejects.toThrow('system changed')
  expect(mock.fetch).not.toHaveBeenCalled()
})
it('does not enable logging for other staff or businesses', async () => {
  await expect(
    createMemberLog({ ...reader, club: 'TheZSATX' }, 'member').viewed(eventId),
  ).rejects.toThrow('Dev System')
  mock.uid = 'other'
  await expect(createMemberLog(reader, 'member').viewed(eventId)).rejects.toThrow('Dev System')
  expect(mock.fetch).not.toHaveBeenCalled()
})
