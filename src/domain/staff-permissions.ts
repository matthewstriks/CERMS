/** Ownership is tied to the existing Auth identity, never an editable email/rank. */
export const ownerUid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
export const permissionDefinitions = [
  {
    key: 'closeOtherRegisters',
    label: 'Close other staff’s registers',
    description: 'Enter ending counts and close another staff member’s register in this business.',
  },
  {
    key: 'deleteProducts',
    label: 'Delete products',
    description: 'Delete any product type without changing saved receipts or member history.',
  },
  {
    key: 'processSales',
    label: 'Use point of sale',
    description: 'Record sales and payouts on your own open register; view receipts.',
  },
  {
    key: 'editMembers',
    label: 'Edit member records',
    description: 'Change identity, contact and membership details.',
  },
  {
    key: 'deleteMembers',
    label: 'Delete member records',
    description: 'Permanently delete members who are not checked in.',
  },
  {
    key: 'manageProducts',
    label: 'Create and edit products and categories',
    description: 'Create and edit all product types and categories.',
  },
  {
    key: 'openRegisters',
    label: 'Open a register',
    description: 'Open one register with starting cash counts.',
  },
  {
    key: 'closeRegisters',
    label: 'Close own register',
    description: 'Record ending counts and close your own register.',
  },
] as const
export type StaffPermission = (typeof permissionDefinitions)[number]['key']
export type StaffPermissions = Record<StaffPermission, boolean>
export const defaultStaffPermissions: StaffPermissions = {
  closeOtherRegisters: false,
  processSales: false,
  editMembers: false,
  deleteMembers: false,
  manageProducts: false,
  deleteProducts: false,
  openRegisters: true,
  closeRegisters: true,
}
export const allStaffPermissions: StaffPermissions = {
  closeOtherRegisters: true,
  processSales: true,
  editMembers: true,
  deleteMembers: true,
  manageProducts: true,
  deleteProducts: true,
  openRegisters: true,
  closeRegisters: true,
}
export const noStaffPermissions: StaffPermissions = {
  closeOtherRegisters: false,
  processSales: false,
  editMembers: false,
  deleteMembers: false,
  manageProducts: false,
  deleteProducts: false,
  openRegisters: false,
  closeRegisters: false,
}
export function validStaffPermissions(value: unknown): value is StaffPermissions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return (
    Object.keys(data).every((k) => permissionDefinitions.some((p) => p.key === k)) &&
    permissionDefinitions.every(
      ({ key }) =>
        (['processSales', 'deleteProducts', 'closeOtherRegisters'].includes(key) &&
          data[key] === undefined) ||
        typeof data[key] === 'boolean',
    )
  )
}
export function effectivePermissions(uid: string, value?: unknown): StaffPermissions {
  if (uid === ownerUid) return { ...allStaffPermissions }
  if (value === undefined) return { ...defaultStaffPermissions }
  return validStaffPermissions(value)
    ? { ...defaultStaffPermissions, ...value }
    : { ...noStaffPermissions }
}
export function hasStaffPermission(
  uid: string,
  key: StaffPermission,
  permissions?: StaffPermissions,
): boolean {
  return uid === ownerUid || effectivePermissions(uid, permissions)[key]
}
