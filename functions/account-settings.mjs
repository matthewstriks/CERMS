import { validAccountData } from './account-domain.mjs'
const version = (s) =>
  `${s.updateTime.seconds}.${String(s.updateTime.nanoseconds).padStart(9, '0')}`
export async function accountSettings(request, { db, fail }) {
  const uid = request.auth?.uid,
    d = request.data
  if (!uid) fail('unauthenticated', 'Sign in to manage your account.')
  if (!validAccountData(d)) fail('invalid-argument', 'Check your account details.')
  const email = request.auth.token?.email ?? '',
    verified = request.auth.token?.email_verified === true
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}`),
      profile = await tx.get(ref)
    if (!profile.exists || profile.data().uid !== uid || !profile.data().access)
      fail('permission-denied', 'Your CERMS 5 profile is unavailable.')
    const p = profile.data()
    if (d.action !== 'get') {
      if (d.expectedVersion !== version(profile))
        fail('failed-precondition', 'Your profile changed. Reload account settings and try again.')
      if (d.action === 'saveName') {
        const displayName = d.displayName.trim()
        if (displayName !== p.displayName) tx.update(ref, { displayName })
      } else {
        if (!verified || !email)
          fail('failed-precondition', 'Verify your login email before syncing your profile.')
        if (p.email !== email) tx.update(ref, { email })
      }
      return { saved: true }
    }
    return {
      displayName: p.displayName ?? '',
      profileEmail: p.email ?? '',
      email,
      emailVerified: verified,
      version: version(profile),
    }
  })
}
