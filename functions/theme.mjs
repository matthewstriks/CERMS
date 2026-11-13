export async function saveThemePreference(request, { db, fail }) {
  const uid = request.auth?.uid,
    d = request.data
  if (!uid) fail('unauthenticated', 'Sign in to save your appearance.')
  if (
    !d ||
    Array.isArray(d) ||
    Object.keys(d).join() !== 'theme' ||
    !['light', 'dark'].includes(d.theme)
  )
    fail('invalid-argument', 'Choose light or dark appearance.')
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}`),
      profile = await tx.get(ref)
    if (!profile.exists || profile.data().uid !== uid)
      fail('permission-denied', 'Your staff profile is unavailable.')
    tx.update(ref, { themePreference: d.theme })
  })
  return { theme: d.theme }
}
