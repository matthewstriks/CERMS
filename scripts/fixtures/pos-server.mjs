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
      runTransaction: async (fn) => {
        let writing = false
        const writes = []
        const result = await fn({
          get: async (p) => {
            assert.equal(writing, false, 'All reads must precede writes')
            return { exists: docs.has(p), data: () => structuredClone(docs.get(p)) }
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
        for (const [p, d] of writes) docs.set(p, d)
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
