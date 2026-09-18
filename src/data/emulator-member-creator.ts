// Deliberately imported ONLY by the separate local lab, never by the desktop app.
import { initializeApp, deleteApp } from 'firebase/app'
import {
  collection,
  doc,
  getDocs,
  initializeFirestore,
  query,
  runTransaction,
  where,
  Timestamp,
  serverTimestamp,
  terminate,
} from 'firebase/firestore/lite'
import {
  validateMemberDraft,
  type MemberCreator,
  type MembershipOption,
} from '../domain/member-creation'
import { encodeLegacyMember } from './member-creation-legacy'

export const MEMBER_LAB_PROJECT = 'demo-cerms-members'
export const MEMBER_LAB_CLUB = 'fixture-club'
export function assertMemberLabTarget(project: string, host: string, port: number) {
  if (
    project !== MEMBER_LAB_PROJECT ||
    host !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error('Member creation requires the isolated local demo emulator.')
}
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export function createEmulatorMemberCreator(
  port: number,
): MemberCreator & { close(): Promise<void> } {
  assertMemberLabTarget(MEMBER_LAB_PROJECT, '127.0.0.1', port)
  // Host is fixed BEFORE any operation. No environment Firebase config, auth, or fallback.
  const app = initializeApp(
    { projectId: MEMBER_LAB_PROJECT, apiKey: 'local-fixtures-only' },
    `member-lab-${crypto.randomUUID()}`,
  )
  const db = initializeFirestore(app, { host: `127.0.0.1:${port}`, ssl: false })
  const members = collection(db, 'members')
  async function options(): Promise<MembershipOption[]> {
    const products = await getDocs(
      query(
        collection(db, 'products'),
        where('access', '==', MEMBER_LAB_CLUB),
        where('membership', '==', true),
      ),
    )
    return products.docs
      .map((product) => {
        const data = product.data()
        return {
          id: product.id,
          name: String(data.name ?? ''),
          durationSeconds: Number(data.membershipLength),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  return {
    options,
    async create(input, requestId) {
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error('Invalid creation request.')
      const now = new Date()
      const draft = validateMemberDraft(input, now)
      const fingerprint = await hash(JSON.stringify(draft))
      const identity = await hash(
        JSON.stringify([MEMBER_LAB_CLUB, draft.birthDate, draft.governmentId]),
      )
      const product = (await options()).find((option) => option.id === draft.membershipProductId)
      if (!product) throw new Error('Choose an available membership type.')
      const reference = doc(members, requestId)
      const request = doc(db, '_labMemberRequests', requestId)
      const identityClaim = doc(db, '_labMemberIdentities', identity)
      for (let attempt = 0; attempt < 10; attempt++) {
        const number = draft.membershipNumber
          ? Number(draft.membershipNumber)
          : 100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000)
        const numberClaim = doc(db, '_labMemberNumbers', `${MEMBER_LAB_CLUB}-${number}`)
        // Include existing legacy records, which do not have reservation documents.
        const [duplicates, numbers] = await Promise.all([
          getDocs(
            query(
              members,
              where('access', '==', MEMBER_LAB_CLUB),
              where('dob', '==', draft.birthDate),
              where('idnum', '==', draft.governmentId),
            ),
          ),
          getDocs(
            query(
              members,
              where('access', '==', MEMBER_LAB_CLUB),
              where('id_number', 'in', [number, String(number)]),
            ),
          ),
        ])
        const outcome = await runTransaction(db, async (transaction) => {
          const [prior, member, identityLock, numberLock] = await Promise.all([
            transaction.get(request),
            transaction.get(reference),
            transaction.get(identityClaim),
            transaction.get(numberClaim),
          ])
          if (prior.exists()) {
            if (prior.data().fingerprint !== fingerprint)
              throw new Error('This request already saved different details. Start a new member.')
            return prior.data().result as { id: string; number: number; name: string }
          }
          if (member.exists()) throw new Error('This member document already exists.')
          if (!duplicates.empty || identityLock.exists())
            throw new Error(
              'A member with this date of birth and ID number already exists. No existing member was changed.',
            )
          if (!numbers.empty || numberLock.exists()) return null
          const legacy = encodeLegacyMember(draft, product, {
            club: MEMBER_LAB_CLUB,
            staffName: 'Local test staff',
            now,
            number,
          })
          const result = { id: reference.id, number, name: legacy.name }
          transaction.set(reference, {
            ...legacy,
            creation_time:
              draft.importExisting && draft.createdDate
                ? Timestamp.fromDate(legacy.creation_time)
                : serverTimestamp(),
          })
          transaction.set(identityClaim, { memberId: reference.id })
          transaction.set(numberClaim, { memberId: reference.id })
          transaction.set(request, { fingerprint, result, schemaVersion: 1, productId: product.id })
          return result
        })
        if (outcome) return outcome
        if (draft.membershipNumber) throw new Error('This membership ID is already in use.')
      }
      throw new Error('Unable to allocate a membership ID. Please retry.')
    },
    async close() {
      await terminate(db)
      await deleteApp(app)
    },
  }
}
