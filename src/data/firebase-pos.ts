import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import type { MembershipReader } from './membership-contracts'
import { posEndpoints } from '../shared/pos-policy'
import {
  emptyRegisterTotals,
  type SaleReceipt,
  type SaleRequest,
  type PosSettings,
  type RegisterTotals,
} from '../domain/pos'
export function createPos(reader: Pick<MembershipReader, 'uid' | 'club'>) {
  const { auth, db } = getFirebaseServices(),
    path = `system/${reader.club}`
  let cursor: QueryDocumentSnapshot | undefined
  async function session() {
    if (auth.currentUser?.uid !== reader.uid) throw new Error('Sign in again.')
    const p = await getDoc(doc(db, 'users', reader.uid))
    if (p.data()?.access !== reader.club)
      throw new Error('Business access changed. Reopen point of sale.')
  }
  async function call<T>(kind: keyof typeof posEndpoints, data: unknown): Promise<T> {
    await session()
    const response = await fetch(posEndpoints[kind], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
      },
      body: JSON.stringify({ data }),
    })
    const p = await response.json()
    if (!response.ok || p.error)
      throw Object.assign(
        new Error(p.error?.message || 'Save not confirmed; retry the same request.'),
        {
          definitive: ['INVALID_ARGUMENT', 'FAILED_PRECONDITION'].includes(p.error?.status),
        },
      )
    return p.result ?? p.data
  }
  const receipt = (
    snapshot: QueryDocumentSnapshot | DocumentSnapshot<DocumentData>,
  ): SaleReceipt => {
    const d = snapshot.data()
    if (!d || d.schemaVersion !== 1 || !d.createdAt?.toMillis)
      throw new Error('Receipt could not be loaded.')
    return { ...d, id: snapshot.id, createdAt: d.createdAt.toMillis() } as SaleReceipt
  }
  return {
    async settings(): Promise<PosSettings> {
      await session()
      const [system, settings] = await Promise.all([
        getDoc(doc(db, 'system', reader.club)),
        getDoc(doc(db, path, 'posSettings', 'default')),
      ])
      const s = system.data() ?? {},
        d = settings.data()
      return {
        taxRateBps:
          d?.taxRateBps ??
          (typeof s.taxRate === 'number' && s.taxRate >= 0 && s.taxRate <= 1
            ? Math.round(s.taxRate * 10000)
            : null),
        receiptName: d?.receiptName || s.businessName || s.name || reader.club,
        receiptAddress: d?.receiptAddress || '',
        receiptFooter: d?.receiptFooter || 'Thank you for your visit.',
      }
    },
    updateRental: (data: {
      visitId: string
      expectedRevision: number
      assignedRoom: string
      notes: string
      inside: boolean
      waiting: boolean
    }) => call('updateRental', { business: reader.club, ...data }),
    saveSettings: (settings: PosSettings) =>
      call('savePosSettings', { business: reader.club, ...settings }),
    async complete(request: SaleRequest) {
      await call<{ saleId: string }>('completeSale', request)
      return this.receipt(request.requestId)
    },
    async receipt(id: string) {
      await session()
      const s = await getDoc(doc(db, path, 'sales', id))
      return s.exists() ? receipt(s) : null
    },
    async history(reset = true) {
      await session()
      if (reset) cursor = undefined
      const r = await getDocs(
        query(
          collection(db, path, 'sales'),
          orderBy('createdAt', 'desc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(50),
        ),
      )
      cursor = r.docs.at(-1)
      return { rows: r.docs.map(receipt), more: r.size === 50 }
    },
    async totals(registerId: string, opening: number): Promise<RegisterTotals> {
      await session()
      const d = await getDoc(doc(db, path, 'registerTotals', registerId))
      return d.exists() ? (d.data() as RegisterTotals) : emptyRegisterTotals(opening)
    },
  }
}
export type PosClient = ReturnType<typeof createPos>
