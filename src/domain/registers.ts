export const denominations = [
  { key: 'bill100', label: '$100 bills', cents: 10000 },
  { key: 'bill50', label: '$50 bills', cents: 5000 },
  { key: 'bill20', label: '$20 bills', cents: 2000 },
  { key: 'bill10', label: '$10 bills', cents: 1000 },
  { key: 'bill5', label: '$5 bills', cents: 500 },
  { key: 'bill2', label: '$2 bills', cents: 200 },
  { key: 'bill1', label: '$1 bills', cents: 100 },
  { key: 'coin100', label: '$1 coins', cents: 100 },
  { key: 'coin50', label: '50¢ coins', cents: 50 },
  { key: 'coin25', label: '25¢ coins', cents: 25 },
  { key: 'coin10', label: '10¢ coins', cents: 10 },
  { key: 'coin5', label: '5¢ coins', cents: 5 },
  { key: 'coin1', label: '1¢ coins', cents: 1 },
] as const
export type CashCounts = Record<(typeof denominations)[number]['key'], number>
export const emptyCashCounts = (): CashCounts =>
  Object.fromEntries(denominations.map(({ key }) => [key, 0])) as CashCounts
export function validCashCounts(value: unknown): value is CashCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const counts = value as CashCounts
  return (
    Object.keys(counts).length === denominations.length &&
    denominations.every(
      ({ key }) =>
        Object.hasOwn(counts, key) &&
        Number.isSafeInteger(counts[key]) &&
        counts[key] >= 0 &&
        counts[key] <= 10000,
    )
  )
}
export function cashTotal(counts: CashCounts): number {
  if (!validCashCounts(counts))
    throw new Error('Enter a whole-number count from 0 to 10,000 for each denomination.')
  return denominations.reduce((total, { key, cents }) => total + counts[key] * cents, 0)
}
export interface RegisterRecord {
  id: string
  schemaVersion: 1
  status: 'open' | 'closed'
  ownerUid: string
  ownerName: string
  openingCounts: CashCounts
  openingTotalCents: number
  openedAt: number
  closingCounts: CashCounts | null
  closingTotalCents: number | null
  closedAt: number | null
  closedByUid?: string
  closedByName?: string
  closeNote: string
}
export function registerFromData(id: string, data: Record<string, unknown>): RegisterRecord {
  const timestamp = (value: unknown): number | null => {
    if (
      value &&
      typeof value === 'object' &&
      'toMillis' in value &&
      typeof value.toMillis === 'function'
    ) {
      const result: unknown = value.toMillis()
      if (typeof result === 'number' && Number.isFinite(result)) return result
    }
    return null
  }
  const openedAt = timestamp(data.openedAt),
    closedAt = timestamp(data.closedAt)
  if (
    ((data.closedByUid !== undefined || data.closedByName !== undefined) &&
      (data.status !== 'closed' ||
        typeof data.closedByUid !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(data.closedByUid) ||
        typeof data.closedByName !== 'string' ||
        data.closedByName.length > 256)) ||
    data.schemaVersion !== 1 ||
    !['open', 'closed'].includes(String(data.status)) ||
    typeof data.ownerUid !== 'string' ||
    !data.ownerUid ||
    typeof data.ownerName !== 'string' ||
    data.ownerName.length > 256 ||
    typeof data.closeNote !== 'string' ||
    data.closeNote.length > 2000 ||
    !validCashCounts(data.openingCounts) ||
    data.openingTotalCents !== cashTotal(data.openingCounts) ||
    openedAt === null ||
    (data.status === 'open'
      ? data.closingCounts !== null ||
        data.closingTotalCents !== null ||
        data.closedAt !== null ||
        data.closeNote !== ''
      : !validCashCounts(data.closingCounts) ||
        data.closingTotalCents !== cashTotal(data.closingCounts) ||
        closedAt === null ||
        closedAt < openedAt)
  )
    throw new Error('A register has an unsupported record format. No records were changed.')
  return { ...data, id, openedAt, closedAt } as RegisterRecord
}
