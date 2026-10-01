import { cashTotal, validCashCounts, type CashCounts } from '../domain/registers'

const base = 'projects/cerms-7af24/databases/cerms/documents'
const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const validRegisterId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)
const field = (value: unknown): unknown =>
  value === null
    ? { nullValue: null }
    : typeof value === 'string'
      ? { stringValue: value }
      : typeof value === 'number'
        ? { integerValue: String(value) }
        : { mapValue: { fields: encode(value as Record<string, unknown>) } }
const encode = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).map(([key, value]) => [key, field(value)]))

export function openRegisterCommit(
  club: string,
  id: string,
  uid: string,
  name: string,
  counts: CashCounts,
  priorClaim: boolean,
) {
  return {
    writes: [
      {
        update: {
          name: `${base}/system/${club}/registers/${id}`,
          fields: encode({
            schemaVersion: 1,
            status: 'open',
            ownerUid: uid,
            ownerName: name,
            openingCounts: counts,
            openingTotalCents: cashTotal(counts),
            closingCounts: null,
            closingTotalCents: null,
            closedAt: null,
            closeNote: '',
          }),
        },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'openedAt', setToServerValue: 'REQUEST_TIME' }],
      },
      {
        update: {
          name: `${base}/system/${club}/registerOwners/${uid}`,
          fields: encode({ registerId: id }),
        },
        currentDocument: { exists: priorClaim },
      },
    ],
  }
}
export function closeRegisterCommit(
  club: string,
  id: string,
  counts: CashCounts,
  note: string,
  actor?: { uid: string; name: string },
) {
  return {
    writes: [
      {
        update: {
          name: `${base}/system/${club}/registers/${id}`,
          fields: encode({
            status: 'closed',
            closingCounts: counts,
            closingTotalCents: cashTotal(counts),
            closeNote: note,
            ...(actor ? { closedByUid: actor.uid, closedByName: actor.name } : {}),
          }),
        },
        updateMask: {
          fieldPaths: [
            'status',
            'closingCounts',
            'closingTotalCents',
            'closeNote',
            ...(actor ? ['closedByUid', 'closedByName'] : []),
          ],
        },
        currentDocument: { exists: true },
        updateTransforms: [{ fieldPath: 'closedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  }
}
const canonical = (value: unknown): string =>
  JSON.stringify(value, function (_key, value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value
  })
function decode(fields: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (!value || Object.keys(value).length !== 1) throw new Error('Invalid field')
      if (typeof value.stringValue === 'string') return [key, value.stringValue]
      if (typeof value.integerValue === 'string' && /^\d+$/.test(value.integerValue))
        return [key, Number(value.integerValue)]
      if (value.nullValue === null) return [key, null]
      if (value.mapValue && Object.keys(value.mapValue).join() === 'fields')
        return [key, decode(value.mapValue.fields)]
      throw new Error('Invalid field')
    }),
  )
}
/** Exact register-only commit shapes; the backend enforces saved business access and ownership. */
export function isRegisterCommit(body?: string): boolean {
  try {
    const payload = JSON.parse(body ?? '{}'),
      write = payload.writes?.[0]
    const prefix = `${base}/system/`
    if (typeof write?.update?.name !== 'string' || !write.update.name.startsWith(prefix))
      return false
    const [club, collection, id, extra] = write.update.name.slice(prefix.length).split('/')
    if (!validId(club) || collection !== 'registers' || !validRegisterId(id) || extra !== undefined)
      return false
    const data = decode(write.update.fields)
    if (data.status === 'open') {
      const priorClaim = payload.writes?.[1]?.currentDocument?.exists
      if (
        !validId(data.ownerUid) ||
        typeof data.ownerName !== 'string' ||
        data.ownerName.length > 256 ||
        !validCashCounts(data.openingCounts) ||
        typeof priorClaim !== 'boolean'
      )
        return false
      return (
        canonical(payload) ===
        canonical(
          openRegisterCommit(
            club,
            id,
            data.ownerUid,
            data.ownerName,
            data.openingCounts,
            priorClaim,
          ),
        )
      )
    }
    if (
      data.status !== 'closed' ||
      !validCashCounts(data.closingCounts) ||
      typeof data.closeNote !== 'string' ||
      data.closeNote.length > 2000
    )
      return false
    const hasActor = data.closedByUid !== undefined || data.closedByName !== undefined
    if (
      hasActor &&
      (!validId(data.closedByUid) ||
        typeof data.closedByName !== 'string' ||
        data.closedByName.length > 256)
    )
      return false
    return (
      canonical(payload) ===
      canonical(
        closeRegisterCommit(
          club,
          id,
          data.closingCounts,
          data.closeNote,
          hasActor ? { uid: data.closedByUid, name: data.closedByName } : undefined,
        ),
      )
    )
  } catch {
    return false
  }
}
