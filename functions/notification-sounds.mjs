export async function saveNotificationSoundPreference(request, { db, fail }) {
  const uid = request.auth?.uid,
    d = request.data
  if (!uid) fail('unauthenticated', 'Sign in to save sound preferences.')
  if (
    !d ||
    Array.isArray(d) ||
    Object.keys(d).sort().join() !== 'enabled,volume' ||
    typeof d.enabled !== 'boolean' ||
    !Number.isInteger(d.volume) ||
    d.volume < 0 ||
    d.volume > 100
  )
    fail('invalid-argument', 'Choose enabled and a volume from 0 to 100.')
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}`),
      profile = await tx.get(ref)
    if (!profile.exists || profile.data().uid !== uid)
      fail('permission-denied', 'Your staff profile is unavailable.')
    tx.update(ref, { notificationSoundPreference: { enabled: d.enabled, volume: d.volume } })
  })
  return { enabled: d.enabled, volume: d.volume }
}
