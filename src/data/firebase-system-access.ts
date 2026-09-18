import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import { canSwitchSystems, isSystemId, systemSwitcherUid } from '../shared/firebase-policy'

export interface SystemOption {
  id: string
  name: string
}
function requireSwitcher() {
  const services = getFirebaseServices()
  if (!canSwitchSystems(services.auth.currentUser?.uid))
    throw new Error('This account cannot switch systems.')
  return services
}
export async function listSystems(): Promise<SystemOption[]> {
  const { db } = requireSwitcher()
  const result = await getDocs(collection(db, 'system'))
  requireSwitcher()
  return result.docs
    .filter((record) => isSystemId(record.id))
    .map((record) => {
      const name = record.data().businessName
      return {
        id: record.id,
        name: typeof name === 'string' && name.trim() ? name.trim() : record.id,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/** Explicit user action only; never called by sign-in or by listing systems. */
export async function changeSystemAccess(systemId: string): Promise<void> {
  const { db } = requireSwitcher()
  if (!isSystemId(systemId)) throw new Error('Choose a valid system.')
  const target = await getDoc(doc(db, 'system', systemId))
  if (!target.exists()) throw new Error('That system no longer exists. Choose another system.')
  const profile = await getDoc(doc(db, 'users', systemSwitcherUid))
  if (!profile.exists()) throw new Error('Your user profile could not be found.')
  requireSwitcher()
  if (profile.data().access === systemId) return
  // updateDoc requires an existing document and preserves every other profile field.
  await updateDoc(doc(db, 'users', systemSwitcherUid), { access: systemId })
}

export function systemSwitchError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'permission-denied')
    return 'Your Firebase permissions do not allow this system operation.'
  if (code === 'unavailable' || code === 'auth/network-request-failed')
    return 'Firebase could not be reached. Check your connection and try again.'
  if (code) return 'The system operation could not be confirmed. Please try again.'
  return error instanceof Error ? error.message : 'The system operation could not be confirmed.'
}
