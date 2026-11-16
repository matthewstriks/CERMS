import { expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  listeners: [] as {
    target: any
    next: (s: any) => void
    error: () => void
    stop: ReturnType<typeof vi.fn>
  }[],
  auth: { currentUser: { uid: 'me' } },
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ auth: mock.auth }),
}))
vi.mock('../src/data/firebase-live', () => ({ getLiveDatabase: () => ({}) }))
vi.mock('firebase/auth', () => ({ onAuthStateChanged: () => () => {} }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (value: number) => ({ limit: value }),
  query: (path: string, ...constraints: unknown[]) => ({ path, constraints }),
  startAfter: vi.fn(),
  getDocsFromServer: vi.fn(),
  onSnapshot: (target: unknown, _options: unknown, next: (s: any) => void, error: () => void) => {
    const stop = vi.fn()
    mock.listeners.push({ target, next, error, stop })
    return stop
  },
}))
import { createMessaging } from '../src/data/firebase-messaging'
const snapshot = (rows: Record<string, unknown>[], fromCache = false, offset = 0) => ({
  metadata: { fromCache },
  size: rows.length,
  docs: rows.map((row, i) => ({ id: String(i + offset), data: () => row })),
})
function connect() {
  mock.listeners.length = 0
  const receive = vi.fn(),
    incoming = vi.fn()
  const stop = createMessaging({ uid: 'me', club: 'dev' }).subscribeUnreadCount(receive, incoming)
  const profile = mock.listeners[0]!
  profile.next({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ uid: 'me', access: 'dev' }),
  })
  return { receive, incoming, stop, profile, chats: mock.listeners[1]! }
}
it('counts every paged conversation within the deployed limit, follows watermarks and stops on revoked access', () => {
  const { receive, incoming, stop, profile, chats } = connect()
  expect(chats.target.constraints).toContainEqual({ limit: 50 })
  const first = Array.from({ length: 50 }, () => ({ lastSequence: 0, readBy: {} }))
  chats.next(snapshot(first))
  const older = mock.listeners[2]!
  expect(older.target.constraints).toContainEqual({ limit: 50 })
  const oldChat = { lastSequence: 4, readBy: { me: { sequence: 1 } } }
  older.next(snapshot([oldChat], false, 50))
  const unread = mock.listeners[3]!
  expect(unread.target.path).toBe('system/dev/staffChats/50/messages')
  unread.next(
    snapshot([
      { sequence: 2, senderUid: 'other' },
      { sequence: 3, senderUid: 'me' },
      { sequence: 4, senderUid: 'other' },
    ]),
  )
  expect(receive).toHaveBeenLastCalledWith(2)
  expect(incoming).not.toHaveBeenCalled()
  chats.next(snapshot(first))
  expect(mock.listeners).toHaveLength(4)
  unread.next(snapshot([{ sequence: 2, senderUid: 'other' }], true))
  expect(receive).toHaveBeenLastCalledWith(0)
  unread.next(snapshot([{ sequence: 5, senderUid: 'other' }]))
  expect(receive).toHaveBeenLastCalledWith(1)
  expect(incoming).toHaveBeenCalledOnce()
  unread.next(snapshot([{ sequence: 5, senderUid: 'other' }]))
  expect(incoming).toHaveBeenCalledOnce()
  older.next(
    snapshot([{ ...oldChat, lastSequence: 5, readBy: { me: { sequence: 5 } } }], false, 50),
  )
  expect(unread.stop).toHaveBeenCalledOnce()
  expect(receive).toHaveBeenLastCalledWith(0)
  unread.next(snapshot([{ sequence: 6, senderUid: 'other' }]))
  expect(incoming).toHaveBeenCalledOnce()
  profile.error()
  expect(older.stop).toHaveBeenCalledOnce()
  expect(chats.stop).toHaveBeenCalledOnce()
  stop()
  expect(profile.stop).toHaveBeenCalledOnce()
})
it('alerts once on new incoming messages, including new chats/read-immediately messages; not history, outgoing or reconnect replay', () => {
  const { chats, incoming, stop } = connect()
  chats.next(snapshot([]))
  const chat = { lastSequence: 1, lastMessage: { senderUid: 'other' }, readBy: {} }
  chats.next(snapshot([chat]))
  expect(incoming).toHaveBeenCalledOnce()
  const unread = mock.listeners[2]!
  unread.next(snapshot([{ sequence: 1, senderUid: 'other' }]))
  expect(incoming).toHaveBeenCalledOnce()
  chats.next(snapshot([{ ...chat, lastSequence: 2, lastMessage: { senderUid: 'me' } }]))
  unread.next(
    snapshot([
      { sequence: 1, senderUid: 'other' },
      { sequence: 2, senderUid: 'me' },
    ]),
  )
  expect(incoming).toHaveBeenCalledOnce()
  chats.next(snapshot([], true))
  chats.next(snapshot([{ ...chat, lastSequence: 2, lastMessage: { senderUid: 'me' } }]))
  mock.listeners[3]!.next(
    snapshot([
      { sequence: 1, senderUid: 'other' },
      { sequence: 2, senderUid: 'me' },
    ]),
  )
  expect(incoming).toHaveBeenCalledOnce()
  chats.next(snapshot([{ ...chat, lastSequence: 3, readBy: { me: { sequence: 3 } } }]))
  expect(incoming).toHaveBeenCalledTimes(2)
  stop()
})
it('rebinds later conversation pages when a live ordering boundary changes', () => {
  const { chats, stop } = connect()
  const first = Array.from({ length: 50 }, () => ({
    lastSequence: 0,
    readBy: {},
    updatedAt: { seconds: 1, nanoseconds: 0 },
  }))
  chats.next(snapshot(first))
  const older = mock.listeners[2]!
  older.next(snapshot([]))
  first[49]!.updatedAt.nanoseconds = 1
  chats.next(snapshot(first))
  expect(older.stop).toHaveBeenCalledOnce()
  expect(mock.listeners).toHaveLength(4)
  stop()
  expect(mock.listeners[3]!.stop).toHaveBeenCalledOnce()
})
