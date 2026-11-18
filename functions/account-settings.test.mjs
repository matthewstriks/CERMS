import test from 'node:test'
import assert from 'node:assert/strict'
import { accountSettings } from './account-settings.mjs'
function fixture() {
  let data = {
      uid: 'staff',
      displayName: 'Staff',
      email: 'old@example.test',
      access: 'dev',
      rank: 'staff',
      version: 'original',
      themePreference: 'dark',
    },
    tick = 1
  const deps = {
    fail: (code, message) => {
      throw Object.assign(Error(message), { code })
    },
    db: {
      doc: (path) => {
        assert.equal(path, 'users/staff')
        return path
      },
      runTransaction: async (fn) => {
        const snapshot = structuredClone(data)
        return fn({
          get: async () => ({
            exists: !!snapshot,
            data: () => snapshot,
            updateTime: { seconds: 100, nanoseconds: tick },
          }),
          update: (_ref, fields) => {
            assert.ok(Object.keys(fields).every((k) => ['displayName', 'email'].includes(k)))
            data = { ...data, ...fields }
            tick++
          },
        })
      },
    },
  }
  const invoke = (d, token = { email: 'new@example.test', email_verified: true }, uid = 'staff') =>
    accountSettings({ auth: uid ? { uid, token } : null, data: d }, deps)
  return {
    invoke,
    read: () => data,
    remove: () => {
      data = null
    },
  }
}
test('self name and verified-email sync preserve all other profile fields', async () => {
  const f = fixture()
  let p = await f.invoke({ action: 'get' })
  await f.invoke({ action: 'saveName', displayName: ' Updated ', expectedVersion: p.version })
  assert.equal(f.read().displayName, 'Updated')
  assert.equal(f.read().email, 'old@example.test')
  p = await f.invoke({ action: 'get' })
  await f.invoke({ action: 'syncEmail', expectedVersion: p.version })
  assert.equal(f.read().email, 'new@example.test')
  assert.equal(f.read().version, 'original')
  assert.equal(f.read().access, 'dev')
  assert.equal(f.read().rank, 'staff')
  assert.equal(f.read().themePreference, 'dark')
})
test('unauthenticated, forged target, unverified email, stale edits and missing profiles fail closed', async () => {
  const f = fixture()
  const p = await f.invoke({ action: 'get' })
  await assert.rejects(f.invoke({ action: 'get' }, undefined, null), { code: 'unauthenticated' })
  await assert.rejects(
    f.invoke({
      action: 'saveName',
      uid: 'other',
      displayName: 'Forged',
      expectedVersion: p.version,
    }),
    { code: 'invalid-argument' },
  )
  await assert.rejects(
    f.invoke(
      { action: 'syncEmail', expectedVersion: p.version },
      { email: 'new@example.test', email_verified: false },
    ),
    { code: 'failed-precondition' },
  )
  await assert.rejects(
    f.invoke({ action: 'saveName', displayName: 'Stale', expectedVersion: '99.000000001' }),
    { code: 'failed-precondition' },
  )
  assert.equal(f.read().displayName, 'Staff')
  f.remove()
  await assert.rejects(f.invoke({ action: 'get' }), { code: 'permission-denied' })
})
