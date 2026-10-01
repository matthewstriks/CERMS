import { readStaffPermissions, requireStaffPermission } from './firebase-staff-permissions'
import { doc, getDoc } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import {
  readVersionedDocument,
  documentBase,
  type VersionedDocument,
} from './firebase-versioned-document'
import { memberEditFields, validateMemberEdit, type MemberEditDraft } from '../domain/member-edit'
import { memberHash, normalizeGovernmentId } from '../domain/dev-member'
import {
  canManageMembers,
  isMemberManagementCommit,
  memberEditCommit,
  memberDeleteCommit,
  type IdentityChange,
} from '../shared/member-management-policy'
import { createCatalog } from './firebase-catalog'
import { catalogMembershipOptions, catalogMembershipOption } from './catalog-memberships'
import { validProduct } from '../domain/catalog'
import { dobVariants } from './membership-search'
import type { MembershipReader } from './membership-contracts'

export interface EditableMember {
  snapshot: VersionedDocument
  id: string
  draft: MemberEditDraft
  membershipName: string
  number: string
}
const value = (s: VersionedDocument, key: string): any => {
  const f = s.fields[key]
  return (
    f?.stringValue ??
    f?.booleanValue ??
    (f?.integerValue !== undefined ? Number(f.integerValue) : f?.doubleValue)
  )
}
export function createMemberManagement(reader: Pick<MembershipReader, 'uid' | 'club'>) {
  const { auth, db } = getFirebaseServices()
  async function session() {
    const permissions = await readStaffPermissions(reader.uid, reader.club)
    if (
      !canManageMembers(reader.uid, reader.club, permissions) ||
      auth.currentUser?.uid !== reader.uid
    )
      throw new Error('Member management permission is required.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    if (
      !profile.exists() ||
      profile.data().access !== reader.club ||
      auth.currentUser?.uid !== reader.uid
    )
      throw new Error('Your business access changed. Reopen the member.')
  }
  async function read(id: string) {
    await session()
    const snapshot = await readVersionedDocument(`members/${id}`)
    if (snapshot && value(snapshot, 'access') !== reader.club)
      throw new Error('This member belongs to a different business.')
    await session()
    return snapshot
  }
  async function identityFor(
    snapshot: VersionedDocument,
    id: string,
  ): Promise<IdentityChange | undefined> {
    const key = value(snapshot, 'identityKey')
    if (reader.club !== 'dev' || value(snapshot, 'schemaVersion') !== 2) return undefined
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
      throw new Error(
        'This member’s identity reservation needs review before changes can be saved.',
      )
    const claim = await readVersionedDocument(`system/dev/memberIdentities/${key}`)
    if (!claim || value(claim, 'memberId') !== id)
      throw new Error('This member’s identity reservation could not be verified.')
    return { oldKey: key, oldTime: claim.updateTime }
  }
  async function send(payload: unknown) {
    const body = JSON.stringify(payload)
    if (!isMemberManagementCommit(body))
      throw new Error('The member changes do not match the permitted format.')
    await session()
    try {
      return await fetch(`https://firestore.googleapis.com/v1/${documentBase}:commit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body,
      })
    } catch {
      return undefined
    }
  }
  return {
    async load(id: string): Promise<EditableMember> {
      const snapshot = await read(id)
      if (!snapshot) throw new Error('This member no longer exists.')
      let birthDate = String(value(snapshot, 'dob') ?? '')
      try {
        birthDate = dobVariants(birthDate)[0]!
      } catch {
        /* Show the value for correction. */
      }
      return {
        snapshot,
        id,
        membershipName: String(value(snapshot, 'membership_type') ?? ''),
        number: String(value(snapshot, 'id_number') ?? ''),
        draft: {
          firstName: String(value(snapshot, 'fname') ?? ''),
          middleName: String(value(snapshot, 'mname') ?? ''),
          lastName: String(value(snapshot, 'lname') ?? ''),
          suffix: String(value(snapshot, 'suffix') ?? ''),
          birthDate,
          governmentId: String(value(snapshot, 'idnum') ?? ''),
          governmentIdType: String(value(snapshot, 'idstate') ?? ''),
          email: String(value(snapshot, 'email') ?? ''),
          phone: String(value(snapshot, 'phone') ?? ''),
          expiresAt: Number(value(snapshot, 'id_expiration') ?? NaN),
          dna: value(snapshot, 'dna') === true,
          tagged: value(snapshot, 'tag') === true,
          productId: '',
        },
      }
    },
    async options() {
      await session()
      const options = await catalogMembershipOptions(createCatalog(reader), reader.uid)
      await session()
      return options
    },
    async save(original: EditableMember, input: MemberEditDraft) {
      await requireStaffPermission(reader.uid, reader.club, 'editMembers')
      await session()
      const draft = validateMemberEdit(input)
      let membership = original.membershipName
      if (draft.productId) {
        const snapshot = await getDoc(doc(db, 'system', reader.club, 'products', draft.productId))
        if (!snapshot.exists()) throw new Error('The selected membership product no longer exists.')
        const { version: _version, updatedAt: _time, updatedBy: _actor, ...data } = snapshot.data()
        if (!validProduct(data)) throw new Error('The selected product format is unsupported.')
        const option = catalogMembershipOption(snapshot.id, data, reader.uid)
        if (!option) throw new Error('Choose an active membership product available to you.')
        membership = option.name
      }
      const fields: Record<string, unknown> = memberEditFields(draft, membership, reader.uid)
      const current = await read(original.id)
      if (!current) throw new Error('This member no longer exists.')
      if (current.updateTime !== original.snapshot.updateTime) {
        if (Object.entries(fields).every(([key, v]) => value(current, key) === v)) return
        throw new Error(
          'This member changed since you opened the editor. Close and reopen it before saving.',
        )
      }
      const originalIdentity = await identityFor(original.snapshot, original.id)
      let identity: IdentityChange | undefined
      if (originalIdentity) {
        const newKey = await memberHash([
          'dev',
          draft.governmentIdType,
          normalizeGovernmentId(draft.governmentId),
          draft.birthDate,
        ])
        if (newKey !== originalIdentity.oldKey) {
          if (await readVersionedDocument(`system/dev/memberIdentities/${newKey}`))
            throw new Error('Another member already uses this issuing state, ID and date of birth.')
          identity = { ...originalIdentity, newKey }
          fields.identityKey = newKey
        }
      }
      const response = await send(
        memberEditCommit(original.id, original.snapshot.updateTime, fields, identity),
      )
      if (response?.ok) return
      const after = await read(original.id)
      if (after && Object.entries(fields).every(([key, v]) => value(after, key) === v)) return
      if (
        response?.status === 409 ||
        response?.status === 412 ||
        (after && after.updateTime !== original.snapshot.updateTime)
      )
        throw new Error(
          'This member changed since you opened the editor. Close and reopen it before saving.',
        )
      throw new Error(
        'Save was not confirmed. Check your connection and member-management permissions, then retry with the same details.',
      )
    },
    async remove(original: EditableMember) {
      await requireStaffPermission(reader.uid, reader.club, 'deleteMembers')
      const current = await read(original.id)
      if (!current) return
      if (current.updateTime !== original.snapshot.updateTime)
        throw new Error('This member changed. Reopen the delete confirmation before continuing.')
      if (value(current, 'checkedIn') === true)
        throw new Error('This member is checked in. Finish the visit before deleting the record.')
      const identity = await identityFor(current, original.id)
      const response = await send(memberDeleteCommit(original.id, current.updateTime, identity))
      if (response?.ok || !(await read(original.id))) return
      throw new Error(
        'Deletion was not confirmed. The record may have changed or deletion may not be permitted. Reopen the member before retrying.',
      )
    },
  }
}
export type MemberManagementClient = ReturnType<typeof createMemberManagement>
