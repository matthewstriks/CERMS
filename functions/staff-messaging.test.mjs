import test from 'node:test'
import assert from 'node:assert/strict'
import { staffMessaging, validMessagingRequest } from './staff-messaging.mjs'
import { posFixture, owner, business } from '../scripts/fixtures/pos-server.mjs'
const requestId = '11111111-1111-4111-8111-111111111111'
function fixture() {
  const f = posFixture()
  for (const [uid, name] of [
    ['alice', 'Alice Staff'],
    ['bob', 'Bob Staff'],
    ['outsider', 'Other Business'],
  ])
    f.docs.set('users/' + uid, {
      uid,
      displayName: name,
      access: uid === 'outsider' ? 'foreign' : business,
      email: 'private@example.test',
      rank: 'private',
      version: 88,
    })
  const call = (action, data = {}, uid = owner) =>
    staffMessaging({ auth: { uid }, data: { action, business, ...data } }, f.deps)
  return { ...f, call }
}
test('directory reveals only same-business staff names and UIDs, with complete pagination', async () => {
  const f = fixture()
  for (let i = 0; i < 53; i++)
    f.docs.set('users/staff' + String(i).padStart(3, '0'), {
      uid: 'staff' + String(i).padStart(3, '0'),
      displayName: 'Synthetic ' + i,
      access: business,
      email: 'private',
    })
  const first = await f.call('directory', { cursor: null }),
    second = await f.call('directory', { cursor: first.nextCursor })
  const staff = [...first.staff, ...second.staff]
  assert.equal(staff.length, 55)
  assert.ok(staff.every((p) => Object.keys(p).sort().join() === 'name,uid'))
  assert.ok(!staff.some((p) => p.uid === owner || p.uid === 'outsider'))
  assert.equal(f.commits(), 0)
})
test('direct and group starts are deterministic and participant identity comes from saved profiles', async () => {
  const f = fixture(),
    first = await f.call('start', { recipients: ['alice'] })
  const again = await f.call('start', { recipients: [owner] }, 'alice')
  assert.equal(first.chatId, again.chatId)
  assert.equal(f.commits(), 1)
  const group = await f.call('start', { recipients: ['alice', 'bob'] })
  const reordered = await f.call('start', { recipients: ['alice', owner] }, 'bob')
  assert.equal(group.chatId, reordered.chatId)
  assert.equal(f.commits(), 2)
  const c = f.docs.get(`system/${business}/staffChats/${group.chatId}`)
  assert.equal(c.participantUids.length, 3)
  assert.equal(c.participantNames.alice, 'Alice Staff')
  assert.deepEqual(c.readBy, {})
})
test('messages use server-derived sender, time and increasing sequence; retries never duplicate', async () => {
  const f = fixture(),
    { chatId } = await f.call('start', { recipients: ['alice'] })
  const response = await f.call('send', { chatId, requestId, text: ' Hello\nthere ' })
  assert.equal(response.messageId, requestId)
  await f.call('send', { chatId, requestId, text: 'Hello\nthere' })
  assert.equal(f.commits(), 2)
  const m = f.docs.get(`system/${business}/staffChats/${chatId}/messages/${requestId}`)
  assert.equal(m.senderUid, owner)
  assert.equal(m.senderName, 'Matthew Test Striks')
  assert.equal(m.text, 'Hello\nthere')
  assert.equal(m.sequence, 1)
  assert.ok(m.sentAt)
  await assert.rejects(f.call('send', { chatId, requestId, text: 'Different' }), /different text/)
  await assert.rejects(
    f.call('send', { chatId, requestId, text: 'Hello\nthere' }, 'alice'),
    /different text/,
  )
  await f.call('send', { chatId, requestId: requestId.replace(/1$/, '2'), text: 'Reply' }, 'alice')
  const c = f.docs.get(`system/${business}/staffChats/${chatId}`)
  assert.equal(c.lastSequence, 2)
  assert.equal(c.lastMessage.senderUid, 'alice')
  assert.deepEqual(c.readBy, {})
})
test('read receipts advance only the verified caller watermark to a stored message and never go backward', async () => {
  const f = fixture(),
    { chatId } = await f.call('start', { recipients: ['alice', 'bob'] })
  await f.call('send', { chatId, requestId, text: 'One' })
  const second = requestId.replace(/1$/, '2')
  await f.call('send', { chatId, requestId: second, text: 'Two' })
  await f.call('read', { chatId, messageId: second }, 'alice')
  await f.call('read', { chatId, messageId: requestId }, 'alice')
  const c = f.docs.get(`system/${business}/staffChats/${chatId}`)
  assert.equal(c.readBy.alice.sequence, 2)
  assert.equal(c.readBy.alice.name, 'Alice Staff')
  assert.ok(c.readBy.alice.readAt)
  assert.equal(c.readBy.bob, undefined)
  assert.equal(c.readBy[owner], undefined)
  assert.equal(f.commits(), 4)
  await assert.rejects(
    f.call('read', { chatId, messageId: requestId.replace(/1$/, '9') }, 'alice'),
    /Reload/,
  )
})
test('nonparticipants, including the owner, cannot search, read or send in private conversations', async () => {
  const f = fixture(),
    { chatId } = await f.call('start', { recipients: ['bob'] }, 'alice')
  for (const [action, data] of [
    ['send', { requestId, text: 'Intrusion' }],
    ['read', { messageId: requestId }],
    ['search', { query: 'test', before: null }],
  ]) {
    await assert.rejects(f.call(action, { chatId, ...data }), /private/)
    await assert.rejects(f.call(action, { chatId, ...data }, 'outsider'), /business access/)
  }
  assert.equal(f.commits(), 1)
})
test('access changes block new delivery; no profile, Auth, member or legacy business data is changed', async () => {
  const f = fixture(),
    { chatId } = await f.call('start', { recipients: ['alice'] })
  f.docs.get('users/alice').access = 'foreign'
  const before = structuredClone([...f.docs])
  await assert.rejects(
    f.call('send', { chatId, requestId, text: 'Must not send' }),
    /no longer belongs/,
  )
  await assert.rejects(f.call('start', { recipients: ['alice'] }), /saved business/)
  assert.deepEqual([...f.docs], before)
  f.docs.get('users/' + owner).access = 'foreign'
  await assert.rejects(f.call('read', { chatId, messageId: requestId }), /business access/)
  assert.equal(f.commits(), 1)
})
test('history search scans all pages without mutating messages or revealing another chat', async () => {
  const f = fixture(),
    { chatId } = await f.call('start', { recipients: ['alice'] })
  const prefix = `system/${business}/staffChats/${chatId}`
  for (let i = 1; i <= 105; i++)
    f.docs.set(`${prefix}/messages/${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, {
      sequence: i,
      text: i === 1 ? 'Older match' : 'Newest match',
      senderUid: owner,
      senderName: 'Owner',
      sentAt: f.deps.timestamp(),
    })
  f.docs.get(prefix).lastSequence = 105
  const first = await f.call('search', { chatId, query: 'OLDER MATCH', before: null })
  assert.deepEqual(first.messages, [])
  assert.equal(first.nextBefore, 6)
  const second = await f.call('search', { chatId, query: 'older match', before: first.nextBefore })
  assert.equal(second.messages.length, 1)
  assert.equal(second.messages[0].sequence, 1)
  assert.equal(second.nextBefore, null)
  assert.equal(f.commits(), 1)
})
test('invalid requests, forged sender/read time, cross-business recipients and anonymous requests never write', async () => {
  const f = fixture()
  for (const data of [
    { action: 'start', recipients: [] },
    { action: 'start', recipients: ['alice', 'alice'] },
    { action: 'start', recipients: [owner] },
    { action: 'start', recipients: ['outsider'] },
    { action: 'start', recipients: ['alice'], senderUid: 'forged' },
    { action: 'send', chatId: 'a'.repeat(64), requestId, text: ' ' },
    { action: 'send', chatId: 'a'.repeat(64), requestId, text: 'x'.repeat(10001) },
    {
      action: 'read',
      chatId: 'a'.repeat(64),
      messageId: requestId,
      sequence: 999,
      readAt: 'forged',
    },
  ])
    await assert.rejects(
      f.call(data.action, Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'action'))),
    )
  await assert.rejects(
    staffMessaging({ data: { business, action: 'directory', cursor: null } }, f.deps),
    /Sign in/,
  )
  assert.equal(f.commits(), 0)
  assert.equal(validMessagingRequest(null), false)
})
