import test from 'node:test'
import assert from 'node:assert/strict'
import { memberNotes } from './member-notes.mjs'
import { completeSale } from './pos.mjs'
import { posFixture, owner, business } from '../scripts/fixtures/pos-server.mjs'
const noteId = '10000000-0000-4000-8000-000000000002'
function fixture() {
  const f = posFixture()
  f.docs.set('members/guest', {
    access: business,
    name: 'Synthetic Guest',
    dna: false,
    tag: true,
    notes: ['Original note'],
    checkedIn: false,
  })
  const call = (action, extra = {}, uid = owner) =>
    memberNotes({ auth: { uid }, data: { business, memberId: 'guest', action, ...extra } }, f.deps)
  return { ...f, call }
}
test('staff notes use saved actor/server time; replay is idempotent and altered replay fails', async () => {
  const f = fixture()
  f.docs.set('users/staff', { uid: 'staff', access: business, displayName: 'Synthetic Staff' })
  await f.call('add', { requestId: noteId, text: 'Bring membership card' }, 'staff')
  await f.call('add', { requestId: noteId, text: 'Bring membership card' }, 'staff')
  const result = await f.call('list', { cursor: null })
  assert.equal(result.revision, 1)
  assert.equal(result.notes.length, 2)
  const n = result.notes.find((n) => n.kind === 'note')
  assert.equal(n.actorName, 'Synthetic Staff')
  assert.equal(n.actorUid, 'staff')
  assert.ok(n.createdAt)
  assert.equal(f.commits(), 1)
  await assert.rejects(
    f.call('add', { requestId: noteId, text: 'Altered' }, 'staff'),
    /different details/,
  )
})
test('DNA requires a reason and edit permission, creates a highlighted note atomically, and clears with history', async () => {
  const f = fixture()
  await assert.rejects(
    f.call('dna', { requestId: noteId, enabled: true, expectedDna: false, reason: '  ' }),
    /reason/,
  )
  f.docs.set('users/staff', { uid: 'staff', access: business, displayName: 'Saved Name' })
  await assert.rejects(
    f.call(
      'dna',
      { requestId: noteId, enabled: true, expectedDna: false, reason: 'Policy incident' },
      'staff',
    ),
    /permission/,
  )
  assert.equal(f.commits(), 0)
  f.docs.set(`system/${business}/staffPermissions/staff`, { permissions: { editMembers: true } })
  const d = { requestId: noteId, enabled: true, expectedDna: false, reason: 'Policy incident' }
  await f.call('dna', d, 'staff')
  await f.call('dna', d, 'staff')
  assert.equal(f.docs.get('members/guest').dna, true)
  let result = await f.call('list', { cursor: null })
  assert.equal(result.notes.find((n) => n.id === noteId).kind, 'dna')
  await assert.rejects(
    f.call('dna', { ...d, requestId: noteId.replace(/2$/, '3') }, 'staff'),
    /changed/,
  )
  await f.call(
    'dna',
    { requestId: noteId.replace(/2$/, '4'), enabled: false, expectedDna: true, reason: '' },
    'staff',
  )
  result = await f.call('list', { cursor: null })
  assert.equal(result.dna, false)
  assert.ok(result.notes.some((n) => n.kind === 'dna-cleared'))
  assert.equal(f.commits(), 2)
})
test('only assigned note admins may remove; removal preserves DNA, masks body and retries safely', async () => {
  const f = fixture()
  await f.call('dna', { requestId: noteId, enabled: true, expectedDna: false, reason: 'Incident' })
  f.docs.set('users/admin', { uid: 'admin', access: business, displayName: 'Note Admin' })
  await assert.rejects(f.call('remove', { noteId }, 'admin'), /permission/)
  f.docs.set(`system/${business}/staffPermissions/admin`, {
    permissions: { removeMemberNotes: true },
  })
  await f.call('remove', { noteId }, 'admin')
  await f.call('remove', { noteId }, 'admin')
  const result = await f.call('list', { cursor: null })
  assert.equal(
    result.notes.some((n) => n.id === noteId),
    false,
  )
  assert.equal(result.dna, true)
  const stored = f.docs.get(`system/${business}/memberNotes/guest/entries/${noteId}`)
  assert.equal(stored.text, '')
  assert.equal(stored.removedBy, 'admin')
  assert.ok(stored.removedAt)
  assert.equal(f.commits(), 2)
})
test('removing a duplicate legacy note never removes another on a lost-response retry', async () => {
  const f = fixture()
  f.docs.get('members/guest').notes = ['Same', 'Same']
  const result = await f.call('list', { cursor: null }),
    id = result.notes[0].id
  await f.call('remove', { noteId: id })
  await f.call('remove', { noteId: id })
  assert.deepEqual(f.docs.get('members/guest').notes, ['Same'])
  assert.equal(f.commits(), 1)
})
test('anonymous, foreign members/business, forged actor and unbounded requests never write', async () => {
  for (const change of [
    (r) => {
      r.auth = null
    },
    (r) => {
      r.data.business = 'foreign'
    },
    (r) => {
      r.data.memberId = 'other'
    },
    (r) => {
      r.data.actorName = 'Forged'
    },
    (r) => {
      r.data.text = 'x'.repeat(10001)
    },
    (r) => {
      r.data.memberId = '../guest'
    },
  ]) {
    const f = fixture(),
      r = {
        auth: { uid: owner },
        data: { business, memberId: 'guest', action: 'add', requestId: noteId, text: 'Test' },
      }
    change(r)
    await assert.rejects(memberNotes(r, f.deps))
    assert.equal(f.commits(), 0)
  }
})
test('notes pagination returns all pages with deletion masking and preserved legacy attribution', async () => {
  const f = fixture()
  for (let i = 0; i < 52; i++)
    f.docs.set(
      `system/${business}/memberNotes/guest/entries/${String(i).padStart(8, '0')}-0000-4000-8000-000000000001`,
      {
        text: 'Note ' + i,
        kind: 'note',
        actorUid: owner,
        actorName: 'Owner',
        createdAt: f.deps.timestamp(),
        deleted: i === 3,
      },
    )
  const first = await f.call('list', { cursor: null }),
    second = await f.call('list', { cursor: first.nextCursor })
  assert.ok(first.nextCursor)
  assert.equal(first.notes.length + second.notes.length, 52)
  assert.equal(second.nextCursor, null)
  assert.equal(first.notes[0].kind, 'legacy')
})
test('tagged order participants require current notes acknowledgement; failures never save sales', async () => {
  const f = fixture()
  f.request.data.member = { id: 'guest', name: 'Untrusted' }
  await assert.rejects(completeSale(f.request, f.deps), /read and confirmed/)
  f.request.data.noteAcknowledgements = [{ memberId: 'guest', revision: 0 }]
  await f.call('add', { requestId: noteId, text: 'New note invalidates acknowledgement' })
  await assert.rejects(completeSale(f.request, f.deps), /read and confirmed/)
  assert.equal(f.commits(), 1)
  f.request.data.noteAcknowledgements[0].revision = 1
  await completeSale(f.request, f.deps)
  // Post-sale notes changes must not invalidate an identical committed-sale retry.
  await f.call('add', { requestId: noteId.replace(/2$/, '3'), text: 'Later note' })
  await completeSale(f.request, f.deps)
  assert.equal(f.commits(), 3)
  const sale = f.docs.get(`system/${business}/sales/${f.request.data.requestId}`)
  assert.equal(JSON.stringify(sale).includes('New note invalidates'), false)
})

test('independent rental recipients each require their own current notes confirmation', async () => {
  const f = fixture(),
    product = f.docs.get(`system/${business}/products/retail`)
  Object.assign(product, {
    rental: true,
    inventory: null,
    rentalLengthRaw: 1,
    rentalLengthType: 'hour',
  })
  f.docs.get('members/guest').id_expiration = 2000000000
  f.docs.set('members/friend', { ...f.docs.get('members/guest'), name: 'Friend', notes: [] })
  f.request.data.member = { id: 'guest', name: 'Guest' }
  f.request.data.rentals = [
    { productId: 'retail', memberId: 'guest', assignedRoom: 'A', id: noteId },
    { productId: 'retail', memberId: 'friend', assignedRoom: 'B', id: noteId.replace(/2$/, '3') },
  ]
  f.request.data.noteAcknowledgements = [{ memberId: 'guest', revision: 0 }]
  await assert.rejects(completeSale(f.request, f.deps), /read and confirmed/)
  assert.equal(f.commits(), 0)
  f.request.data.noteAcknowledgements.push({ memberId: 'friend', revision: 0 })
  await completeSale(f.request, f.deps)
  assert.equal(f.commits(), 1)
})
