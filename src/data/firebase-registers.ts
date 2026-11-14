import { requireStaffPermission } from './firebase-staff-permissions'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import type { MembershipReader } from './membership-contracts'
import {
  cashTotal,
  registerFromData,
  type CashCounts,
  type RegisterRecord,
} from '../domain/registers'
import {
  openRegisterCommit,
  closeRegisterCommit,
  isRegisterCommit,
} from '../shared/register-policy'

export function registerError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'permission-denied')
    return 'Registers are not permitted by the current Firebase rules for this business.'
  if (code === 'failed-precondition')
    return 'The register list index is not ready. Please try again after setup is complete.'
  return error instanceof Error ? error.message : 'Unable to load registers. Please retry.'
}
export function createRegisters(reader: Pick<MembershipReader, 'uid' | 'club'>) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(reader.club) || !/^[a-zA-Z0-9_-]{1,128}$/.test(reader.uid))
    throw new Error('This account cannot use registers for the selected business.')
  const { auth, db } = getFirebaseServices()
  const path = ['system', reader.club, 'registers'] as const
  const claimRef = doc(db, 'system', reader.club, 'registerOwners', reader.uid)
  const cursors = new Map<string, QueryDocumentSnapshot>()
  async function session() {
    if (auth.currentUser?.uid !== reader.uid)
      throw new Error('Sign in again before using registers.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    const data = profile.data()
    if (
      !profile.exists() ||
      data?.uid !== reader.uid ||
      data.access !== reader.club ||
      auth.currentUser?.uid !== reader.uid
    )
      throw new Error('Your business access changed. Reopen Registers in your current business.')
    if (typeof data.displayName !== 'string' || data.displayName.length > 256)
      throw new Error('Your staff profile needs a valid display name before using registers.')
    return data.displayName
  }
  async function read(id: string) {
    const snapshot = await getDoc(doc(db, ...path, id))
    return snapshot.exists() ? registerFromData(snapshot.id, snapshot.data()) : null
  }
  async function send(
    commit: ReturnType<typeof openRegisterCommit> | ReturnType<typeof closeRegisterCommit>,
  ) {
    const body = JSON.stringify(commit)
    if (!isRegisterCommit(body)) throw new Error('Check the denomination counts before saving.')
    await session()
    try {
      const token = await auth.currentUser!.getIdToken()
      const response = await fetch(
        'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
        },
      )
      return response.status
    } catch {
      return 0
    }
  }
  function failure(status: number): never {
    throw new Error(
      status === 403
        ? 'Register changes are not permitted by the current Firebase rules. Your count has been kept.'
        : 'Save could not be confirmed. Your count has been kept; retry with the same values or refresh Registers.',
    )
  }
  return {
    async get(id: string): Promise<RegisterRecord | null> {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid register reference.')
      await session()
      const saved = await read(id)
      await session()
      return saved
    },
    async list(status: 'open' | 'closed', reset = true) {
      await session()
      const cursor = reset ? undefined : cursors.get(status)
      const result = await getDocs(
        query(
          collection(db, ...path),
          where('status', '==', status),
          orderBy('openedAt', 'desc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(50),
        ),
      )
      await session()
      const last = result.docs.at(-1)
      if (last) cursors.set(status, last)
      else cursors.delete(status)
      return {
        rows: result.docs.map((item) => registerFromData(item.id, item.data())),
        more: result.size === 50,
      }
    },
    async own(): Promise<RegisterRecord | null> {
      await session()
      const claim = await getDoc(claimRef)
      let register: RegisterRecord | null = null
      if (claim.exists()) {
        const id = claim.data().registerId
        if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
          throw new Error('Your register reference has an unsupported format.')
        register = await read(id)
        if (!register || register.ownerUid !== reader.uid)
          throw new Error('Your register reference could not be verified.')
      }
      await session()
      return register?.status === 'open' ? register : null
    },
    async open(id: string, counts: CashCounts): Promise<void> {
      await requireStaffPermission(reader.uid, reader.club, 'openRegisters')
      cashTotal(counts)
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid register request.')
      const name = await session()
      const prior = await read(id)
      const matches = (saved: RegisterRecord | null) =>
        saved?.ownerUid === reader.uid &&
        saved.status === 'open' &&
        Object.keys(counts).every(
          (key) => saved.openingCounts[key as keyof CashCounts] === counts[key as keyof CashCounts],
        )
      if (prior) {
        if (matches(prior)) return
        throw new Error(
          'This request already saved different details or was closed. Refresh Registers.',
        )
      }
      const claim = await getDoc(claimRef)
      if (claim.exists()) {
        const previousId = claim.data().registerId
        if (typeof previousId !== 'string' || !/^[a-f0-9-]{36}$/.test(previousId))
          throw new Error('Your register reference could not be verified.')
        const previous = await read(previousId)
        if (!previous || previous.ownerUid !== reader.uid || previous.status !== 'closed')
          throw new Error('You already have an open register. Close it before opening another.')
      }
      const status = await send(
        openRegisterCommit(reader.club, id, reader.uid, name, counts, claim.exists()),
      )
      if (status >= 200 && status < 300) return
      if (matches(await read(id))) return
      failure(status)
    },
    async close(id: string, counts: CashCounts, note: string): Promise<void> {
      cashTotal(counts)
      if (!/^[a-f0-9-]{36}$/.test(id) || note.length > 2000)
        throw new Error('Check the register and closing note.')
      const name = await session()
      const matches = (saved: RegisterRecord | null) =>
        !!saved &&
        (saved.closedByUid === reader.uid ||
          (!saved.closedByUid && saved.ownerUid === reader.uid)) &&
        saved.status === 'closed' &&
        saved.closeNote === note &&
        Object.keys(counts).every(
          (key) =>
            saved.closingCounts?.[key as keyof CashCounts] === counts[key as keyof CashCounts],
        )
      const before = await read(id)
      if (!before) throw new Error('This register could not be found.')
      await requireStaffPermission(
        reader.uid,
        reader.club,
        before.ownerUid === reader.uid ? 'closeRegisters' : 'closeOtherRegisters',
      )
      if (before.status === 'closed') {
        if (matches(before)) return
        throw new Error(
          'This register was already closed with different values. Refresh to view its saved count.',
        )
      }
      const status = await send(
        closeRegisterCommit(reader.club, id, counts, note, { uid: reader.uid, name }),
      )
      if (status >= 200 && status < 300) return
      if (matches(await read(id))) return
      failure(status)
    },
  }
}
export type RegisterClient = ReturnType<typeof createRegisters>
