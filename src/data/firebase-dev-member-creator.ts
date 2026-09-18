import { doc, getDoc } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import {
  canCreateDevMember,
  devMemberCommit,
  isDevMemberCommit,
  type DevMemberFields,
} from '../shared/dev-member-policy'
import {
  devMembership,
  devMemberRecord,
  memberHash,
  normalizeGovernmentId,
  validateDevMember,
} from '../domain/dev-member'
import type { MemberCreator } from '../domain/member-creation'

/** Deliberate owner-only creation in dev. Every write is create-only and atomically reserves its identity and number. */
export function createDevMemberCreator(uid: string, club: string): MemberCreator {
  if (!canCreateDevMember(uid, club))
    throw new Error('Member creation is available only to the owner in Dev System.')
  const { auth, db } = getFirebaseServices()
  async function checkSession() {
    if (auth.currentUser?.uid !== uid) throw new Error('Sign in again before creating a member.')
    const profile = await getDoc(doc(db, 'users', uid))
    if (!profile.exists() || profile.data().access !== 'dev')
      throw new Error('Your system changed. Reopen member creation in Dev System.')
  }
  return {
    async options() {
      await checkSession()
      return [devMembership]
    },
    async create(input, requestId) {
      if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('Invalid creation request.')
      await checkSession()
      const draft = validateDevMember(input)
      const fingerprint = await memberHash(draft)
      const identity = await memberHash([
        'dev',
        draft.governmentIdType,
        normalizeGovernmentId(draft.governmentId),
        draft.birthDate,
      ])
      const ref = doc(db, 'members', requestId)
      async function priorResult() {
        const prior = await getDoc(ref)
        if (!prior.exists()) return null
        const data = prior.data()
        if (data.access !== 'dev' || data.createdBy !== uid || data.fingerprint !== fingerprint)
          throw new Error('This request already saved different details. Start a new member.')
        return { id: prior.id, number: data.id_number as number, name: data.name as string }
      }
      const prior = await priorResult()
      if (prior) return prior
      if ((await getDoc(doc(db, 'system', 'dev', 'memberIdentities', identity))).exists())
        throw new Error('A member with this issuing state, ID and date of birth already exists.')
      for (let attempt = 0; attempt < 5; attempt++) {
        const number = 100000000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000000)
        const record = devMemberRecord(draft, uid, number, identity, fingerprint)
        const fields: DevMemberFields = {}
        for (const [key, value] of Object.entries(record)) {
          if (key === 'creation_time') continue
          fields[key] =
            typeof value === 'string'
              ? { stringValue: value }
              : typeof value === 'number'
                ? { integerValue: String(value) }
                : typeof value === 'boolean'
                  ? { booleanValue: value }
                  : {
                      arrayValue: {
                        values: (value as string[]).map((stringValue) => ({ stringValue })),
                      },
                    }
        }
        const body = JSON.stringify(devMemberCommit(requestId, fields, identity, number))
        if (!isDevMemberCommit(body))
          throw new Error('Member details do not match the supported development format.')
        await checkSession()
        let response: Response
        try {
          const token = await auth.currentUser!.getIdToken()
          response = await fetch(
            'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body,
            },
          )
        } catch {
          const saved = await priorResult()
          if (saved) return saved
          throw new Error(
            'Save could not be confirmed. Retry with the same details; do not clear the form.',
          )
        }
        if (response.ok) return { id: requestId, number, name: record.name }
        const saved = await priorResult()
        if (saved) return saved
        if ((await getDoc(doc(db, 'system', 'dev', 'memberIdentities', identity))).exists())
          throw new Error('This member already exists. No existing record was changed.')
        if ((await getDoc(doc(db, 'system', 'dev', 'memberNumbers', String(number)))).exists())
          continue
        throw new Error(
          response.status === 403
            ? 'Dev member creation is not permitted by the current Firebase rules.'
            : 'Unable to confirm the save. Retry with the same details.',
        )
      }
      throw new Error('Unable to reserve a membership number. Retry with the same details.')
    },
  }
}
