export interface NotificationSoundPreference {
  enabled: boolean
  volume: number
}
export const defaultNotificationSoundPreference: Readonly<NotificationSoundPreference> =
  Object.freeze({ enabled: true, volume: 100 })
export function validNotificationSoundPreference(
  value: unknown,
): value is NotificationSoundPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const d = value as Record<string, unknown>
  return (
    Object.keys(d).sort().join() === 'enabled,volume' &&
    typeof d.enabled === 'boolean' &&
    Number.isInteger(d.volume) &&
    Number(d.volume) >= 0 &&
    Number(d.volume) <= 100
  )
}
export const notificationSoundEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/saveNotificationSoundPreference'
export function isNotificationSoundRequest(body?: string) {
  try {
    const d = JSON.parse(body ?? '')
    return !!d && Object.keys(d).join() === 'data' && validNotificationSoundPreference(d.data)
  } catch {
    return false
  }
}
