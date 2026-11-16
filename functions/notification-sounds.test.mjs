import test from 'node:test'
import assert from 'node:assert/strict'
import { saveNotificationSoundPreference as save } from './notification-sounds.mjs'
import { posFixture, owner } from '../scripts/fixtures/pos-server.mjs'
test('saves only the authenticated existing staff profile sound field, retaining absent fields and idempotence', async () => {
  const f = posFixture(),
    before = structuredClone(f.docs.get('users/' + owner))
  f.docs.set('users/staff', { uid: 'staff', access: 'club-a' })
  for (const uid of [owner, 'staff'])
    for (const volume of [0, 50, 100])
      for (const enabled of [true, false]) {
        const original = uid === owner ? before : { uid: 'staff', access: 'club-a' }
        for (let i = 0; i < 2; i++) {
          assert.deepEqual(await save({ auth: { uid }, data: { enabled, volume } }, f.deps), {
            enabled,
            volume,
          })
          assert.deepEqual(f.docs.get('users/' + uid), {
            ...original,
            notificationSoundPreference: { enabled, volume },
          })
        }
      }
  assert.equal(f.docs.get('users/staff').version, undefined)
})
test('rejects invalid volume/enabled, targeting other users, unknown fields and missing/mismatched profiles without writes', async () => {
  for (const data of [
    null,
    [],
    {},
    { enabled: true, volume: -1 },
    { enabled: true, volume: 101 },
    { enabled: true, volume: 1.5 },
    { enabled: 'true', volume: 50 },
    { enabled: true, volume: 50, uid: 'victim' },
    { enabled: true, volume: 50, access: 'other' },
  ]) {
    const f = posFixture()
    await assert.rejects(save({ auth: { uid: owner }, data }, f.deps))
    assert.equal(f.commits(), 0)
  }
  for (const uid of [undefined, 'missing', 'mismatch']) {
    const f = posFixture()
    f.docs.set('users/mismatch', { uid: 'other' })
    await assert.rejects(save({ auth: { uid }, data: { enabled: true, volume: 50 } }, f.deps))
    assert.equal(f.commits(), 0)
  }
})
