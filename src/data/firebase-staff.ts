import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  startAfter,
  documentId,
  orderBy,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
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
}
export interface StaffAccountDraft {
  displayName: string
  email: string
  password: string
  permissions: StaffPermissions
}
export function createStaffManager(reader: { uid: string; club: string }) {
  const { auth, db } = getFirebaseServices()
  let cursor: QueryDocumentSnapshot | undefined
  async function session() {
    if (reader.uid !== ownerUid || auth.currentUser?.uid !== ownerUid)
      throw new Error('Only the owner can manage staff accounts.')
    const profile = await getDoc(doc(db, 'users', ownerUid))
    if (
      !profile.exists() ||
      profile.data().access !== reader.club ||
      auth.currentUser?.uid !== ownerUid
    )
      throw new Error('Your business access changed. Reopen Users & permissions.')
  }
  return {
    async list(reset = true) {
      await session()
      if (reset) cursor = undefined
      const page = await getDocs(
        query(
          collection(db, 'users'),
          where('access', '==', reader.club),
          orderBy(documentId()),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(50),
        ),
      )
      await session()
      cursor = page.docs.at(-1)
      return {
        rows: page.docs.map((d) => ({
          uid: d.id,
          name: String(d.data().displayName ?? 'Unnamed staff'),
          email: String(d.data().email ?? ''),
          club: reader.club,
        })),
        more: page.size === 50,
      }
    },
    async permissions(uid: string) {
      await session()
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
      await session()
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
      await session()
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
