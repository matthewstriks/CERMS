import { createHash } from 'node:crypto'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const uuid = (v) =>
  typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)
const chatId = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const exact = (d, keys) =>
  d &&
  typeof d === 'object' &&
  !Array.isArray(d) &&
  Object.keys(d).sort().join() === keys.sort().join()
export function validMessagingRequest(d) {
  if (!d || !id(d.business)) return false
  const base = ['business', 'action']
  switch (d.action) {
    case 'directory':
      return exact(d, [...base, 'cursor']) && (d.cursor === null || id(d.cursor))
    case 'start':
      return (
        exact(d, [...base, 'recipients']) &&
        Array.isArray(d.recipients) &&
        d.recipients.length >= 1 &&
        d.recipients.length <= 9 &&
        d.recipients.every(id) &&
        new Set(d.recipients).size === d.recipients.length
      )
    case 'send':
      return (
        exact(d, [...base, 'chatId', 'requestId', 'text']) &&
        chatId(d.chatId) &&
        uuid(d.requestId) &&
        typeof d.text === 'string' &&
        !!d.text.trim() &&
        d.text.length <= 10000
      )
    case 'read':
      return exact(d, [...base, 'chatId', 'messageId']) && chatId(d.chatId) && uuid(d.messageId)
    case 'search':
      return (
        exact(d, [...base, 'chatId', 'query', 'before']) &&
        chatId(d.chatId) &&
        typeof d.query === 'string' &&
        !!d.query.trim() &&
        d.query.length <= 200 &&
        (d.before === null || (Number.isSafeInteger(d.before) && d.before > 0))
      )
    default:
      return false
  }
}
const displayName = (p) =>
  typeof p.displayName === 'string' && p.displayName.trim() ? p.displayName.trim() : p.uid
const millis = (t) => t?.toMillis?.() ?? (t?.timestampValue ? Date.parse(t.timestampValue) : null)
export async function staffMessaging(request, { db, fail, timestamp }) {
  const d = request.data,
    uid = request.auth?.uid
  if (!validMessagingRequest(d)) fail('invalid-argument', 'Check the messaging request.')
  if (!id(uid)) fail('permission-denied', 'Sign in to message staff.')
  return db.runTransaction(async (tx) => {
    const [profileSnap, business] = await Promise.all([
      tx.get(db.doc('users/' + uid)),
      tx.get(db.doc('system/' + d.business)),
    ])
    const profile = profileSnap.data()
    if (!profile || profile.uid !== uid || profile.access !== d.business || !business.exists)
      fail('permission-denied', 'Your business access changed. Reopen Messages.')
    const path = `system/${d.business}/staffChats`
    if (d.action === 'directory') {
      let query = db.collection('users').where('access', '==', d.business)
      if (d.cursor) {
        const cursor = await tx.get(db.doc('users/' + d.cursor))
        if (!cursor.exists || cursor.data().access !== d.business)
          fail('failed-precondition', 'Staff directory changed. Refresh the search.')
        query = query.startAfter(cursor)
      }
      const result = await tx.get(query.limit(50))
      return {
        staff: result.docs.flatMap((s) => {
          const p = s.data()
          return s.id === uid || p.uid !== s.id ? [] : [{ uid: s.id, name: displayName(p) }]
        }),
        nextCursor: result.docs.length === 50 ? result.docs.at(-1).id : null,
      }
    }
    if (d.action === 'start') {
      if (d.recipients.includes(uid)) fail('invalid-argument', 'Choose other staff members.')
      const participants = [...d.recipients, uid].sort()
      const profiles = await Promise.all(participants.map((p) => tx.get(db.doc('users/' + p))))
      if (
        profiles.some(
          (p, i) => !p.exists || p.data().uid !== participants[i] || p.data().access !== d.business,
        )
      )
        fail('permission-denied', 'Every recipient must be staff in your saved business.')
      const conversationId = createHash('sha256').update(JSON.stringify(participants)).digest('hex')
      const ref = db.doc(path + '/' + conversationId),
        prior = await tx.get(ref)
      if (!prior.exists)
        tx.create(ref, {
          participantUids: participants,
          participantNames: Object.fromEntries(
            profiles.map((p, i) => [participants[i], displayName(p.data())]),
          ),
          createdBy: uid,
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastSequence: 0,
          lastMessage: null,
          readBy: {},
        })
      return { chatId: conversationId }
    }
    const ref = db.doc(path + '/' + d.chatId),
      c = (await tx.get(ref)).data()
    if (!c || !Array.isArray(c.participantUids) || !c.participantUids.includes(uid))
      fail('permission-denied', 'This conversation is private to its participants.')
    const messagePath = path + '/' + d.chatId + '/messages'
    if (d.action === 'search') {
      let query = db.collection(messagePath).orderBy('sequence', 'desc')
      if (d.before !== null) query = query.startAfter(d.before)
      const result = await tx.get(query.limit(100)),
        needle = d.query.trim().toLocaleLowerCase('en-US')
      return {
        messages: result.docs.flatMap((s) => {
          const m = s.data()
          return m.text.toLocaleLowerCase('en-US').includes(needle)
            ? [
                {
                  id: s.id,
                  sequence: m.sequence,
                  senderUid: m.senderUid,
                  senderName: m.senderName,
                  text: m.text,
                  sentAt: millis(m.sentAt),
                },
              ]
            : []
        }),
        nextBefore: result.docs.length === 100 ? result.docs.at(-1).data().sequence : null,
      }
    }
    const messageRef = db.doc(messagePath + '/' + (d.requestId ?? d.messageId))
    const prior = (await tx.get(messageRef)).data()
    if (d.action === 'read') {
      if (
        !prior ||
        !Number.isSafeInteger(prior.sequence) ||
        prior.sequence <= 0 ||
        prior.sequence > c.lastSequence
      )
        fail('failed-precondition', 'Reload this conversation before marking it read.')
      if ((c.readBy?.[uid]?.sequence ?? 0) < prior.sequence)
        tx.update(ref, {
          readBy: {
            ...c.readBy,
            [uid]: { sequence: prior.sequence, readAt: timestamp(), name: displayName(profile) },
          },
        })
      return { read: true }
    }
    if (prior) {
      if (prior.senderUid !== uid || prior.text !== d.text.trim())
        fail('already-exists', 'This message request already contains different text.')
      return { messageId: d.requestId }
    }
    const participants = await Promise.all(
      c.participantUids.map((p) => tx.get(db.doc('users/' + p))),
    )
    if (
      participants.some(
        (p, i) =>
          !p.exists || p.data().uid !== c.participantUids[i] || p.data().access !== d.business,
      )
    )
      fail(
        'failed-precondition',
        'A participant no longer belongs to this business. Start a conversation with current staff.',
      )
    if (
      !Number.isSafeInteger(c.lastSequence) ||
      c.lastSequence < 0 ||
      c.lastSequence >= Number.MAX_SAFE_INTEGER
    )
      fail('failed-precondition', 'This conversation needs administrator review.')
    const message = {
      sequence: c.lastSequence + 1,
      text: d.text.trim(),
      senderUid: uid,
      senderName: displayName(profile),
      sentAt: timestamp(),
    }
    tx.create(messageRef, message)
    tx.update(ref, {
      lastSequence: message.sequence,
      updatedAt: timestamp(),
      lastMessage: { ...message, text: message.text.slice(0, 200) },
      participantNames: Object.fromEntries(
        participants.map((p, i) => [c.participantUids[i], displayName(p.data())]),
      ),
    })
    return { messageId: d.requestId }
  })
}
