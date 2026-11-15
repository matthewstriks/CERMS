import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  doc,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Query,
  type DocumentReference,
} from 'firebase/firestore'
import { getFirebaseServices } from './firebase-membership'
import { getLiveDatabase } from './firebase-live'
import { timestampToMillis } from '../domain/legacy'
import { isMessagingRequest, staffMessagingEndpoint } from '../shared/messaging-policy'
import type { MessagingRequest } from '../shared/messaging-policy'
import type { MembershipReader } from './membership-contracts'
import type { StaffChat, StaffMessage, StaffContact, MessagingLive } from '../domain/messaging'
interface Outbox {
  requestId: string
  text: string
}
const outbox = new Map<string, Outbox>()
let watchingAuth = false
const message = (s: { id: string; data(): DocumentData }): StaffMessage =>
  ({ id: s.id, ...s.data(), sentAt: timestampToMillis(s.data().sentAt) }) as StaffMessage
const chat = (s: { id: string; data(): DocumentData }): StaffChat => {
  const d = s.data()
  return {
    id: s.id,
    participantUids: d.participantUids,
    participantNames: d.participantNames,
    updatedAt: timestampToMillis(d.updatedAt),
    lastSequence: d.lastSequence,
    lastMessage: d.lastMessage
      ? { ...d.lastMessage, sentAt: timestampToMillis(d.lastMessage.sentAt) }
      : null,
    readBy: Object.fromEntries(
      Object.entries(d.readBy ?? {}).map(([uid, v]) => {
        const r = v as DocumentData
        return [uid, { ...r, readAt: timestampToMillis(r.readAt) }]
      }),
    ),
  } as StaffChat
}
export function createMessaging(reader: Pick<MembershipReader, 'uid' | 'club'>) {
  const { auth } = getFirebaseServices(),
    db = getLiveDatabase()
  const path = `system/${reader.club}/staffChats`,
    outboxKey = (id: string) => `${reader.uid}:${reader.club}:${id}`
  if (!watchingAuth) {
    watchingAuth = true
    let previousUid = auth.currentUser?.uid
    onAuthStateChanged(auth, (user) => {
      if (user?.uid !== previousUid || !user) outbox.clear()
      previousUid = user?.uid
    })
  }
  let chatCursor: QueryDocumentSnapshot | undefined,
    paged = false
  async function call<T>(
    data: Omit<MessagingRequest, 'business'> | Record<string, unknown>,
  ): Promise<T> {
    if (auth.currentUser?.uid !== reader.uid) throw new Error('Sign in again.')
    const body = JSON.stringify({ data: { ...data, business: reader.club } })
    if (!isMessagingRequest(body)) throw new Error('Check the messaging details.')
    const r = await fetch(staffMessagingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body,
    })
    const p = await r.json()
    if (!r.ok || p.error)
      throw Object.assign(
        new Error(p.error?.message || 'Message request not confirmed. Retry the same request.'),
        {
          definitive: [
            'INVALID_ARGUMENT',
            'PERMISSION_DENIED',
            'FAILED_PRECONDITION',
            'ALREADY_EXISTS',
          ].includes(p.error?.status),
        },
      )
    return p.result ?? p.data
  }
  function listen<T>(
    target: Query<DocumentData> | DocumentReference<DocumentData>,
    decode: (snapshot: any) => T[],
    receive: (state: MessagingLive<T>) => void,
  ) {
    return onSnapshot(
      target as any,
      { includeMetadataChanges: true },
      (s: any) => {
        receive({
          rows: s.metadata.fromCache ? [] : decode(s),
          status: s.metadata.fromCache ? 'reconnecting' : 'live',
          more: s.size === 50,
        })
      },
      () =>
        receive({
          rows: [],
          status: 'error',
          error:
            'This conversation could not be loaded. Check your connection and business access.',
        }),
    )
  }
  return {
    async directory(): Promise<StaffContact[]> {
      const contacts: StaffContact[] = []
      let cursor: string | null = null
      do {
        const result: { staff: StaffContact[]; nextCursor: string | null } = await call({
          action: 'directory',
          cursor,
        })
        contacts.push(...result.staff)
        cursor = result.nextCursor
      } while (cursor)
      return contacts.sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid))
    },
    start: (recipients: string[]) => call<{ chatId: string }>({ action: 'start', recipients }),
    pending: (id: string) => outbox.get(outboxKey(id)),
    async send(id: string, text: string) {
      const key = outboxKey(id),
        pending = outbox.get(key) ?? { requestId: crypto.randomUUID(), text: text.trim() }
      if (pending.text !== text.trim())
        throw new Error('Retry your unconfirmed message before sending different text.')
      outbox.set(key, pending)
      try {
        const result = await call<{ messageId: string }>({ action: 'send', chatId: id, ...pending })
        if (outbox.get(key)?.requestId === pending.requestId) outbox.delete(key)
        return result
      } catch (e) {
        if (
          e &&
          typeof e === 'object' &&
          'definitive' in e &&
          e.definitive &&
          outbox.get(key)?.requestId === pending.requestId
        )
          outbox.delete(key)
        throw e
      }
    },
    read: (chatId: string, messageId: string) => call({ action: 'read', chatId, messageId }),
    search: (chatId: string, query: string, before: number | null) =>
      call<{ messages: StaffMessage[]; nextBefore: number | null }>({
        action: 'search',
        chatId,
        query,
        before,
      }),
    subscribeChats(receive: (state: MessagingLive<StaffChat>) => void) {
      paged = false
      chatCursor = undefined
      let stopped = false,
        stopChats: (() => void) | undefined
      const fail = () => {
        if (stopped) return
        stopped = true
        stopChats?.()
        receive({
          rows: [],
          status: 'error',
          error: 'Your messaging session changed. Reopen Messages after signing in.',
        })
      }
      const stopAuth = onAuthStateChanged(auth, (user) => {
        if (user?.uid !== reader.uid) fail()
      })
      const stopProfile = onSnapshot(
        doc(db, 'users', reader.uid),
        { includeMetadataChanges: true },
        (s) => {
          if (stopped) return
          if (s.metadata.fromCache) {
            receive({ rows: [], status: 'reconnecting' })
            return
          }
          if (!s.exists() || s.data().access !== reader.club || s.data().uid !== reader.uid) {
            fail()
            return
          }
          if (!stopChats)
            stopChats = listen<StaffChat>(
              query(
                collection(db, path),
                where('participantUids', 'array-contains', reader.uid),
                orderBy('updatedAt', 'desc'),
                limit(50),
              ),
              (s) => {
                if (!paged) chatCursor = s.docs.at(-1)
                return s.docs.map(chat)
              },
              (state) => {
                if (!stopped) receive(state)
              },
            )
        },
        fail,
      )
      return () => {
        stopped = true
        stopAuth()
        stopProfile()
        stopChats?.()
      }
    },
    async olderChats() {
      if (!chatCursor) return { rows: [] as StaffChat[], more: false }
      const result = await getDocsFromServer(
        query(
          collection(db, path),
          where('participantUids', 'array-contains', reader.uid),
          orderBy('updatedAt', 'desc'),
          startAfter(chatCursor),
          limit(50),
        ),
      )
      paged = true
      chatCursor = result.docs.at(-1)
      return { rows: result.docs.map(chat), more: result.size === 50 }
    },
    subscribeChat(id: string, receive: (state: MessagingLive<StaffChat>) => void) {
      return listen<StaffChat>(doc(db, path, id), (s) => (s.exists() ? [chat(s)] : []), receive)
    },
    subscribeMessages(id: string, receive: (state: MessagingLive<StaffMessage>) => void) {
      return listen(
        query(collection(db, path, id, 'messages'), orderBy('sequence', 'desc'), limit(50)),
        (s) => s.docs.map(message).reverse(),
        receive,
      )
    },
    async olderMessages(id: string, before: number) {
      const result = await getDocsFromServer(
        query(
          collection(db, path, id, 'messages'),
          orderBy('sequence', 'desc'),
          startAfter(before),
          limit(50),
        ),
      )
      return { rows: result.docs.map(message).reverse(), more: result.size === 50 }
    },
  }
}
export type MessagingClient = ReturnType<typeof createMessaging>
