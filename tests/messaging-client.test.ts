import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'alice', getIdToken: async () => 'synthetic-token' }, app: {} },
  listeners: [] as any[],
  authListeners: [] as any[],
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ auth: mock.auth }),
}))
vi.mock('../src/data/firebase-live', () => ({ getLiveDatabase: () => ({}) }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: any) => {
    mock.authListeners.push(cb)
    return vi.fn()
  },
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, direction: string) => ({ field, direction }),
  limit: (count: number) => ({ count }),
  startAfter: (value: unknown) => ({ after: value }),
  query: (base: unknown, ...constraints: unknown[]) => ({ base, constraints }),
  getDocsFromServer: vi.fn(),
  onSnapshot: (target: any, _options: unknown, next: any, error: any) => {
    const stop = vi.fn()
    mock.listeners.push({ target, next, error, stop })
    return stop
  },
}))
import { createMessaging } from '../src/data/firebase-messaging'
const chatId = 'a'.repeat(64)
beforeEach(() => {
  mock.authListeners.forEach((fn) => fn(null))
  mock.listeners = []
  vi.restoreAllMocks()
})
it('reuses exactly the same send request after an uncertain response and clears it on confirmation', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { messageId: 'saved' } }),
    } as Response)
  const client = createMessaging({ uid: 'alice', club: 'dev' })
  await expect(client.send(chatId, 'Hello')).rejects.toThrow('Lost response')
  expect(client.pending(chatId)?.text).toBe('Hello')
  await expect(client.send(chatId, 'Changed')).rejects.toThrow('Retry')
  await client.send(chatId, 'Hello')
  expect(fetch.mock.calls[0]?.[1]?.body).toBe(fetch.mock.calls[1]?.[1]?.body)
  expect(client.pending(chatId)).toBeUndefined()
})
it('starts scoped subscriptions only after a fresh matching profile and drops access on reassignment', () => {
  const client = createMessaging({ uid: 'alice', club: 'dev' }),
    receive = vi.fn(),
    stop = client.subscribeChats(receive)
  const profile = mock.listeners[0]
  profile.next({ metadata: { fromCache: true } })
  expect(mock.listeners).toHaveLength(1)
  profile.next({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ uid: 'alice', access: 'dev' }),
  })
  expect(mock.listeners).toHaveLength(2)
  expect(mock.listeners[1].target.base.path).toBe('system/dev/staffChats')
  expect(mock.listeners[1].target.constraints).toContainEqual({
    field: 'participantUids',
    op: 'array-contains',
    value: 'alice',
  })
  expect(mock.listeners[1].target.constraints).toContainEqual({ count: 50 })
  profile.next({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ uid: 'alice', access: 'other' }),
  })
  expect(receive.mock.calls.at(-1)?.[0]).toMatchObject({ rows: [], status: 'error' })
  expect(mock.listeners[1].stop).toHaveBeenCalledOnce()
  stop()
  expect(profile.stop).toHaveBeenCalledOnce()
})
it('cached message snapshots never count as a fresh visible conversation', () => {
  const client = createMessaging({ uid: 'alice', club: 'dev' }),
    receive = vi.fn(),
    stop = client.subscribeMessages(chatId, receive)
  mock.listeners[0].next({ metadata: { fromCache: true }, docs: [], size: 0 })
  expect(receive).toHaveBeenLastCalledWith({ rows: [], status: 'reconnecting', more: false })
  mock.listeners[0].error(new Error('permission-denied'))
  expect(receive.mock.calls.at(-1)?.[0]).toMatchObject({ rows: [], status: 'error' })
  stop()
})
