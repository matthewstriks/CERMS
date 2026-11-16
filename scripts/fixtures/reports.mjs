// Synthetic data only. No credentials, network requests, or production writes.
import { completeSale } from '../../functions/pos.mjs'
import { emptyCounts } from './registers.mjs'
export async function seedReports({ fixture, uid, club, registerId }) {
  const docs = fixture.docs,
    now = Date.now()
  await completeSale(fixture.request, fixture.deps)
  const savedPath = `system/${club}/sales/${fixture.request.data.requestId}`
  const base = structuredClone(docs.get(savedPath))
  docs.delete(savedPath)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 59)
  const key = (i) => `70000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  for (let i = 0; i < 53; i++) {
    const id = key(i)
    const sale = structuredClone(base)
    sale.createdAt = {
      timestampValue: new Date(i === 52 ? +start + 3600000 : now - i * 1000).toISOString(),
    }
    sale.receiptNumber = id
    sale.cashierName = i % 2 ? '=Saved Staff' : 'Sample Cashier'
    sale.cashierUid = i % 2 ? uid : 'second-cashier'
    sale.lines[0].name = 'Saved retail product'
    docs.set(`system/${club}/sales/${id}`, sale)
  }
  const payout = structuredClone(base)
  Object.assign(payout, {
    receiptNumber: key(53),
    subtotalCents: -200,
    taxCents: -16,
    totalCents: -216,
    createdAt: { timestampValue: new Date(now).toISOString() },
  })
  payout.lines = [
    {
      ...payout.lines[0],
      productId: 'payout',
      name: 'Recorded payout',
      quantity: 1,
      unitPriceCents: 200,
      subtotalCents: -200,
      taxCents: -16,
      totalCents: -216,
      payout: true,
    },
  ]
  payout.payments = [
    {
      method: 'cash',
      direction: 'out',
      amountCents: 216,
      receivedCents: 216,
      changeCents: 0,
      reference: '',
    },
  ]
  docs.set(`system/${club}/sales/${key(53)}`, payout)
  docs.set('members/report-active', {
    access: club,
    name: 'Upcoming Member',
    id_number: 101,
    membership_type: 'Monthly',
    id_expiration: Math.floor(now / 1000) + 3 * 86400,
    dna: false,
    creation_time: { timestampValue: new Date(now).toISOString() },
    idnum: 'PRIVATE-GOVERNMENT-ID',
    notes: ['Do not export this note'],
  })
  docs.set('members/report-expired', {
    access: club,
    name: 'Expired Member',
    id_number: 102,
    id_expiration: Math.floor(now / 1000) - 86400,
    dna: false,
  })
  docs.set('members/report-dna', {
    access: club,
    name: 'DNA Member',
    id_number: 103,
    id_expiration: Math.floor(now / 1000) + 86400,
    dna: true,
  })
  docs.set('members/report-foreign', {
    access: 'other',
    name: 'Foreign Member',
    id_expiration: Math.floor(now / 1000) + 86400,
  })
  for (let i = 0; i < 3; i++)
    docs.set(`activity/report-rental-${i}`, {
      access: club,
      memberID: 'report-active',
      timeIn: {
        timestampValue: new Date(i === 2 ? +start + 3600000 : now - 3600000).toISOString(),
      },
      active: i !== 1,
      goingInactive: false,
      currIn: i === 0,
      waitlist: i === 2,
      lockerRoomStatus: [true, String(i), 'Room', 'room', 0, Math.floor(now / 1000) - 100],
    })
  docs.set('activity/not-a-rental', {
    access: club,
    memberID: 'report-active',
    timeIn: { timestampValue: new Date(now).toISOString() },
    lockerRoomStatus: [false],
  })
  const closedId = '80000000-0000-4000-8000-000000000001'
  docs.set(`system/${club}/registers/${closedId}`, {
    ...structuredClone(docs.get(`system/${club}/registers/${registerId}`)),
    status: 'closed',
    openingCounts: { ...emptyCounts(), bill20: 2, bill10: 1 },
    openingTotalCents: 5000,
    closingCounts: { ...emptyCounts(), bill20: 3, bill10: 1 },
    closingTotalCents: 7000,
    closedAt: { timestampValue: new Date(now).toISOString() },
    closedByUid: uid,
    closedByName: 'Sample Closer',
  })
  docs.set(`system/${club}/registerTotals/${closedId}`, { saleCount: 5, expectedCashCents: 6900 })
}
// Minimal read-only Firestore structured-query interpreter for intercepted UI tests.
export function reportQuery(docs, body, base, parent) {
  const q = body.structuredQuery,
    collection = q.from[0].collectionId
  const decode = (v) =>
    v == null
      ? null
      : 'timestampValue' in v
        ? Date.parse(v.timestampValue)
        : 'integerValue' in v
          ? Number(v.integerValue)
          : 'booleanValue' in v
            ? v.booleanValue
            : 'referenceValue' in v
              ? v.referenceValue
              : 'stringValue' in v
                ? v.stringValue
                : null
  const field = (path, data, name) =>
    name === '__name__'
      ? `${base}/${path}`
      : data[name]?.timestampValue
        ? Date.parse(data[name].timestampValue)
        : (data[name] ?? null)
  const matches = (p, d, f) => {
    if (!f) return true
    if (f.compositeFilter)
      return f.compositeFilter.op === 'OR'
        ? f.compositeFilter.filters.some((x) => matches(p, d, x))
        : f.compositeFilter.filters.every((x) => matches(p, d, x))
    const { field: key, op, value } = f.fieldFilter,
      actual = field(p, d, key.fieldPath),
      target = decode(value)
    return op === 'EQUAL'
      ? actual === target
      : op === 'GREATER_THAN_OR_EQUAL'
        ? actual !== null && actual >= target
        : op === 'LESS_THAN'
          ? actual !== null && actual < target
          : false
  }
  const orders = [...(q.orderBy ?? [])]
  if (!orders.some((o) => o.field.fieldPath === '__name__'))
    orders.push({ field: { fieldPath: '__name__' }, direction: 'ASCENDING' })
  const compare = (a, b) => (a === b ? 0 : a < b ? -1 : 1)
  let rows = [...docs].filter(
    ([p, d]) =>
      p.startsWith(`${parent}${collection}/`) &&
      !p.slice(`${parent}${collection}/`.length).includes('/') &&
      matches(p, d, q.where),
  )
  rows.sort(([pa, da], [pb, db]) => {
    for (const o of orders) {
      const result =
        compare(field(pa, da, o.field.fieldPath), field(pb, db, o.field.fieldPath)) *
        (o.direction === 'DESCENDING' ? -1 : 1)
      if (result) return result
    }
    return 0
  })
  if (q.startAt)
    rows = rows.filter(([p, d]) => {
      for (let i = 0; i < q.startAt.values.length; i++) {
        const o = orders[i],
          c =
            compare(field(p, d, o.field.fieldPath), decode(q.startAt.values[i])) *
            (o.direction === 'DESCENDING' ? -1 : 1)
        if (c) return c > 0
      }
      return q.startAt.before
    })
  return rows.slice(0, q.limit ?? rows.length).map(([p]) => p)
}
