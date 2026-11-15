import { createHash } from 'node:crypto'
import { OWNER } from './staff-account.mjs'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const uuid = (v) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)
const exact = (d, keys) => d && Object.keys(d).sort().join() === keys.sort().join()
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const legacyNotes = (m) =>
  (Array.isArray(m.notes) ? m.notes : typeof m.notes === 'string' ? [m.notes] : []).flatMap(
    (text, index) =>
      typeof text === 'string'
        ? [
            {
              id: 'legacy_' + hash([index, text, m.notes]),
              text,
              kind: 'legacy',
              actorName: '',
              actorUid: '',
              createdAt: null,
            },
          ]
        : [],
  )
const millis = (t) => t?.toMillis?.() ?? (t?.timestampValue ? Date.parse(t.timestampValue) : null)
export async function memberNotes(request, { db, fail, timestamp }) {
  const d = request.data
  const extras = {
    list: ['cursor'],
    add: ['requestId', 'text'],
    remove: ['noteId'],
    dna: ['requestId', 'enabled', 'reason', 'expectedDna'],
  }
  if (
    !d ||
    !extras[d.action] ||
    !exact(d, ['business', 'memberId', 'action', ...extras[d.action]]) ||
    !id(d.business) ||
    !id(d.memberId)
  )
    fail('invalid-argument', 'Check the member note request.')
  if (
    (d.action === 'list' && d.cursor !== null && !uuid(d.cursor)) ||
    (d.action === 'add' &&
      (!uuid(d.requestId) ||
        typeof d.text !== 'string' ||
        !d.text.trim() ||
        d.text.length > 10000)) ||
    (d.action === 'remove' && !uuid(d.noteId) && !/^legacy_[a-f0-9]{64}$/.test(d.noteId)) ||
    (d.action === 'dna' &&
      (!uuid(d.requestId) ||
        typeof d.enabled !== 'boolean' ||
        typeof d.expectedDna !== 'boolean' ||
        typeof d.reason !== 'string' ||
        d.reason.length > 10000 ||
        (d.enabled && !d.reason.trim())))
  )
    fail('invalid-argument', 'Enter a note, or a reason for Do not admit.')
  return db.runTransaction(async (tx) => {
    const uid = request.auth?.uid
    if (!id(uid)) fail('permission-denied', 'Sign in to your business.')
    const [profileSnap, system, permissions, memberSnap] = await Promise.all([
      tx.get(db.doc('users/' + uid)),
      tx.get(db.doc('system/' + d.business)),
      tx.get(db.doc(`system/${d.business}/staffPermissions/${uid}`)),
      tx.get(db.doc('members/' + d.memberId)),
    ])
    const profile = profileSnap.data(),
      m = memberSnap.data()
    if (
      !profile ||
      profile.uid !== uid ||
      profile.access !== d.business ||
      !system.exists ||
      !m ||
      m.access !== d.business
    )
      fail('permission-denied', 'This member is not available in your saved business.')
    const permitted = (key) => uid === OWNER || permissions.data()?.permissions?.[key] === true
    if (d.action === 'remove' && !permitted('removeMemberNotes'))
      fail('permission-denied', 'Remove member notes permission is required.')
    if (d.action === 'dna' && !permitted('editMembers'))
      fail('permission-denied', 'Edit member permission is required for DNA changes.')
    const revision = m.notesRevision ?? 0
    if (!Number.isSafeInteger(revision) || revision < 0)
      fail('failed-precondition', 'The member notes revision needs review.')
    const path = `system/${d.business}/memberNotes/${d.memberId}/entries`
    if (d.action === 'list') {
      let q = db.collection(path).orderBy('createdAt', 'desc')
      if (d.cursor) {
        const cursor = await tx.get(db.doc(path + '/' + d.cursor))
        if (!cursor.exists) fail('failed-precondition', 'Notes changed. Reload them.')
        q = q.startAfter(cursor)
      }
      const page = await tx.get(q.limit(50))
      return {
        name: m.name || [m.fname, m.lname].filter(Boolean).join(' '),
        dna: m.dna === true,
        tagged: m.tag === true,
        revision,
        notes: [
          ...(!d.cursor ? legacyNotes(m) : []),
          ...page.docs.flatMap((s) => {
            const n = s.data()
            return n.deleted
              ? []
              : [
                  {
                    id: s.id,
                    kind: n.kind,
                    text: n.text,
                    actorUid: n.actorUid,
                    actorName: n.actorName,
                    createdAt: millis(n.createdAt),
                  },
                ]
          }),
        ],
        nextCursor: page.docs.length === 50 ? page.docs.at(-1).id : null,
      }
    }
    const memberRef = db.doc('members/' + d.memberId)
    if (typeof profile.displayName !== 'string' || !profile.displayName.trim())
      fail('failed-precondition', 'Your staff profile needs a name before recording notes.')
    if (d.action === 'remove' && d.noteId.startsWith('legacy_')) {
      const markerRef = db.doc(
        `system/${d.business}/memberNotes/${d.memberId}/removedLegacy/${d.noteId}`,
      )
      if ((await tx.get(markerRef)).exists) return { saved: true }
      const notes = legacyNotes(m),
        target = notes.find((n) => n.id === d.noteId)
      if (!target) fail('failed-precondition', 'Notes changed. Reload before removing this note.')
      const raw = Array.isArray(m.notes) ? m.notes : [m.notes]
      const index = raw.findIndex((text, i) => 'legacy_' + hash([i, text, m.notes]) === d.noteId)
      tx.create(markerRef, { removedBy: uid, removedAt: timestamp() })
      tx.update(memberRef, {
        notes: raw.filter((_, i) => i !== index),
        notesRevision: revision + 1,
      })
      return { saved: true }
    }
    const noteRef = db.doc(path + '/' + (d.noteId ?? d.requestId)),
      prior = (await tx.get(noteRef)).data()
    if (d.action === 'remove') {
      if (!prior) fail('failed-precondition', 'This note no longer exists.')
      if (prior.deleted) return { saved: true }
      tx.update(noteRef, {
        text: '',
        deleted: true,
        removedBy: uid,
        removedByName: profile.displayName,
        removedAt: timestamp(),
      })
    } else {
      const fingerprint = hash([
        d.action,
        d.text ?? null,
        d.enabled ?? null,
        d.reason ?? null,
        d.expectedDna ?? null,
      ])
      if (prior) {
        if (prior.actorUid !== uid || prior.fingerprint !== fingerprint)
          fail('already-exists', 'This note request already has different details.')
        return { saved: true }
      }
      if (d.action === 'dna' && ((m.dna === true) !== d.expectedDna || d.enabled === d.expectedDna))
        fail('failed-precondition', 'DNA status changed. Reload the member before saving.')
      tx.create(noteRef, {
        text:
          d.action === 'add' ? d.text.trim() : d.reason.trim() || 'Do not admit status cleared.',
        kind: d.action === 'add' ? 'note' : d.enabled ? 'dna' : 'dna-cleared',
        actorUid: uid,
        actorName: profile.displayName,
        createdAt: timestamp(),
        fingerprint,
        deleted: false,
      })
    }
    tx.update(memberRef, {
      notesRevision: revision + 1,
      ...(d.action === 'dna' ? { dna: d.enabled } : {}),
    })
    return { saved: true }
  })
}
