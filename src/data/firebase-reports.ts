import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import type { MembershipReader } from './membership-contracts'
import { timestampToMillis, unixSecondsToMillis } from '../domain/legacy'
import { registerFromData } from '../domain/registers'
import { emptyRegisterTotals, type SaleReceipt, type RegisterTotals } from '../domain/pos'
import type {
  ReportData,
  ReportMember,
  ReportRental,
  ReportRegister,
  ReportRange,
  ReportSource,
} from '../domain/reports'
export const reportRecordLimit = 20_000
export function createReports(reader: Pick<MembershipReader, 'uid' | 'club'>) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(reader.club) || !/^[a-zA-Z0-9_-]{1,128}$/.test(reader.uid))
    throw new Error('Invalid reporting business.')
  const { auth, db } = getFirebaseServices()
  async function session(signal: AbortSignal) {
    signal.throwIfAborted()
    if (auth.currentUser?.uid !== reader.uid) throw new Error('Sign in again to view reports.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    signal.throwIfAborted()
    if (
      auth.currentUser?.uid !== reader.uid ||
      profile.data()?.uid !== reader.uid ||
      profile.data()?.access !== reader.club
    )
      throw new Error('Your business access changed. Reopen Reports in your current business.')
  }
  async function all(path: string, constraints: QueryConstraint[], signal: AbortSignal) {
    const rows: QueryDocumentSnapshot[] = []
    let cursor: QueryDocumentSnapshot | undefined
    while (true) {
      await session(signal)
      const page = await getDocs(
        query(
          collection(db, path),
          ...constraints,
          ...(cursor ? [startAfter(cursor)] : []),
          limit(50),
        ),
      )
      signal.throwIfAborted()
      rows.push(...page.docs)
      if (rows.length > reportRecordLimit)
        throw new Error(
          'This report exceeds 20,000 records. Narrow the date range for financial reports; larger membership/activity histories need an expanded reporting service. No partial totals are shown.',
        )
      if (page.size < 50) return rows
      const next = page.docs.at(-1)!
      if (next.id === cursor?.id)
        throw new Error('Report pagination did not advance. Refresh to retry.')
      cursor = next
    }
  }
  async function source<T>(load: () => Promise<T[]>): Promise<ReportSource<T>> {
    try {
      return { rows: await load() }
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : 'This report could not be loaded. Refresh to retry.',
      }
    }
  }
  return {
    async load(range: ReportRange, signal: AbortSignal): Promise<ReportData> {
      await session(signal)
      const path = `system/${reader.club}`
      const scoped = (data: Record<string, unknown>) => {
        if (data.access !== reader.club)
          throw new Error('A record outside the selected business was rejected.')
      }
      const [sales, members, rentals, registers] = await Promise.all([
        source<SaleReceipt>(async () => {
          const rows = await all(
            `${path}/sales`,
            [
              where('createdAt', '>=', new Date(range.previousStart)),
              where('createdAt', '<', new Date(range.end)),
              orderBy('createdAt'),
            ],
            signal,
          )
          return rows.map((s) => {
            const data = s.data(),
              createdAt = timestampToMillis(data.createdAt)
            if (
              data.business !== reader.club ||
              data.schemaVersion !== 1 ||
              data.status !== 'completed' ||
              createdAt === null ||
              !Array.isArray(data.lines) ||
              !Array.isArray(data.payments)
            )
              throw new Error(
                'A saved receipt has an unsupported format. No partial sales totals are shown.',
              )
            return { ...data, id: s.id, createdAt } as SaleReceipt
          })
        }),
        source<ReportMember>(async () =>
          (await all('members', [where('access', '==', reader.club)], signal)).map((s) => {
            const d = s.data()
            scoped(d)
            return {
              id: s.id,
              name: typeof d.name === 'string' ? d.name : 'Unnamed member',
              number: String(d.id_number ?? ''),
              plan: typeof d.membership_type === 'string' ? d.membership_type : 'Unspecified',
              expiresAt: unixSecondsToMillis(d.id_expiration),
              createdAt: timestampToMillis(d.creation_time) ?? unixSecondsToMillis(d.creation_time),
              dna: d.dna === true,
            }
          }),
        ),
        source<ReportRental>(async () =>
          (await all('activity', [where('access', '==', reader.club)], signal)).flatMap((s) => {
            const d = s.data()
            scoped(d)
            const rental = Array.isArray(d.lockerRoomStatus) ? d.lockerRoomStatus : []
            if (rental[0] !== true) return []
            return {
              id: s.id,
              memberId: typeof d.memberID === 'string' ? d.memberID : '',
              name: typeof rental[2] === 'string' ? rental[2] : 'Unspecified rental',
              enteredAt: timestampToMillis(d.timeIn) ?? unixSecondsToMillis(d.timeIn),
              endedAt: timestampToMillis(d.checkedOutAt),
              expiresAt: unixSecondsToMillis(rental[5]),
              active: d.active === true && d.goingInactive !== true,
              inside: d.currIn === true,
              waiting: d.waitlist === true,
            }
          }),
        ),
        source<ReportRegister>(async () => {
          const rows = await all(
            `${path}/registers`,
            [
              where('closedAt', '>=', new Date(range.start)),
              where('closedAt', '<', new Date(range.end)),
              orderBy('closedAt'),
            ],
            signal,
          )
          const results: ReportRegister[] = []
          for (let i = 0; i < rows.length; i += 10) {
            await session(signal)
            results.push(
              ...(await Promise.all(
                rows.slice(i, i + 10).map(async (s) => {
                  const record = registerFromData(s.id, s.data())
                  if (record.status !== 'closed')
                    throw new Error('A register closeout has an unsupported format.')
                  const ledger = await getDoc(doc(db, path, 'registerTotals', s.id))
                  const totals = ledger.exists()
                    ? (ledger.data() as RegisterTotals)
                    : emptyRegisterTotals(record.openingTotalCents)
                  if (!Number.isSafeInteger(totals.expectedCashCents))
                    throw new Error('A register ledger contains invalid cash totals.')
                  return { record, totals, hasLedger: ledger.exists() }
                }),
              )),
            )
          }
          return results
        }),
      ])
      await session(signal)
      return {
        business: reader.club,
        loadedAt: Date.now(),
        range,
        sales,
        members,
        rentals,
        registers,
      }
    },
  }
}
