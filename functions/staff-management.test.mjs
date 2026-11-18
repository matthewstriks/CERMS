import test from 'node:test'
import assert from 'node:assert/strict'
import { manageStaffAccounts } from './staff-management.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
function fixture() {
  const docs = new Map(),
    versions = new Map()
  let counter = 100
  const put = (p, d) => {
    docs.set(p, structuredClone(d))
    versions.set(p, { seconds: 100, nanoseconds: ++counter })
  }
  const snap = (p) => {
    const data = structuredClone(docs.get(p))
    return {
      id: p.split('/').at(-1),
      exists: docs.has(p),
      updateTime: versions.get(p),
      data: () => structuredClone(data),
    }
  }
  const ref = (p) => ({ path: p })
  const query = (path, condition, after, count) => ({
    where: (k, _op, v) => query(path, [k, v], after, count),
    orderBy: () => query(path, condition, after, count),
    limit: (n) => query(path, condition, after, n),
    startAfter: (id) => query(path, condition, id, count),
    get: async () => ({
      docs: [...docs.keys()]
        .filter(
          (p) =>
            p.startsWith(path + '/') &&
            !p.slice(path.length + 1).includes('/') &&
            (!condition || docs.get(p)[condition[0]] === condition[1]) &&
            (!after || p.split('/').at(-1) > after),
        )
        .sort()
        .slice(0, count)
        .map(snap),
    }),
  })
  const db = {
    doc: ref,
    collection: (p) => query(p),
    runTransaction: async (fn) => {
      let writing = false
      const writes = []
      const result = await fn({
        get: async (r) => {
          assert.equal(writing, false)
          return snap(r.path)
        },
        update: (r, d) => {
          writing = true
          writes.push([r.path, { ...docs.get(r.path), ...d }])
        },
        create: (r, d) => {
          assert.ok(!docs.has(r.path))
          writing = true
          writes.push([r.path, d])
        },
        delete: (r) => {
          writing = true
          writes.push([r.path, undefined])
        },
      })
      for (const [p, d] of writes) {
        if (d === undefined) {
          docs.delete(p)
          versions.delete(p)
        } else put(p, d)
      }
      return result
    },
  }
  put('system/dev', { businessName: 'Dev' })
  for (const uid of [owner, 'admin', 'cashier'])
    put('users/' + uid, {
      uid,
      access: 'dev',
      displayName: uid,
      email: uid + '@example.test',
      rank: 'staff',
      version: '5.0.0-alpha.5',
      themePreference: 'dark',
    })
  put('users/foreign', { uid: 'foreign', access: 'other' })
  put('system/dev/staffPermissions/admin', {
    permissions: { editStaffProfiles: true, removeStaffAccounts: false },
  })
  put('system/dev/staffPermissions/cashier', { permissions: { processSales: true } })
  const deps = {
    db,
    timestamp: () => ({ synthetic: true }),
    fail: (code, message) => {
      throw Object.assign(Error(message), { code })
    },
  }
  const get = (uid) =>
    manageStaffAccounts(
      { auth: { uid: 'admin' }, data: { action: 'get', business: 'dev', uid } },
      deps,
    )
  const mutation = async (action, uid = 'cashier', actor = 'admin') => ({
    auth: { uid: actor },
    data: {
      action,
      business: 'dev',
      uid,
      requestId: '10000000-0000-4000-8000-000000000001',
      expectedProfileVersion: (
        await manageStaffAccounts(
          { auth: { uid: actor }, data: { action: 'get', business: 'dev', uid } },
          deps,
        )
      ).profileVersion,
      ...(action === 'update'
        ? { profile: { displayName: 'Updated name', email: 'contact@example.test' } }
        : {}),
    },
  })
  return { docs, put, deps, get, mutation }
}
test('delegated profile editor lists only current business and edits only name/profile email with safe same-request retry', async () => {
  const f = fixture(),
    before = structuredClone(f.docs.get('users/cashier'))
  const page = await manageStaffAccounts(
    { auth: { uid: 'admin' }, data: { action: 'list', business: 'dev' } },
    f.deps,
  )
  assert.ok(!page.rows.some((r) => r.uid === 'foreign'))
  const request = await f.mutation('update')
  await manageStaffAccounts(request, f.deps)
  await manageStaffAccounts(request, f.deps)
  assert.deepEqual(f.docs.get('users/cashier'), {
    ...before,
    displayName: 'Updated name',
    email: 'contact@example.test',
  })
  assert.deepEqual(f.docs.get('system/dev/staffPermissions/cashier'), {
    permissions: { processSales: true },
  })
  await assert.rejects(
    manageStaffAccounts(
      {
        ...request,
        data: { ...request.data, profile: { ...request.data.profile, rank: 'owner' } },
      },
      f.deps,
    ),
    { code: 'invalid-argument' },
  )
})
test('permissions, foreign profiles, owner profile and stale versions fail closed', async () => {
  const f = fixture()
  await assert.rejects(
    manageStaffAccounts(
      { auth: { uid: 'cashier' }, data: { action: 'list', business: 'dev' } },
      f.deps,
    ),
    { code: 'permission-denied' },
  )
  await assert.rejects(f.get(owner), { code: 'permission-denied' })
  await assert.rejects(f.get('foreign'), { code: 'not-found' })
  const stale = await f.mutation('update')
  f.put('users/cashier', { ...f.docs.get('users/cashier'), displayName: 'Concurrent change' })
  await assert.rejects(manageStaffAccounts(stale, f.deps), { code: 'failed-precondition' })
  f.put('system/dev/staffPermissions/admin', { permissions: { editStaffProfiles: false } })
  await assert.rejects(manageStaffAccounts(stale, f.deps), { code: 'permission-denied' })
})
test('removal has separate permission, preserves receipts/history, blocks open registers and is atomic/idempotent', async () => {
  const f = fixture()
  const denied = await f.mutation('remove')
  await assert.rejects(manageStaffAccounts(denied, f.deps), { code: 'permission-denied' })
  f.put('system/dev/staffPermissions/admin', { permissions: { removeStaffAccounts: true } })
  f.put('system/dev/registerOwners/cashier', { registerId: 'register' })
  f.put('system/dev/registers/register', { status: 'open', ownerUid: 'cashier' })
  const request = await f.mutation('remove')
  await assert.rejects(manageStaffAccounts(request, f.deps), { code: 'failed-precondition' })
  f.put('system/dev/registers/register', { status: 'closed', ownerUid: 'cashier' })
  f.put('system/dev/sales/receipt', { cashierUid: 'cashier', totalCents: 100 })
  await manageStaffAccounts(request, f.deps)
  await manageStaffAccounts(request, f.deps)
  assert.equal(f.docs.has('users/cashier'), false)
  assert.equal(f.docs.has('system/dev/staffPermissions/cashier'), false)
  assert.deepEqual(f.docs.get('system/dev/sales/receipt'), {
    cashierUid: 'cashier',
    totalCents: 100,
  })
  assert.equal(f.docs.get('system/dev/registers/register').status, 'closed')
  await assert.rejects(
    manageStaffAccounts({ ...request, data: { ...request.data, uid: 'admin' } }, f.deps),
    { code: 'permission-denied' },
  )
  await assert.rejects(
    manageStaffAccounts(
      { ...request, auth: { uid: owner }, data: { ...request.data, uid: owner } },
      f.deps,
    ),
    { code: 'permission-denied' },
  )
})
