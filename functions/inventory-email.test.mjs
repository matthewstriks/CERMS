import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inventoryEmailSettings,
  notifyInventory,
  inventorySettingsWritten,
} from './inventory-email.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
function fixture() {
  const docs = new Map(),
    meta = new Map(),
    emails = []
  let tick = 100
  const put = (path, data) => {
    docs.set(path, structuredClone(data))
    meta.set(path, {
      createTime: meta.get(path)?.createTime ?? { seconds: tick, nanoseconds: 0 },
      updateTime: { seconds: ++tick, nanoseconds: 0 },
    })
  }
  const snap = (path) => {
    const value = structuredClone(docs.get(path))
    return {
      id: path.split('/').at(-1),
      exists: docs.has(path),
      ...meta.get(path),
      data: () => structuredClone(value),
    }
  }
  const ref = (path) => ({ path, get: async () => snap(path) })
  const query = (path, cursor, count = 100) => ({
    orderBy: () => query(path, cursor, count),
    limit: (n) => query(path, cursor, n),
    startAfter: (c) => query(path, c.id, count),
    get: async () => {
      let paths = [...docs.keys()]
        .filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/'))
        .sort()
      if (cursor) paths = paths.filter((p) => p.split('/').at(-1) > cursor)
      const rows = paths.slice(0, count).map(snap)
      return { docs: rows, size: rows.length }
    },
  })
  let tail = Promise.resolve()
  const db = {
    doc: ref,
    collection: (path) => query(path),
    runTransaction: (fn) => {
      const run = tail.then(async () => {
        let writing = false
        const writes = []
        const result = await fn({
          get: async (r) => {
            assert.equal(writing, false)
            return snap(r.path)
          },
          set: (r, d) => {
            writing = true
            writes.push([r.path, d])
          },
          update: (r, d) => {
            writing = true
            writes.push([r.path, { ...docs.get(r.path), ...d }])
          },
        })
        for (const [p, d] of writes) put(p, d)
        return result
      })
      tail = run.catch(() => {})
      return run
    },
  }
  put('users/' + owner, { uid: owner, access: 'dev' })
  put('system/dev', { businessName: 'Synthetic Club' })
  const deps = {
    db,
    timestamp: () => ({ syntheticTimestamp: true }),
    fail: (code, message) => {
      throw Object.assign(Error(message), { code })
    },
    send: async (m) => {
      emails.push(m)
      return { accepted: m.to }
    },
  }
  const request = {
    auth: { uid: owner },
    data: {
      action: 'save',
      business: 'dev',
      enabled: true,
      recipients: ['a@example.test', 'b@example.test'],
      expectedRevision: 0,
    },
  }
  const product = (inventory, changes = {}) => ({
    name: 'Test <Towels>',
    active: true,
    payout: false,
    inventory,
    invWarning: 5,
    inventoryPar: 20,
    ...changes,
  })
  const change = (inventory, changes = {}) => {
    const before = snap('system/dev/products/towels')
    put('system/dev/products/towels', product(inventory, changes))
    return {
      business: 'dev',
      productId: 'towels',
      before,
      after: snap('system/dev/products/towels'),
    }
  }
  return { docs, put, snap, deps, request, emails, change }
}
test('owner config supports multiple addresses, stale/foreign/staff saves denied without modifying business records', async () => {
  const f = fixture()
  const saved = await inventoryEmailSettings(f.request, f.deps)
  assert.deepEqual(saved, {
    enabled: true,
    recipients: ['a@example.test', 'b@example.test'],
    revision: 1,
  })
  await assert.rejects(
    inventoryEmailSettings(
      { ...f.request, data: { ...f.request.data, recipients: ['c@example.test'] } },
      f.deps,
    ),
    { code: 'failed-precondition' },
  )
  await assert.rejects(inventoryEmailSettings({ ...f.request, auth: { uid: 'staff' } }, f.deps), {
    code: 'permission-denied',
  })
  await assert.rejects(
    inventoryEmailSettings({ ...f.request, data: { action: 'get', business: 'foreign' } }, f.deps),
    { code: 'permission-denied' },
  )
  assert.deepEqual(f.docs.get('users/' + owner), { uid: owner, access: 'dev' })
  assert.deepEqual(f.docs.get('system/dev'), { businessName: 'Synthetic Club' })
})
test('emails each recipient once per low-stock episode; zero triggers; recovery rearms even with delayed events', async () => {
  const f = fixture()
  await inventoryEmailSettings(f.request, f.deps)
  await notifyInventory(f.change(10), f.deps)
  const low = f.change(5)
  await Promise.all([notifyInventory(low, f.deps), notifyInventory(low, f.deps)])
  assert.equal(f.emails.length, 2)
  assert.deepEqual(
    f.emails.map((m) => m.to),
    [['a@example.test'], ['b@example.test']],
  )
  assert.match(f.emails[0].text, /Stock remaining: 5/)
  assert.match(f.emails[0].html, /Test &lt;Towels&gt;/)
  await notifyInventory(f.change(0), f.deps)
  assert.equal(f.emails.length, 2)
  const recovered = f.change(10)
  const secondLow = f.change(4)
  const laterLow = f.change(3)
  // Current-low update arrives before the recovery/crossing events.
  await notifyInventory(laterLow, f.deps)
  await notifyInventory(secondLow, f.deps)
  await notifyInventory(recovered, f.deps)
  assert.equal(f.emails.length, 4)
  await notifyInventory(secondLow, f.deps)
  assert.equal(f.emails.length, 4)
})
test('configuration scan checks existing lows; inactive/untracked/no-threshold/payout and disabled configs do not email', async () => {
  const f = fixture()
  await inventoryEmailSettings(f.request, f.deps)
  f.change(3)
  for (const [id, changes] of Object.entries({
    inactive: { active: false },
    untracked: { inventory: null },
    noWarning: { invWarning: null },
    payout: { payout: true },
  }))
    f.put('system/dev/products/' + id, {
      name: id,
      active: true,
      payout: false,
      inventory: 1,
      invWarning: 5,
      ...changes,
    })
  await inventorySettingsWritten('dev', f.deps)
  await inventorySettingsWritten('dev', f.deps)
  assert.equal(f.emails.length, 2)
  await inventoryEmailSettings(
    { ...f.request, data: { ...f.request.data, enabled: false, expectedRevision: 1 } },
    f.deps,
  )
  await notifyInventory(f.change(2), f.deps)
  assert.equal(f.emails.length, 2)
  await inventoryEmailSettings(
    { ...f.request, data: { ...f.request.data, enabled: true, expectedRevision: 2 } },
    f.deps,
  )
  await inventorySettingsWritten('dev', f.deps)
  assert.equal(f.emails.length, 4)
})
test('uncertain recipient is never resent and does not prevent delivery to other recipients', async () => {
  const f = fixture()
  await inventoryEmailSettings(f.request, f.deps)
  const successful = f.deps.send
  let attempts = 0
  f.deps.send = async (m) => {
    attempts++
    if (m.to[0] === 'a@example.test') throw Error('lost response')
    return successful(m)
  }
  const low = f.change(1)
  await notifyInventory(low, f.deps)
  await notifyInventory(low, f.deps)
  assert.equal(attempts, 2)
  assert.equal(f.emails.length, 1)
  assert.equal(f.emails[0].to[0], 'b@example.test')
})
