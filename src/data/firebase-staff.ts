import {
  staffManagementEndpoint,
  isStaffManagementRequest,
} from '../shared/staff-management-policy'
import { doc, getDoc } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import { ownerUid, effectivePermissions, type StaffPermissions } from '../domain/staff-permissions'
import {
  isCreateStaffRequest,
  isStaffPermissionCommit,
  staffAccountEndpoint,
  staffPermissionCommit,
} from '../shared/staff-policy'
import { readVersionedDocument, documentBase } from './firebase-versioned-document'
export interface StaffAccount {
  uid: string
  name: string
  email: string
  club: string
  profileVersion?: string
}
export interface StaffAccountDraft {
  displayName: string
  email: string
  password: string
  permissions: StaffPermissions
}
export function createStaffManager(reader: { uid: string; club: string }) {
  const { auth, db } = getFirebaseServices()
  let cursor: string | undefined
  async function session(ownerOnly = false) {
    if (auth.currentUser?.uid !== reader.uid || (ownerOnly && reader.uid !== ownerUid))
      throw new Error('Only the owner can manage staff accounts.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    if (
      !profile.exists() ||
      profile.data().access !== reader.club ||
      auth.currentUser?.uid !== reader.uid
    )
      throw new Error('Your business access changed. Reopen Users & permissions.')
  }
  async function management<T>(data: Record<string, unknown>): Promise<T> {
    await session()
    const body = JSON.stringify({ data: { business: reader.club, ...data } })
    if (!isStaffManagementRequest(body)) throw Error('Invalid staff profile request.')
    const response = await fetch(staffManagementEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
      },
      body,
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.result)
      throw Error(
        result.error?.message || 'Staff change was not confirmed. Retry the original request.',
      )
    return result.result as T
  }
  return {
    async list(reset = true) {
      if (reset) cursor = undefined
      const page = await management<{ rows: StaffAccount[]; more: boolean; cursor: string | null }>(
        { action: 'list', ...(cursor ? { cursor } : {}) },
      )
      cursor = page.cursor ?? undefined
      return { rows: page.rows, more: page.more }
    },
    profile: (uid: string) => management<StaffAccount>({ action: 'get', uid }),
    updateProfile: (
      uid: string,
      profile: { displayName: string; email: string },
      expectedProfileVersion: string,
      requestId: string,
    ) => management({ action: 'update', uid, profile, expectedProfileVersion, requestId }),
    remove: (uid: string, expectedProfileVersion: string, requestId: string) =>
      management({ action: 'remove', uid, expectedProfileVersion, requestId }),
    async permissions(uid: string) {
      await session(true)
      if (uid === ownerUid) return { permissions: effectivePermissions(uid), updateTime: undefined }
      const record = await readVersionedDocument(`system/${reader.club}/staffPermissions/${uid}`)
      const fields = record?.fields.permissions?.mapValue?.fields
      const raw = fields
        ? Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [
              k,
              (v as { booleanValue: boolean }).booleanValue,
            ]),
          )
        : undefined
      return { permissions: effectivePermissions(uid, raw), updateTime: record?.updateTime }
    },
    async savePermissions(uid: string, permissions: StaffPermissions, updateTime?: string) {
      await session(true)
      const body = JSON.stringify(staffPermissionCommit(reader.club, uid, permissions, updateTime))
      if (!isStaffPermissionCommit(body)) throw new Error('Invalid permission update.')
      const response = await fetch(`https://firestore.googleapis.com/v1/${documentBase}:commit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body,
      })
      if (!response.ok)
        throw new Error(
          response.status === 409 || response.status === 412
            ? 'Permissions changed. Reopen this account before saving.'
            : 'Permissions could not be saved. Check your access and the deployed rules.',
        )
    },
    async create(draft: StaffAccountDraft, requestId: string) {
      await session(true)
      const body = JSON.stringify({
        data: {
          ...draft,
          displayName: draft.displayName.trim(),
          email: draft.email.trim().toLowerCase(),
          business: reader.club,
          requestId,
        },
      })
      if (!isCreateStaffRequest(body))
        throw new Error('Enter a name, valid email and an initial password of 12–128 characters.')
      let response: Response
      try {
        response = await fetch(staffAccountEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
            'Content-Type': 'application/json',
          },
          body,
        })
      } catch {
        throw new Error(
          'Account setup was not confirmed. Keep these details and retry; the staff-account service may not be deployed yet.',
        )
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.error)
        throw new Error(
          data.error?.message ?? 'Account setup was not confirmed. Retry with the same details.',
        )
      if (typeof data.result?.uid !== 'string')
        throw new Error('Account setup was not confirmed. Retry with the same details.')
      return data.result as { uid: string; displayName: string; email: string }
    },
  }
}
