import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccount, OWNER } from './staff-account.mjs'
function fixture() {
  const docs = new Map([
    ['users/' + OWNER, { uid: OWNER, access: 'club-a' }],
    ['system/club-a', { businessName: 'Synthetic' }],
  ])
  const users = new Map()
  let creates = 0
  const fail = (code, message) => {
    throw Object.assign(new Error(message), { code })
  }
  const dependencies = {
    fail,
    timestamp: () => 1,
    db: {
      doc: (path) => path,
      runTransaction: async (fn) => {
        const writes = []
        const result = await fn({
          get: async (p) => ({ exists: docs.has(p), data: () => docs.get(p) }),
          create: (p, d) => {
            assert.ok(!docs.has(p))
            writes.push([p, d])
          },
          update: (p, d) => writes.push([p, { ...docs.get(p), ...d }]),
        })
        for (const [p, d] of writes) docs.set(p, d)
        return result
      },
    },
    auth: {
      getUserByEmail: async (email) => {
        const u = [...users.values()].find((u) => u.email === email)
        if (!u) fail('auth/user-not-found', 'missing')
        return u
      },
      getUser: async (uid) => {
        if (!users.has(uid)) fail('auth/user-not-found', 'missing')
        return users.get(uid)
      },
      createUser: async (user) => {
        creates++
        users.set(user.uid, user)
        return user
      },
    },
  }
  const request = {
    auth: { uid: OWNER },
    data: {
      business: 'club-a',
      requestId: '10000000-0000-4000-8000-000000000001',
      displayName: 'Synthetic Staff',
      email: 'staff@example.test',
      password: 'synthetic-only-password',
      permissions: {
        editMembers: true,
        deleteMembers: false,
        manageProducts: false,
        openRegisters: true,
        closeRegisters: true,
      },
    },
  }
  return { docs, users, dependencies, request, creates: () => creates }
}
test('waiver permissions default off, support explicit assignment and reject malformed rights', async () => {
  const old = fixture()
  const result = await createAccount(old.request, old.dependencies)
  assert.equal(
    old.docs.get(`system/club-a/staffPermissions/${result.uid}`).permissions.waiveProducts,
    false,
  )
  const enabled = fixture()
  enabled.request.data.permissions.waiveProducts = true
  const created = await createAccount(enabled.request, enabled.dependencies)
  assert.equal(
    enabled.docs.get(`system/club-a/staffPermissions/${created.uid}`).permissions.waiveProducts,
    true,
  )
  const invalid = fixture()
  invalid.request.data.permissions.waiveProducts = 'yes'
  await assert.rejects(createAccount(invalid.request, invalid.dependencies))
  assert.equal(invalid.creates(), 0)
})
test('creates a login, cerms profile and assigned permissions; retries do not recreate or overwrite', async () => {
  const f = fixture(),
    result = await createAccount(f.request, f.dependencies)
  assert.equal(f.creates(), 1)
  assert.equal(f.docs.get('users/' + result.uid).access, 'club-a')
  assert.equal(
    f.docs.get(`system/club-a/staffPermissions/${result.uid}`).permissions.editMembers,
    true,
  )
  assert.ok(!JSON.stringify([...f.docs.values()]).includes(f.request.data.password))
  f.docs.get(`system/club-a/staffPermissions/${result.uid}`).permissions.editMembers = false
  await createAccount(f.request, f.dependencies)
  assert.equal(f.creates(), 1)
  assert.equal(
    f.docs.get(`system/club-a/staffPermissions/${result.uid}`).permissions.editMembers,
    false,
  )
})
test('refuses non-owner and changed business access before creating a login', async () => {
  const f = fixture()
  await assert.rejects(createAccount({ ...f.request, auth: { uid: 'staff' } }, f.dependencies), {
    code: 'permission-denied',
  })
  f.docs.get('users/' + OWNER).access = 'other'
  await assert.rejects(createAccount(f.request, f.dependencies), { code: 'permission-denied' })
  assert.equal(f.creates(), 0)
})
test('never changes or links an existing Auth account', async () => {
  const f = fixture()
  f.users.set('legacy-user', {
    uid: 'legacy-user',
    email: f.request.data.email,
    password: 'unchanged',
  })
  await assert.rejects(createAccount(f.request, f.dependencies), { code: 'already-exists' })
  assert.equal(f.users.get('legacy-user').password, 'unchanged')
  assert.equal(f.creates(), 0)
  assert.equal([...f.docs.keys()].filter((p) => p.startsWith('users/')).length, 1)
})
test('rejects invalid permissions and request reuse with different details', async () => {
  const f = fixture()
  await assert.rejects(
    createAccount(
      { ...f.request, data: { ...f.request.data, permissions: { owner: true } } },
      f.dependencies,
    ),
    { code: 'invalid-argument' },
  )
  await createAccount(f.request, f.dependencies)
  await assert.rejects(
    createAccount(
      { ...f.request, data: { ...f.request.data, displayName: 'Changed' } },
      f.dependencies,
    ),
    { code: 'already-exists' },
  )
})
