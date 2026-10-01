import { ownerUid, validStaffPermissions, type StaffPermissions } from '../domain/staff-permissions'
export const staffAccountEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/createStaffAccount'
const base = 'projects/cerms-7af24/databases/cerms/documents'
export const safeStaffId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
export function staffPermissionCommit(
  club: string,
  uid: string,
  permissions: StaffPermissions,
  updateTime?: string,
) {
  return {
    writes: [
      {
        update: {
          name: `${base}/system/${club}/staffPermissions/${uid}`,
          fields: {
            permissions: {
              mapValue: {
                fields: Object.fromEntries(
                  Object.entries(permissions).map(([k, v]) => [k, { booleanValue: v }]),
                ),
              },
            },
            updatedBy: { stringValue: ownerUid },
          },
        },
        currentDocument: updateTime ? { updateTime } : { exists: false },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  }
}
export function isStaffPermissionCommit(body?: string) {
  try {
    const value = JSON.parse(body ?? '{}'),
      w = value.writes?.[0]
    const match = w?.update?.name?.match(
      /^projects\/cerms-7af24\/databases\/cerms\/documents\/system\/([a-zA-Z0-9_-]{1,128})\/staffPermissions\/([a-zA-Z0-9_-]{1,128})$/,
    )
    if (!match || match[2] === ownerUid) return false
    const fields = w.update.fields.permissions.mapValue.fields
    const permissions = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, (v as { booleanValue: boolean }).booleanValue]),
    )
    if (!validStaffPermissions(permissions)) return false
    const time = w.currentDocument?.updateTime
    if (
      time !== undefined &&
      (typeof time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(time))
    )
      return false
    const canonical = (v: unknown): string =>
      JSON.stringify(v, (_k, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      )
    return (
      canonical(value) === canonical(staffPermissionCommit(match[1], match[2], permissions, time))
    )
  } catch {
    return false
  }
}
export function isCreateStaffRequest(body?: string) {
  try {
    const p = JSON.parse(body ?? '{}')
    if (Object.keys(p).join() !== 'data') return false
    const d = p.data
    return (
      d &&
      Object.keys(d).sort().join() ===
        ['business', 'displayName', 'email', 'password', 'permissions', 'requestId']
          .sort()
          .join() &&
      safeStaffId(d.business) &&
      typeof d.requestId === 'string' &&
      /^[a-f0-9-]{36}$/.test(d.requestId) &&
      typeof d.displayName === 'string' &&
      d.displayName.trim().length > 0 &&
      d.displayName.length <= 200 &&
      typeof d.email === 'string' &&
      d.email.length <= 320 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) &&
      typeof d.password === 'string' &&
      d.password.length >= 12 &&
      d.password.length <= 128 &&
      validStaffPermissions(d.permissions)
    )
  } catch {
    return false
  }
}
