import { createHash } from 'node:crypto'
export const OWNER = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
export const keys = [
  'removeMemberNotes',
  'closeOtherRegisters',
  'deleteProducts',
  'processSales',
  'editMembers',
  'deleteMembers',
  'manageProducts',
  'openRegisters',
  'closeRegisters',
]
export function validateAccount(data, fail) {
  if (
    !data ||
    Object.keys(data).sort().join() !==
      ['business', 'displayName', 'email', 'password', 'permissions', 'requestId'].sort().join()
  )
    fail('invalid-argument', 'Check account details.')
  const { business, requestId, password, permissions } = data
  if (
    typeof business !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(business) ||
    typeof requestId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId)
  )
    fail('invalid-argument', 'Invalid business or request.')
  if (
    typeof data.displayName !== 'string' ||
    !data.displayName.trim() ||
    data.displayName.length > 200 ||
    typeof data.email !== 'string' ||
    data.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())
  )
    fail('invalid-argument', 'Enter a name and valid email.')
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    fail('invalid-argument', 'Use an initial password of 12–128 characters.')
  if (
    !permissions ||
    Object.keys(permissions).some((k) => !keys.includes(k)) ||
    !keys.every(
      (k) =>
        (['processSales', 'deleteProducts', 'closeOtherRegisters', 'removeMemberNotes'].includes(
          k,
        ) &&
          permissions[k] === undefined) ||
        typeof permissions[k] === 'boolean',
    )
  )
    fail('invalid-argument', 'Invalid permissions.')
  return {
    ...data,
    displayName: data.displayName.trim(),
    email: data.email.trim().toLowerCase(),
    permissions: Object.fromEntries(keys.map((k) => [k, permissions[k] ?? false])),
  }
}
/** Admin SDK is server-only; never reset/link/alter an existing login. */
export async function createAccount(request, { db, auth, timestamp, fail }) {
  if (request.auth?.uid !== OWNER)
    fail('permission-denied', 'Only the owner can create staff accounts.')
  const d = validateAccount(request.data, fail)
  const uid = 'cerms5_' + d.requestId
  const profileRef = db.doc('users/' + uid),
    ownerRef = db.doc('users/' + OWNER),
    businessRef = db.doc('system/' + d.business)
  const requestRef = db.doc(`system/${d.business}/staffAccountRequests/${d.requestId}`)
  const permissionRef = db.doc(`system/${d.business}/staffPermissions/${uid}`)
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        business: d.business,
        displayName: d.displayName,
        email: d.email,
        permissions: Object.fromEntries(
          Object.entries(d.permissions).filter(
            ([key, value]) =>
              ![
                'processSales',
                'deleteProducts',
                'closeOtherRegisters',
                'removeMemberNotes',
              ].includes(key) || value,
          ),
        ),
      }),
    )
    .digest('hex')
  const verifyOwner = (owner, business) => {
    if (
      !owner.exists ||
      owner.data().uid !== OWNER ||
      owner.data().access !== d.business ||
      !business.exists
    )
      fail('permission-denied', 'Your business access changed. Reopen Users & permissions.')
  }
  const completed = await db.runTransaction(async (tx) => {
    const [owner, business, prior] = await Promise.all([
      tx.get(ownerRef),
      tx.get(businessRef),
      tx.get(requestRef),
    ])
    verifyOwner(owner, business)
    if (prior.exists) {
      if (prior.data().fingerprint !== fingerprint || prior.data().uid !== uid)
        fail('already-exists', 'This request already contains different details.')
      return prior.data().status === 'complete'
    }
    tx.create(requestRef, {
      uid,
      fingerprint,
      status: 'pending',
      createdBy: OWNER,
      createdAt: timestamp(),
    })
    return false
  })
  if (completed) return { uid, displayName: d.displayName, email: d.email }
  let existing
  try {
    existing = await auth.getUserByEmail(d.email)
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e
  }
  if (existing && existing.uid !== uid)
    fail(
      'already-exists',
      'That email already has a login. Existing accounts are not changed or linked automatically.',
    )
  if (!existing) {
    try {
      await auth.createUser({
        uid,
        email: d.email,
        displayName: d.displayName,
        password: d.password,
        disabled: false,
      })
    } catch (e) {
      if (!['auth/uid-already-exists', 'auth/email-already-exists'].includes(e.code)) throw e
      const user = await auth.getUser(uid).catch(() => null)
      if (!user || user.email?.toLowerCase() !== d.email)
        fail('already-exists', 'That email already has a login.')
    }
  }
  await db.runTransaction(async (tx) => {
    const [owner, business, profile, prior, permissions] = await Promise.all([
      tx.get(ownerRef),
      tx.get(businessRef),
      tx.get(profileRef),
      tx.get(requestRef),
      tx.get(permissionRef),
    ])
    verifyOwner(owner, business)
    if (!prior.exists || prior.data().fingerprint !== fingerprint)
      fail('failed-precondition', 'Account setup could not be verified.')
    if (prior.data().status === 'complete') return
    if (profile.exists || permissions.exists)
      fail(
        'already-exists',
        'A staff record already exists for this login. No existing records were changed.',
      )
    tx.create(profileRef, {
      uid,
      displayName: d.displayName,
      email: d.email,
      access: d.business,
      rank: 'staff',
    })
    tx.create(permissionRef, {
      permissions: d.permissions,
      updatedBy: OWNER,
      updatedAt: timestamp(),
    })
    tx.update(requestRef, { status: 'complete', completedAt: timestamp() })
  })
  return { uid, displayName: d.displayName, email: d.email }
}
