import { hasStaffPermission, type StaffPermissions } from '../domain/staff-permissions'
import { safeStaffId } from './staff-policy'
import { memberEditFields } from '../domain/member-edit'

// Permission flags are always enforced against saved access by Firebase rules.
export const canManageMembers = (uid: string, club: string, permissions?: StaffPermissions) =>
  (hasStaffPermission(uid, 'editMembers', permissions) ||
    hasStaffPermission(uid, 'deleteMembers', permissions)) &&
  /^[a-zA-Z0-9_-]{1,128}$/.test(club)
const base = 'projects/cerms-7af24/databases/cerms/documents'
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/
const timePattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/
export interface IdentityChange {
  oldKey: string
  oldTime: string
  newKey?: string
}
export const encodeMemberFields = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? { stringValue: value }
        : typeof value === 'boolean'
          ? { booleanValue: value }
          : { integerValue: String(value) },
    ]),
  )
export function memberEditCommit(
  id: string,
  updateTime: string,
  data: Record<string, unknown>,
  identity?: IdentityChange,
) {
  return {
    writes: [
      {
        update: { name: `${base}/members/${id}`, fields: encodeMemberFields(data) },
        updateMask: { fieldPaths: Object.keys(data) },
        currentDocument: { updateTime },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
      ...(identity
        ? [
            {
              delete: `${base}/system/dev/memberIdentities/${identity.oldKey}`,
              currentDocument: { updateTime: identity.oldTime },
            },
            {
              update: {
                name: `${base}/system/dev/memberIdentities/${identity.newKey}`,
                fields: encodeMemberFields({ access: 'dev', memberId: id }),
              },
              currentDocument: { exists: false },
            },
          ]
        : []),
    ],
  }
}
export function memberDeleteCommit(id: string, updateTime: string, identity?: IdentityChange) {
  return {
    writes: [
      { delete: `${base}/members/${id}`, currentDocument: { updateTime } },
      ...(identity
        ? [
            {
              delete: `${base}/system/dev/memberIdentities/${identity.oldKey}`,
              currentDocument: { updateTime: identity.oldTime },
            },
          ]
        : []),
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
export function isMemberManagementCommit(body?: string): boolean {
  try {
    const p = JSON.parse(body ?? '{}'),
      first = p.writes?.[0],
      name = first?.delete ?? first?.update?.name
    if (typeof name !== 'string' || !name.startsWith(base + '/members/')) return false
    const id = name.slice((base + '/members/').length),
      time = first.currentDocument?.updateTime
    if (!idPattern.test(id) || typeof time !== 'string' || !timePattern.test(time)) return false
    let identity: IdentityChange | undefined
    if (p.writes.length > 1) {
      const old = p.writes[1],
        prefix = `${base}/system/dev/memberIdentities/`
      if (typeof old.delete !== 'string' || !old.delete.startsWith(prefix)) return false
      identity = {
        oldKey: old.delete.slice(prefix.length),
        oldTime: old.currentDocument?.updateTime,
      }
      if (
        !/^[a-f0-9]{64}$/.test(identity.oldKey) ||
        typeof identity.oldTime !== 'string' ||
        !timePattern.test(identity.oldTime)
      )
        return false
    }
    if (first.delete) return canonical(p) === canonical(memberDeleteCommit(id, time, identity))
    const data: Record<string, any> = {}
    for (const [key, value] of Object.entries(first.update.fields) as [string, any][]) {
      if (!value || Object.keys(value).length !== 1) return false
      if (typeof value.stringValue === 'string') data[key] = value.stringValue
      else if (typeof value.booleanValue === 'boolean') data[key] = value.booleanValue
      else if (typeof value.integerValue === 'string' && /^\d+$/.test(value.integerValue))
        data[key] = Number(value.integerValue)
      else return false
    }
    if (!safeStaffId(data.updatedBy)) return false
    const expected: Record<string, unknown> = memberEditFields(
      {
        firstName: data.fname,
        middleName: data.mname,
        lastName: data.lname,
        suffix: data.suffix,
        birthDate: data.dob,
        governmentId: data.idnum,
        governmentIdType: data.idstate,
        email: data.email,
        phone: data.phone,
        expiresAt: data.id_expiration,
        dna: data.dna,
        tagged: data.tag,
        productId: data.productId ?? '',
      },
      data.membership_type,
      data.updatedBy,
    )
    if (identity) {
      if (
        typeof data.identityKey !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.identityKey) ||
        data.identityKey === identity.oldKey
      )
        return false
      identity.newKey = data.identityKey
      expected.identityKey = data.identityKey
    }
    return (
      canonical(data) === canonical(expected) &&
      canonical(p) === canonical(memberEditCommit(id, time, data, identity))
    )
  } catch {
    return false
  }
}
