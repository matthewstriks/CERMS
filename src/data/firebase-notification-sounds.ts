import { getFirebaseServices } from './firebase-membership'
import {
  notificationSoundEndpoint,
  validNotificationSoundPreference,
  type NotificationSoundPreference,
} from '../shared/notification-sound-policy'
export async function saveNotificationSoundPreference(
  uid: string,
  preference: NotificationSoundPreference,
) {
  const { auth } = getFirebaseServices()
  if (!validNotificationSoundPreference(preference))
    throw new Error('Choose a volume from 0 to 100.')
  if (auth.currentUser?.uid !== uid) throw new Error('Sign in again to save sound preferences.')
  const response = await fetch(notificationSoundEndpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ data: preference }),
  })
  const payload = await response.json(),
    saved = payload.result ?? payload.data
  if (
    !response.ok ||
    payload.error ||
    !validNotificationSoundPreference(saved) ||
    saved.enabled !== preference.enabled ||
    saved.volume !== preference.volume
  )
    throw new Error(
      payload.error?.message ||
        'Sound preferences could not be confirmed. Try saving again when connected.',
    )
}
