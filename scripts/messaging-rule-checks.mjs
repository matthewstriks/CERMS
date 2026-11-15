import { catalogFields } from './fixtures/catalog.mjs'
export async function messagingRuleChecks({ base, seed, check, fields, str, owner }) {
  const business = 'club-a',
    chatId = 'a'.repeat(64),
    prefix = `system/${business}/staffChats/${chatId}`
  for (const uid of ['chat-alice', 'chat-bob', 'chat-third'])
    await seed('users/' + uid, { ...fields(uid), access: str(business) })
  await seed('users/chat-foreign', { ...fields('chat-foreign'), access: str('club-b') })
  await seed('users/' + owner, { ...fields(owner), access: str(business) })
  await seed(
    prefix,
    catalogFields({
      participantUids: ['chat-alice', 'chat-bob'],
      lastSequence: 1,
      updatedAt: 'synthetic',
    }),
  )
  await seed(
    prefix + '/messages/11111111-1111-4111-8111-111111111111',
    catalogFields({
      text: 'Private synthetic message',
      senderUid: 'chat-alice',
      senderName: 'Alice',
      sequence: 1,
    }),
  )
  const chats = {
    structuredQuery: {
      from: [{ collectionId: 'staffChats' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'participantUids' },
          op: 'ARRAY_CONTAINS',
          value: str('chat-alice'),
        },
      },
      orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'DESCENDING' }],
      limit: 50,
    },
  }
  const messages = {
    structuredQuery: {
      from: [{ collectionId: 'messages' }],
      orderBy: [{ field: { fieldPath: 'sequence' }, direction: 'DESCENDING' }],
      limit: 50,
    },
  }
  for (const uid of ['chat-alice', 'chat-bob', 'chat-third', 'chat-foreign', owner, undefined]) {
    const allowed = ['chat-alice', 'chat-bob'].includes(uid)
    await check('Chat private metadata', base + '/' + prefix, { uid }, allowed)
    await check(
      'Chat private message',
      base + '/' + prefix + '/messages/11111111-1111-4111-8111-111111111111',
      { uid },
      allowed,
    )
    await check(
      'Chat private history query',
      base + '/' + prefix + ':runQuery',
      { uid, method: 'POST', body: messages },
      allowed,
    )
  }
  await check(
    'Participant conversations query',
    base + `/system/${business}:runQuery`,
    { uid: 'chat-alice', method: 'POST', body: chats },
    true,
  )
  await check(
    'Other users conversation query denied',
    base + `/system/${business}:runQuery`,
    { uid: 'chat-third', method: 'POST', body: chats },
    false,
  )
  const allChats = structuredClone(chats)
  delete allChats.structuredQuery.where
  await check(
    'Unfiltered chat enumeration denied',
    base + `/system/${business}:runQuery`,
    { uid: 'chat-alice', method: 'POST', body: allChats },
    false,
  )
  const unbounded = structuredClone(messages)
  delete unbounded.structuredQuery.limit
  await check(
    'Unbounded history denied',
    base + '/' + prefix + ':runQuery',
    { uid: 'chat-alice', method: 'POST', body: unbounded },
    false,
  )
  for (const uid of ['chat-alice', owner])
    for (const path of [prefix, prefix + '/messages/11111111-1111-4111-8111-111111111111']) {
      await check(
        'Direct chat writes denied',
        base + '/' + path,
        {
          uid,
          method: 'PATCH',
          body: {
            fields: {
              text: str('forged'),
              participantUids: { arrayValue: { values: [str(uid)] } },
            },
          },
        },
        false,
      )
      await check(
        'Direct chat deletion denied',
        base + '/' + path,
        { uid, method: 'DELETE' },
        false,
      )
    }
  await seed('users/chat-alice', { ...fields('chat-alice'), access: str('club-b') })
  await check(
    'Saved-business change revokes chat',
    base + '/' + prefix,
    { uid: 'chat-alice' },
    false,
  )
  await check(
    'Saved-business change revokes message',
    base + '/' + prefix + '/messages/11111111-1111-4111-8111-111111111111',
    { uid: 'chat-alice' },
    false,
  )
  // Ordinary staff still cannot inspect another user's full access profile.
  await check(
    'Messaging directory does not open private profiles',
    base + '/users/chat-bob',
    { uid: 'chat-third' },
    false,
  )
  await check(
    'Legacy chat collection remains denied',
    base + '/chats/legacy',
    { uid: 'chat-bob' },
    false,
  )
}
