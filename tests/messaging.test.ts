import { describe, expect, it } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { staffMessagingEndpoint } from '../src/shared/messaging-policy'
import {
  chatUnread,
  messageReaders,
  chatTitle,
  type StaffChat,
  type StaffMessage,
} from '../src/domain/messaging'
const chatId = 'a'.repeat(64),
  requestId = '11111111-1111-4111-8111-111111111111'
it('allows only the bounded messaging callable shapes, preserving direct Firestore/Auth protections', () => {
  const allowed = (d: unknown) =>
    allowFirebaseRequest(staffMessagingEndpoint, 'POST', JSON.stringify({ data: d }))
  const send = { business: 'dev', action: 'send', chatId, requestId, text: 'Hello' }
  expect(allowed(send)).toBe(true)
  for (const change of [
    { senderUid: 'forged' },
    { sentAt: 100 },
    { text: ' ' },
    { text: 'x'.repeat(10001) },
    { chatId: '../private' },
    { requestId: 'not-a-uuid' },
  ])
    expect(allowed({ ...send, ...change })).toBe(false)
  expect(allowed({ business: 'dev', action: 'start', recipients: ['staff-a', 'staff-b'] })).toBe(
    true,
  )
  expect(allowed({ business: 'dev', action: 'start', recipients: ['staff-a', 'staff-a'] })).toBe(
    false,
  )
  expect(allowed({ business: 'dev', action: 'read', chatId, messageId: requestId })).toBe(true)
  expect(
    allowed({
      business: 'dev',
      action: 'read',
      chatId,
      messageId: requestId,
      uid: 'other',
      readAt: 1,
    }),
  ).toBe(false)
  expect(
    allowFirebaseRequest(staffMessagingEndpoint + '?x=1', 'POST', JSON.stringify({ data: send })),
  ).toBe(false)
  expect(allowFirebaseRequest(staffMessagingEndpoint, 'GET')).toBe(false)
  expect(
    allowFirebaseRequest(
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel?database=projects/cerms-7af24/databases/cerms',
      'POST',
      '{}',
    ),
  ).toBe(false)
  expect(
    allowFirebaseRequest(
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects/cerms-7af24/databases/(default)',
      'POST',
      '{}',
    ),
  ).toBe(false)
  expect(
    allowFirebaseRequest(
      'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
      'POST',
      JSON.stringify({
        writes: [
          {
            delete:
              'projects/cerms-7af24/databases/cerms/documents/system/dev/staffChats/' + chatId,
          },
        ],
      }),
    ),
  ).toBe(false)
})
describe('staff chat presentation', () => {
  const chat: StaffChat = {
    id: chatId,
    participantUids: ['alice', 'bob', 'charlie'],
    participantNames: { alice: 'Alice', bob: 'Bob', charlie: 'Charlie' },
    updatedAt: 100,
    lastSequence: 2,
    lastMessage: {
      sequence: 2,
      senderUid: 'alice',
      senderName: 'Alice',
      text: 'Hello',
      sentAt: 100,
    },
    readBy: {
      bob: { sequence: 1, readAt: 90, name: 'Bob' },
      charlie: { sequence: 2, readAt: 110, name: 'Charlie' },
    },
  }
  const message: StaffMessage = {
    id: requestId,
    sequence: 2,
    senderUid: 'alice',
    senderName: 'Alice',
    text: 'Hello',
    sentAt: 100,
  }
  it('shows exactly which recipients have read each message', () => {
    expect(messageReaders(chat, message).map((r) => r.name)).toEqual(['Charlie'])
    expect(messageReaders(chat, { ...message, sequence: 1 }).map((r) => r.name)).toEqual([
      'Bob',
      'Charlie',
    ])
  })
  it('flags incoming unread messages without flagging the sender or newer-reader state', () => {
    expect(chatUnread(chat, 'bob')).toBe(true)
    expect(chatUnread(chat, 'alice')).toBe(false)
    expect(chatUnread(chat, 'charlie')).toBe(false)
  })
  it('uses participant names and excludes the current staff member from the title', () => {
    expect(chatTitle(chat, 'alice')).toBe('Bob, Charlie')
  })
})
