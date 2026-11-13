import { doc, getDoc } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import {
  effectivePermissions,
  ownerUid,
  type StaffPermission,
  type StaffPermissions,
} from '../domain/staff-permissions'
export async function readStaffPermissions(uid: string, club: string): Promise<StaffPermissions> {
  if (uid === ownerUid) return effectivePermissions(uid)
  const { db } = getFirebaseServices()
  const record = await getDoc(doc(db, 'system', club, 'staffPermissions', uid))
  return effectivePermissions(uid, record.exists() ? record.data().permissions : undefined)
}
export async function requireStaffPermission(
  uid: string,
  club: string,
  key: StaffPermission | readonly StaffPermission[],
) {
  const { auth, db } = getFirebaseServices()
  if (auth.currentUser?.uid !== uid) throw new Error('Sign in again to continue.')
  const profile = await getDoc(doc(db, 'users', uid))
  if (!profile.exists() || profile.data().access !== club)
    throw new Error('Your business access changed. Reopen this page.')
  const permissions = await readStaffPermissions(uid, club)
  const keys = typeof key === 'string' ? [key] : key
  if (auth.currentUser?.uid !== uid || !keys.some((k) => permissions[k]))
    throw new Error('You do not have permission for this action.')
}
