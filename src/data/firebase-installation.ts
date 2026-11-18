import { getFirebaseServices } from './firebase-membership'
export async function reportInstallationAfterSignIn(uid: string) {
  const { auth } = getFirebaseServices(),
    user = auth.currentUser
  if (!user || user.uid !== uid) return
  const token = await user.getIdToken()
  if (auth.currentUser?.uid !== uid) return
  await window.desktop.reportInstallation(token)
}
