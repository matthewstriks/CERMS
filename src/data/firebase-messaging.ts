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
  function listenAllChats(receive: (state: MessagingLive<StaffChat>) => void) {
    // Keep every stream within the deployed 50-conversation list limit.
    // Rebind later pages whenever an ordering boundary moves.
    const pages: {
      anchor: string
      docs: QueryDocumentSnapshot[]
      live: boolean
      stop: () => void
    }[] = []
    let stopped = false
    const trim = (from: number) => {
      pages.splice(from).forEach((p) => p.stop())
    }
    const emit = () => {
      if (stopped) return
      const complete = pages.length && pages.every((p) => p.live) && pages.at(-1)!.docs.length < 50
      const rows = new Map<string, StaffChat>()
      if (complete)
        for (const page of pages)
          for (const d of page.docs) if (!rows.has(d.id)) rows.set(d.id, chat(d))
      receive({ rows: [...rows.values()], status: complete ? 'live' : 'reconnecting', more: false })
    }
    const watch = (index: number, cursor?: QueryDocumentSnapshot, anchor = '') => {
      const page = { anchor, docs: [] as QueryDocumentSnapshot[], live: false, stop: () => {} }
      pages[index] = page
      page.stop = onSnapshot(
        query(
          collection(db, path),
          where('participantUids', 'array-contains', reader.uid),
          orderBy('updatedAt', 'desc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(50),
        ),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (stopped || pages[index] !== page) return
          page.live = !snapshot.metadata.fromCache
          if (page.live) {
            page.docs = snapshot.docs
            const last = page.docs.at(-1)
            if (page.docs.length === 50 && last) {
              const boundary = JSON.stringify([last.id, last.data().updatedAt])
              if (pages[index + 1]?.anchor !== boundary) {
                trim(index + 1)
                watch(index + 1, last, boundary)
              }
            } else trim(index + 1)
          }
          emit()
        },
        () => {
          if (stopped) return
          stopped = true
          trim(0)
          receive({
            rows: [],
            status: 'error',
            error: 'Message notifications could not be loaded. Sign in again to reconnect.',
          })
        },
      )
    }
    watch(0)
    return () => {
      stopped = true
      trim(0)
    }
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
    subscribeChats(receive: (state: MessagingLive<StaffChat>) => void, all = false) {
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
            stopChats = all
              ? listenAllChats((state) => {
                  if (!stopped) receive(state)
                })
              : listen<StaffChat>(
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
    subscribeUnreadCount(receive: (count: number) => void, onIncoming?: () => void) {
      // Watch every conversation, including those beyond the paginated inbox.
      // Read watermarks include outgoing messages, so count incoming documents
      // rather than subtracting sequence numbers.
      const watches = new Map<
        string,
        {
          sequence: number
          count: number | null
          stop: () => void
        }
      >()
      let live = false,
        bootstrapped = false
      const knownSequences = new Map<string, number>()
      const emit = () =>
        receive(
          live && [...watches.values()].every((w) => w.count !== null)
            ? [...watches.values()].reduce((sum, w) => sum + (w.count ?? 0), 0)
            : 0,
        )
      const clear = () => {
        watches.forEach((w) => w.stop())
        watches.clear()
      }
      const stop = createMessaging(reader).subscribeChats((state) => {
        live = state.status === 'live'
        if (!live) {
          clear()
          emit()
          return
        }
        for (const c of state.rows) {
          const known = knownSequences.get(c.id) ?? (bootstrapped ? 0 : c.lastSequence)
          knownSequences.set(c.id, known)
          if (
            bootstrapped &&
            c.lastSequence > known &&
            c.lastMessage?.senderUid !== reader.uid &&
            c.lastMessage
          ) {
            knownSequences.set(c.id, c.lastSequence)
            onIncoming?.()
          }
        }
        bootstrapped = true
        const ids = new Set(state.rows.map((c) => c.id))
        for (const [id, w] of watches) {
          if (!ids.has(id)) {
            w.stop()
            watches.delete(id)
          }
        }
        for (const c of state.rows) {
          const sequence = c.readBy[reader.uid]?.sequence ?? 0
          const previous = watches.get(c.id)
          if (previous?.sequence === sequence) continue
          previous?.stop()
          watches.delete(c.id)
          if (sequence >= c.lastSequence) continue
          const watch = { sequence, count: null as number | null, stop: () => {} }
          watches.set(c.id, watch)
          watch.stop = listen<StaffMessage>(
            query(collection(db, path, c.id, 'messages'), where('sequence', '>', sequence)),
            (s) => s.docs.map(message),
            (messages) => {
              if (watches.get(c.id) !== watch) return
              if (messages.status === 'live') {
                const known = knownSequences.get(c.id) ?? c.lastSequence
                if (messages.rows.some((m) => m.senderUid !== reader.uid && m.sequence > known))
                  onIncoming?.()
                knownSequences.set(
                  c.id,
                  messages.rows.reduce((highest, m) => Math.max(highest, m.sequence), known),
                )
              }
              watch.count =
                messages.status === 'live'
                  ? messages.rows.filter((m) => m.senderUid !== reader.uid).length
                  : null
              emit()
            },
          )
        }
        emit()
      }, true)
      return () => {
        stop()
        clear()
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
