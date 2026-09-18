import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { admissionFromLegacy, rentalTime, rentalUrgency } from '../src/domain/admissions'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'

const mock = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'staff' } as { uid: string } | null, app: {} },
  listeners: [] as {
    target: any
    next: (value: any) => void
    error: (error: any) => void
    stop: ReturnType<typeof vi.fn>
  }[],
  authNext: (_user: any) => {},
  authStop: vi.fn(),
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ auth: mock.auth }),
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, next: (user: any) => void) => {
    mock.authNext = next
    return mock.authStop
  },
}))
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  memoryLocalCache: () => ({}),
  memoryEagerGarbageCollector: () => ({}),
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  collection: (_db: unknown, name: string) => name,
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (collection: string, ...filters: unknown[]) => ({ collection, filters }),
  onSnapshot: (
    target: any,
    _options: unknown,
    next: (value: any) => void,
    error: (value: any) => void,
  ) => {
    const stop = vi.fn()
    mock.listeners.push({ target, next, error, stop })
    return stop
  },
}))
import { subscribeAdmissions } from '../src/data/firebase-admissions'
const docSnapshot = (id: string, data: any, fromCache = false) => ({
  id,
  exists: () => !!data,
  data: () => data,
  metadata: { fromCache },
})
const visit = (overrides = {}) => ({
  access: 'club',
  active: true,
  memberID: 'm1',
  currIn: true,
  waitlist: false,
  timeIn: { seconds: 100 },
  lockerRoomStatus: [true, 12, 'Locker', 'staff', 100, 200],
  ...overrides,
})
const latest = (receive: ReturnType<typeof vi.fn>) => receive.mock.calls.at(-1)![0]
function start() {
  const receive = vi.fn()
  const stop = subscribeAdmissions({ uid: 'staff', club: 'club' }, receive)
  const profile = mock.listeners[0]!
  profile.next(docSnapshot('staff', { access: 'club' }))
  const activity = mock.listeners[1]!
  const update = (...documents: ReturnType<typeof docSnapshot>[]) =>
    activity.next({ docs: documents, metadata: { fromCache: false } })
  return { receive, stop, profile, activity, update }
}
beforeEach(() => {
  mock.listeners.length = 0
  mock.auth.currentUser = { uid: 'staff' }
  mock.authStop.mockClear()
})
describe('read-only admissions subscriptions', () => {
  it('uses the legacy active/system query, deduplicates members, and updates changes/removals', () => {
    const { receive, stop, activity, update } = start()
    expect(activity.target).toEqual({
      collection: 'activity',
      filters: [
        { field: 'active', op: '==', value: true },
        { field: 'access', op: '==', value: 'club' },
      ],
    })
    update(
      docSnapshot('v1', visit()),
      docSnapshot('v2', visit()),
      docSnapshot('checking-out', visit({ goingInactive: true })),
    )
    expect(mock.listeners.filter((item) => item.target === 'members/m1')).toHaveLength(1)
    const member = mock.listeners[2]!
    member.next(docSnapshot('m1', { access: 'club', name: 'Alex', id_number: 12 }))
    expect(latest(receive).status).toBe('live')
    expect(latest(receive).rows).toHaveLength(2)
    expect(latest(receive).rows[0].memberName).toBe('Alex')
    member.next(docSnapshot('m1', { access: 'club', name: 'Updated name' }))
    expect(latest(receive).rows[0].memberName).toBe('Updated name')
    update(docSnapshot('v1', visit({ waitlist: true, notes: 'New note', currIn: false })))
    expect(latest(receive).rows[0]).toMatchObject({
      waiting: true,
      inside: false,
      notes: 'New note',
    })
    update()
    expect(latest(receive).rows).toEqual([])
    expect(member.stop).toHaveBeenCalledTimes(1)
    member.next(docSnapshot('m1', { access: 'club', name: 'Late result' }))
    expect(latest(receive).rows).toEqual([])
    stop()
    expect(activity.stop).toHaveBeenCalledTimes(1)
    expect(mock.authStop).toHaveBeenCalledTimes(1)
  })
  it('waits for server-confirmed profile access and never introduces cached rows', () => {
    const receive = vi.fn()
    const stop = subscribeAdmissions({ uid: 'staff', club: 'club' }, receive)
    mock.listeners[0]!.next(docSnapshot('staff', { access: 'club' }, true))
    expect(mock.listeners).toHaveLength(1)
    expect(latest(receive).rows).toEqual([])
    mock.listeners[0]!.next(docSnapshot('staff', { access: 'club' }))
    mock.listeners[1]!.next({ docs: [docSnapshot('v1', visit())], metadata: { fromCache: true } })
    expect(latest(receive).rows).toEqual([])
    expect(latest(receive).status).toBe('reconnecting')
    stop()
  })
  it('clears records and stops listeners when access changes, authentication ends, or a query fails', () => {
    for (const failure of ['access', 'auth', 'query']) {
      mock.listeners.length = 0
      const { receive, profile, activity, update } = start()
      update(docSnapshot('v1', visit()))
      if (failure === 'access') profile.next(docSnapshot('staff', { access: 'another-club' }))
      else if (failure === 'auth') mock.authNext(null)
      else activity.error({ code: 'permission-denied' })
      expect(latest(receive)).toMatchObject({ rows: [], status: 'error' })
      expect(mock.listeners.every((listener) => listener.stop.mock.calls.length === 1)).toBe(true)
      const count = receive.mock.calls.length
      update(docSnapshot('late', visit()))
      expect(receive).toHaveBeenCalledTimes(count)
    }
  })
  it('handles missing, removed, denied, and cross-system members without leaking their data', () => {
    const { receive, update, stop } = start()
    update(
      docSnapshot('v1', visit()),
      docSnapshot('v2', visit({ removed: true, memberID: 'removed' })),
    )
    expect(mock.listeners.some((listener) => listener.target === 'members/removed')).toBe(false)
    const member = mock.listeners[2]!
    member.next(docSnapshot('m1', null))
    expect(latest(receive).rows.find((row: any) => row.id === 'v1').memberStatus).toBe('missing')
    member.next(docSnapshot('m1', { access: 'another-club', name: 'Do not expose' }))
    expect(JSON.stringify(latest(receive))).not.toContain('Do not expose')
    member.error({ code: 'permission-denied' })
    expect(latest(receive).rows.find((row: any) => row.id === 'v1').memberStatus).toBe(
      'unavailable',
    )
    stop()
  })
  it('rejects mismatched sessions and cross-system activity', () => {
    mock.auth.currentUser = { uid: 'other' }
    const receive = vi.fn()
    subscribeAdmissions({ uid: 'staff', club: 'club' }, receive)
    expect(latest(receive).status).toBe('error')
    expect(mock.listeners).toHaveLength(0)
    mock.auth.currentUser = { uid: 'staff' }
    const next = start()
    next.update(docSnapshot('v1', visit({ access: 'other' })))
    expect(latest(next.receive)).toMatchObject({ rows: [], status: 'error' })
  })
})
describe('admissions compatibility and write protection', () => {
  it('classifies rental alerts at the five-minute and expiration boundaries, including waitlisted rentals', () => {
    const visit = admissionFromLegacy(
      'id',
      {
        access: 'club',
        active: true,
        waitlist: true,
        lockerRoomStatus: [true, 1, 'Room', 'staff', 0, 600],
      },
      'club',
    )
    expect(rentalUrgency(visit, 299999)).toBe(null)
    expect(rentalUrgency(visit, 300000)).toBe('soon')
    expect(rentalUrgency(visit, 599999)).toBe('soon')
    expect(rentalUrgency(visit, 600000)).toBe('expired')
    expect(rentalUrgency({ ...visit, rentalEnabled: false }, 600000)).toBe(null)
    expect(rentalUrgency({ ...visit, active: false }, 600000)).toBe(null)
    expect(rentalUrgency({ ...visit, expiresAt: null }, 600000)).toBe(null)
  })
  it('decodes legacy rentals, ignores checkout-in-progress, and handles long countdowns', () => {
    const raw = visit({ notes: 'false', goingInactive: true })
    const before = JSON.stringify(raw)
    const result = admissionFromLegacy('id', raw, 'club')
    expect(result).toMatchObject({
      active: false,
      rentalEnabled: true,
      rentalStartedAt: 100000,
      expiresAt: 200000,
      notes: '',
    })
    expect(rentalTime(result, 210000)).toBe('0:00:10 overdue')
    expect(rentalTime({ ...result, expiresAt: 90061000 }, 0)).toBe('25:01:01')
    expect(rentalTime({ ...result, rentalEnabled: false }, 0)).toBe('—')
    expect(rentalTime({ ...result, waiting: true }, 0)).toBe('0:03:20')
    expect(JSON.stringify(raw)).toBe(before)
  })
  it('permits only the existing database Listen channel and continues blocking Write', () => {
    const base = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/'
    const suffix = '/channel?database=projects%2Fcerms-7af24%2Fdatabases%2Fcerms&VER=8'
    for (const method of ['GET', 'POST'])
      expect(allowFirebaseRequest(base + 'Listen' + suffix, method)).toBe(true)
    expect(allowFirebaseRequest(base + 'Listen/channel', 'POST')).toBe(false)
    expect(
      allowFirebaseRequest(
        (base + 'Listen' + suffix).replace('%2Fcerms&', '%2F(default)&'),
        'POST',
      ),
    ).toBe(false)
    expect(
      allowFirebaseRequest((base + 'Listen' + suffix).replace('cerms-7af24', 'other'), 'POST'),
    ).toBe(false)
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE'])
      expect(allowFirebaseRequest(base + 'Write' + suffix, method)).toBe(false)
    expect(readFileSync('src/data/firebase-admissions.ts', 'utf8')).not.toMatch(
      /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\b/,
    )
  })
})
