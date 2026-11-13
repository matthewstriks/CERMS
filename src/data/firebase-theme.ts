import { getFirebaseServices } from './firebase-membership'
import { themeEndpoint, type ThemePreference } from '../shared/theme-policy'
export async function saveThemePreference(uid: string, theme: ThemePreference) {
  const { auth } = getFirebaseServices()
  if (auth.currentUser?.uid !== uid) throw new Error('Sign in again to save your appearance.')
  const response = await fetch(themeEndpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ data: { theme } }),
  })
  const payload = await response.json()
  if (!response.ok || payload.error || (payload.result ?? payload.data)?.theme !== theme)
    throw new Error(
      payload.error?.message || 'Appearance could not be confirmed. Try again when connected.',
    )
}
