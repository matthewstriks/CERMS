import assert from 'node:assert/strict'
export const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
  business = 'club-a',
  registerId = '10000000-0000-4000-8000-000000000001'
export function posFixture() {
  const docs = new Map([
    ['users/' + owner, { uid: owner, access: business, displayName: 'Matthew Test Striks' }],
    ['system/' + business, { businessName: 'Synthetic Club', taxRate: 0.08 }],
    [
      `system/${business}/registers/${registerId}`,
      { status: 'open', ownerUid: owner, openingTotalCents: 10000 },
    ],
    [`system/${business}/registerOwners/${owner}`, { registerId }],
    [
      `system/${business}/products/retail`,
      {
        name: 'Test retail',
        cat: 'retail',
        barcode: '12345',
        active: true,
        restricted: false,
        priceCents: 1000,
        version: 1,
        inventory: 10,
        taxable: true,
        payout: false,
        membership: false,
        rental: false,
        askforprice: false,
      },
    ],
  ])
  let commits = 0
  const fail = (code, message) => {
    throw Object.assign(new Error(message), { code })
  }
  const deps = {
    fail,
    timestamp: () => ({ timestampValue: '2026-10-01T12:00:00Z' }),
    db: {
      doc: (p) => p,
      collection: (path) => {
        const build = (state) => ({
          ...state,
          where: (field, op, value) => build({ ...state, field, op, value }),
          orderBy: (orderField, direction = 'asc') => build({ ...state, orderField, direction }),
          startAfter: (cursor) =>
            build({ ...state, cursor: typeof cursor === 'number' ? cursor : cursor.id }),
          limit: (count) => build({ ...state, count }),
        })
        return build({ path })
      },
      runTransaction: async (fn) => {
        let writing = false
        const writes = []
        const result = await fn({
          get: async (p) => {
            assert.equal(writing, false, 'All reads must precede writes')
            if (typeof p === 'object') {
              let rows = [...docs].filter(
                ([path, d]) =>
                  path.startsWith(p.path + '/') &&
                  !path.slice(p.path.length + 1).includes('/') &&
                  (!p.field ||
                    (p.op === 'array-contains'
                      ? d[p.field]?.includes(p.value)
                      : d[p.field] === p.value)),
              )
              rows.sort(([a, ad], [b, bd]) => {
                const av = ad[p.orderField],
                  bv = bd[p.orderField]
                const compare =
                  (typeof av === 'number' && typeof bv === 'number' ? av - bv : 0) ||
                  a.localeCompare(b)
                return compare * (p.direction === 'desc' ? -1 : 1)
              })
              if (typeof p.cursor === 'number')
                rows = rows.filter(([, d]) =>
                  p.direction === 'desc' ? d[p.orderField] < p.cursor : d[p.orderField] > p.cursor,
                )
              else if (p.cursor)
                rows = rows.slice(
                  rows.findIndex(([path]) => path.slice(p.path.length + 1) === p.cursor) + 1,
                )
              return {
                docs: rows
                  .slice(0, p.count ?? Infinity)
                  .map(([path, d]) => ({
                    id: path.slice(p.path.length + 1),
                    data: () => structuredClone(d),
                  })),
              }
            }
            return {
              id: p.slice(p.lastIndexOf('/') + 1),
              exists: docs.has(p),
              data: () => structuredClone(docs.get(p)),
            }
          },
          delete: (p) => {
            writing = true
            writes.push([p, undefined])
          },
          create: (p, d) => {
            assert.ok(!docs.has(p))
            writing = true
            writes.push([p, d])
          },
          set: (p, d) => {
            writing = true
            writes.push([p, d])
          },
          update: (p, d) => {
            assert.ok(docs.has(p))
            writing = true
            writes.push([p, { ...docs.get(p), ...d }])
          },
        })
        for (const [p, d] of writes) {
          if (d === undefined) docs.delete(p)
          else docs.set(p, d)
        }
        if (writes.length) commits++
        return result
      },
    },
  }
  const request = {
    auth: { uid: owner },
    data: {
      business,
      requestId: '20000000-0000-4000-8000-000000000001',
      registerId,
      lines: [{ productId: 'retail', version: 1, quantity: 2, unitPriceCents: 1000 }],
      payments: [
        { method: 'cash', amountCents: 1000, receivedCents: 2000, reference: '' },
        { method: 'card', amountCents: 1160, receivedCents: 1160, reference: 'terminal-123' },
      ],
      taxRateBps: 800,
      note: '',
      customerName: '',
    },
  }
  return { docs, deps, request, commits: () => commits }
}
