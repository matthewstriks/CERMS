import { createHash } from 'node:crypto'
import { validStaffManagementData } from './staff-management-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const version = (s) =>
  s.updateTime
    ? `${s.updateTime.seconds}.${String(s.updateTime.nanoseconds).padStart(9, '0')}`
    : null
const view = (s, business) => ({
  uid: s.id,
  name: s.data().displayName ?? '',
  email: s.data().email ?? '',
  club: business,
  profileVersion: version(s),
})
/** CERMS 5 profiles only. This service intentionally has no Firebase Auth dependency. */
export async function manageStaffAccounts(request, { db, fail, timestamp }) {
  if (!request.auth) fail('unauthenticated', 'Sign in to manage staff.')
  const d = request.data,
    actor = request.auth.uid
  if (!validStaffManagementData(d)) fail('invalid-argument', 'Check staff account details.')
  const base = `system/${d.business}`
  async function authorize(tx) {
    const [profile, system, permissions] = await Promise.all([
      tx.get(db.doc('users/' + actor)),
      tx.get(db.doc(base)),
      tx.get(db.doc(`${base}/staffPermissions/${actor}`)),
    ])
    if (
      !profile.exists ||
      profile.data().uid !== actor ||
      profile.data().access !== d.business ||
      !system.exists
    )
      fail('permission-denied', 'Business access changed. Reopen Users & permissions.')
    const p = permissions.data()?.permissions ?? {}
    if (actor !== owner) {
      const allowed =
        d.action === 'update'
          ? p.editStaffProfiles === true
          : d.action === 'remove'
            ? p.removeStaffAccounts === true
            : p.editStaffProfiles === true || p.removeStaffAccounts === true
      if (!allowed)
        fail('permission-denied', 'You do not have permission to manage staff profiles.')
    }
  }
  if (d.action === 'list') {
    await db.runTransaction(authorize)
    let q = db.collection('users').where('access', '==', d.business).orderBy('__name__').limit(51)
    if (d.cursor) q = q.startAfter(d.cursor)
    const result = await q.get()
    await db.runTransaction(authorize)
    const docs = result.docs.slice(0, 50)
    return {
      rows: docs.map((s) => view(s, d.business)),
      more: result.docs.length > 50,
      cursor: docs.at(-1)?.id ?? null,
    }
  }
  const targetRef = db.doc('users/' + d.uid)
  const auditRef = d.requestId ? db.doc(`${base}/staffManagementRequests/${d.requestId}`) : null
  return db.runTransaction(async (tx) => {
    await authorize(tx)
    if (
      (d.uid === owner && actor !== owner) ||
      (d.action === 'remove' && (d.uid === owner || d.uid === actor))
    )
      fail('permission-denied', 'The owner and your own access cannot be removed or reassigned.')
    const [target, prior] = await Promise.all([
      tx.get(targetRef),
      auditRef ? tx.get(auditRef) : Promise.resolve(null),
    ])
    const normalized =
      d.action === 'update'
        ? { displayName: d.profile.displayName.trim(), email: d.profile.email.trim().toLowerCase() }
        : null
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          actor,
          action: d.action,
          uid: d.uid,
          business: d.business,
          expectedProfileVersion: d.expectedProfileVersion,
          profile: normalized,
        }),
      )
      .digest('hex')
    if (prior?.exists) {
      if (prior.data().fingerprint !== fingerprint)
        fail('already-exists', 'Retry with the original staff changes.')
      return { uid: d.uid, status: 'complete' }
    }
    if (!target.exists || target.data().uid !== d.uid || target.data().access !== d.business)
      fail('not-found', 'This staff account is not in your business.')
    if (d.action === 'get') return view(target, d.business)
    if (version(target) !== d.expectedProfileVersion)
      fail('failed-precondition', 'Profile changed. Reload before saving or removing access.')
    const permissionsRef = db.doc(`${base}/staffPermissions/${d.uid}`)
    const targetPermissions = await tx.get(permissionsRef)
    if (d.action === 'remove') {
      const claim = await tx.get(db.doc(`${base}/registerOwners/${d.uid}`))
      if (claim.exists && typeof claim.data().registerId === 'string') {
        const register = await tx.get(db.doc(`${base}/registers/${claim.data().registerId}`))
        if (register.exists && register.data().status === 'open')
          fail('failed-precondition', 'Close this staff member’s register before removing access.')
      }
      tx.delete(targetRef)
      if (targetPermissions.exists) tx.delete(permissionsRef)
    } else {
      const updates = {}
      if (target.data().displayName !== normalized.displayName)
        updates.displayName = normalized.displayName
      // Missing optional email stays missing unless deliberately changed.
      if ((target.data().email ?? '') !== normalized.email) updates.email = normalized.email
      if (Object.keys(updates).length) tx.update(targetRef, updates)
    }
    tx.create(auditRef, {
      actorUid: actor,
      targetUid: d.uid,
      action: d.action,
      fingerprint,
      status: 'complete',
      before: {
        displayName: target.data().displayName ?? null,
        email: target.data().email ?? null,
      },
      ...(normalized ? { after: normalized } : {}),
      createdAt: timestamp(),
    })
    return { uid: d.uid, status: 'complete' }
  })
}
