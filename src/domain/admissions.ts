import { activityFromLegacy, unixSecondsToMillis } from './legacy'
import type { Activity, LegacyDocument } from './legacy'

export interface Admission extends Activity {
  rentalEnabled: boolean
  rentalStartedAt: number | null
  notes: string
  removedMember: boolean
}
export interface AdmissionRow extends Admission {
  memberName: string
  memberNumber: string
  membershipType: string
  memberStatus: 'loading' | 'ready' | 'missing' | 'unavailable' | 'removed'
  dna: boolean
  tagged: boolean
}
export interface AdmissionsState {
  rows: readonly AdmissionRow[]
  status: 'connecting' | 'live' | 'reconnecting' | 'error'
  error?: string
}
export function admissionFromLegacy(id: string, data: LegacyDocument, access: string): Admission {
  const activity = activityFromLegacy(id, data, access)
  const rental = Array.isArray(data.lockerRoomStatus) ? data.lockerRoomStatus : []
  return {
    ...activity,
    active: activity.active && data.goingInactive !== true,
    rentalEnabled: rental[0] === true,
    rentalStartedAt: unixSecondsToMillis(rental[4]),
    notes: typeof data.notes === 'string' && data.notes !== 'false' ? data.notes : '',
    removedMember: data.removed === true,
  }
}
export function rentalTime(visit: Admission, now: number): string {
  if (!visit.rentalEnabled) return '—'
  if (visit.expiresAt === null) return 'Not recorded'
  const seconds = Math.floor(Math.abs(visit.expiresAt - now) / 1000)
  const duration = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return visit.expiresAt <= now ? `${duration} overdue` : duration
}

/** Shared by dashboard alerts, filters, and row highlighting. */
export function rentalUrgency(visit: Admission, now: number): 'expired' | 'soon' | null {
  if (!visit.active || !visit.rentalEnabled || visit.expiresAt === null) return null
  const remaining = visit.expiresAt - now
  if (remaining <= 0) return 'expired'
  return remaining <= 5 * 60 * 1000 ? 'soon' : null
}
