import { devCreatorUid } from './dev-member-policy'
const base = 'projects/cerms-7af24/databases/cerms/documents'
export function memberViewCommit(memberId: string, eventId: string, actorName: string) {
  return {
    writes: [
      {
        update: {
          name: `${base}/system/dev/memberLogs/${memberId}/events/${eventId}`,
          fields: {
            type: { stringValue: 'member.viewed' },
            actorUid: { stringValue: devCreatorUid },
            actorName: { stringValue: actorName },
            schemaVersion: { integerValue: '1' },
          },
        },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'occurredAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  }
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(y).every((k) => Object.hasOwn(x, k) && same(x[k], y[k]))
  )
}
export function isMemberViewCommit(body?: string): boolean {
  try {
    const payload = JSON.parse(body ?? '{}')
    const write = payload.writes?.[0]
    const path = write?.update?.name
    const prefix = `${base}/system/dev/memberLogs/`
    if (typeof path !== 'string' || !path.startsWith(prefix)) return false
    const [memberId, collection, eventId, extra] = path.slice(prefix.length).split('/')
    const name = write.update.fields?.actorName?.stringValue
    if (
      !memberId ||
      memberId === '.' ||
      memberId === '..' ||
      memberId.length > 1500 ||
      collection !== 'events' ||
      !/^[a-f0-9-]{36}$/.test(eventId ?? '') ||
      extra !== undefined ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 256
    )
      return false
    return same(payload, memberViewCommit(memberId, eventId!, name))
  } catch {
    return false
  }
}
