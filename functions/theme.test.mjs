import test from 'node:test'
import assert from 'node:assert/strict'
import { saveThemePreference } from './theme.mjs'
import { posFixture, owner } from '../scripts/fixtures/pos-server.mjs'
test('appearance updates only own existing profile theme; repeat selections remain safe and other fields stay intact', async () => {
  const f = posFixture(),
    before = structuredClone(f.docs.get('users/' + owner))
  for (const theme of ['dark', 'dark', 'light']) {
    assert.deepEqual(await saveThemePreference({ auth: { uid: owner }, data: { theme } }, f.deps), {
      theme,
    })
    assert.deepEqual(f.docs.get('users/' + owner), { ...before, themePreference: theme })
  }
  assert.equal(f.docs.get('users/' + owner).version, undefined)
  assert.equal([...f.docs.keys()].filter((p) => p.startsWith('users/')).length, 1)
})
test('ordinary staff may save their own theme without business or sales privileges', async () => {
  const f = posFixture()
  f.docs.set('users/staff', { uid: 'staff', access: 'club-a' })
  await saveThemePreference({ auth: { uid: 'staff' }, data: { theme: 'dark' } }, f.deps)
  assert.deepEqual(f.docs.get('users/staff'), {
    uid: 'staff',
    access: 'club-a',
    themePreference: 'dark',
  })
  assert.equal(f.docs.get('users/' + owner).themePreference, undefined)
})
test('forged user IDs, unknown fields, invalid themes, anonymous users and missing/mismatched profiles never write', async () => {
  for (const request of [
    { data: { theme: 'dark' } },
    { auth: { uid: owner }, data: { theme: 'system' } },
    { auth: { uid: owner }, data: { theme: 'dark', uid: 'victim' } },
    { auth: { uid: owner }, data: { theme: 'dark', access: 'other' } },
    { auth: { uid: 'missing' }, data: { theme: 'dark' } },
    { auth: { uid: 'mismatch' }, data: { theme: 'dark' } },
    { auth: { uid: owner }, data: null },
  ]) {
    const f = posFixture()
    f.docs.set('users/mismatch', { uid: 'someone-else' })
    await assert.rejects(saveThemePreference(request, f.deps))
    assert.equal(f.commits(), 0)
  }
})
