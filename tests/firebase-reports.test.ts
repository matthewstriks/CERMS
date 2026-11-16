import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  data: new Map<string, Record<string, any>>(),
  access: 'dev',
  uid: 'staff',
  queries: [] as any[],
  big: false,
  revoke: false,
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ db: {}, auth: { currentUser: { uid: mock.uid } } }),
}))
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  where: (...args: any[]) => ({ kind: 'where', args }),
  orderBy: (...args: any[]) => ({ kind: 'order', args }),
  startAfter: (row: any) => ({ kind: 'cursor', row }),
  limit: (n: number) => ({ kind: 'limit', n }),
  query: (path: string, ...constraints: any[]) => ({ path, constraints }),
  getDoc: async (path: string) => ({
    exists: () => path.startsWith('users/') || mock.data.has(path),
    data: () =>
      path.startsWith('users/') ? { uid: 'staff', access: mock.access } : mock.data.get(path),
  }),
  getDocs: async (q: any) => {
    mock.queries.push(q)
    const cursor = q.constraints.find((c: any) => c.kind === 'cursor')?.row
    const size = q.constraints.find((c: any) => c.kind === 'limit').n
    let rows: any[]
    if (mock.big && q.path === 'members') {
      const offset = cursor ? Number(cursor.id) + 1 : 0
      rows = Array.from({ length: Math.min(size, 20001 - offset) }, (_, i) => ({
        id: String(offset + i),
        data: () => ({ access: 'dev' }),
      }))
    } else {
      const raw = [...mock.data]
        .filter(([p]) => p.startsWith(q.path + '/') && !p.slice(q.path.length + 1).includes('/'))
        .filter(([, d]) =>
          q.constraints
            .filter((c: any) => c.kind === 'where')
            .every((c: any) => {
              const [key, op, target] = c.args
              const value = d[key]?.toMillis?.() ?? d[key],
                compare = target instanceof Date ? +target : target
              return op === '=='
                ? value === compare
                : op === '>='
                  ? value >= compare
                  : value < compare
            }),
        )
        .sort(([a], [b]) => a.localeCompare(b))
      const offset = cursor ? raw.findIndex(([p]) => p.endsWith('/' + cursor.id)) + 1 : 0
      rows = raw
        .slice(offset, offset + size)
        .map(([p, data]) => ({ id: p.split('/').at(-1), data: () => data }))
    }
    if (mock.revoke) mock.access = 'foreign'
    return { size: rows.length, docs: rows }
  },
}))
import { createReports } from '../src/data/firebase-reports'
import { reportRange } from '../src/domain/reports'
const range = reportRange('2026-11-01', '2026-11-02')
const load = (signal = new AbortController().signal) =>
  createReports({ uid: 'staff', club: 'dev' }).load(range, signal)
const timestamp = (value: number) => ({ seconds: value / 1000, toMillis: () => value })
beforeEach(() => {
  mock.data.clear()
  mock.access = 'dev'
  mock.uid = 'staff'
  mock.queries.length = 0
  mock.big = false
  mock.revoke = false
})
it('reads every page with business scope and bounded queries, strips private profile fields, and ignores non-rental activity', async () => {
  for (let i = 0; i < 51; i++)
    mock.data.set(`members/${String(i).padStart(3, '0')}`, {
      access: 'dev',
      name: 'Member',
      id_number: i,
      idnum: 'PRIVATE-ID',
      notes: ['Private'],
      id_expiration: 2000000000,
    })
  mock.data.set('members/foreign', { access: 'other', name: 'Foreign' })
  mock.data.set('activity/rental', {
    access: 'dev',
    memberID: '000',
    lockerRoomStatus: [true, 'A', 'Room', '', 0, 2000000000],
    timeIn: timestamp(range.start),
    active: true,
    currIn: true,
  })
  mock.data.set('activity/nonrental', { access: 'dev', lockerRoomStatus: [false] })
  const data = await load()
  expect(data.members.rows).toHaveLength(51)
  expect(data.members.rows?.[0]).not.toHaveProperty('idnum')
  expect(data.members.rows?.[0]).not.toHaveProperty('notes')
  expect(data.rentals.rows).toHaveLength(1)
  expect(data.rentals.rows?.[0]?.enteredAt).toBe(range.start)
  expect(mock.queries.filter((q) => q.path === 'members')).toHaveLength(2)
  for (const q of mock.queries) {
    expect(q.constraints).toContainEqual({ kind: 'limit', n: 50 })
    if (['members', 'activity'].includes(q.path))
      expect(q.constraints).toContainEqual({ kind: 'where', args: ['access', '==', 'dev'] })
    else expect(q.path).toMatch(/^system\/dev\/(sales|registers)$/)
  }
})
it('queries both financial periods but only closeouts in the selected period', async () => {
  await load()
  expect(mock.queries.find((q) => q.path.endsWith('/sales')).constraints).toContainEqual({
    kind: 'where',
    args: ['createdAt', '>=', new Date(range.previousStart)],
  })
  expect(mock.queries.find((q) => q.path.endsWith('/registers')).constraints).toContainEqual({
    kind: 'where',
    args: ['closedAt', '>=', new Date(range.start)],
  })
})
it('rejects foreign/unsupported receipts without replacing another report with false zero totals', async () => {
  mock.data.set('system/dev/sales/foreign', {
    business: 'other',
    createdAt: timestamp(range.start),
    schemaVersion: 1,
    status: 'completed',
    lines: [],
    payments: [],
  })
  const data = await load()
  expect(data.sales.error).toContain('unsupported format')
  expect(data.sales.rows).toBeUndefined()
  expect(data.members.rows).toEqual([])
})
it('fails the whole response on access revocation, and cancels before any query when aborted', async () => {
  mock.revoke = true
  await expect(load()).rejects.toThrow('business access changed')
  mock.access = 'dev'
  mock.queries.length = 0
  const controller = new AbortController()
  controller.abort()
  await expect(load(controller.signal)).rejects.toThrow()
  expect(mock.queries).toHaveLength(0)
})
it('rejects an oversized source instead of reporting truncated totals', async () => {
  mock.big = true
  const data = await load()
  expect(data.members.error).toContain('No partial totals')
  expect(data.members.rows).toBeUndefined()
  expect(data.sales.rows).toEqual([])
})
