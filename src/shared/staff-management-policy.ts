export const staffManagementEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/manageStaffAccounts'
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).sort().join() === keys.sort().join()
export function validStaffManagementData(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const d = value as Record<string, unknown>
  if (!id(d.business)) return false
  if (d.action === 'list')
    return (
      exact(d, ['action', 'business', ...('cursor' in d ? ['cursor'] : [])]) &&
      (!('cursor' in d) || id(d.cursor))
    )
  if (!id(d.uid)) return false
  if (d.action === 'get') return exact(d, ['action', 'business', 'uid'])
  if (
    !['update', 'remove'].includes(d.action as string) ||
    !exact(d, [
      'action',
      'business',
      'uid',
      'requestId',
      'expectedProfileVersion',
      ...(d.action === 'update' ? ['profile'] : []),
    ])
  )
    return false
  if (
    typeof d.requestId !== 'string' ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(d.requestId) ||
    typeof d.expectedProfileVersion !== 'string' ||
    !/^\d{1,12}\.\d{9}$/.test(d.expectedProfileVersion)
  )
    return false
  if (d.action === 'remove') return true
  if (!d.profile || typeof d.profile !== 'object' || Array.isArray(d.profile)) return false
  const p = d.profile as Record<string, unknown>
  return (
    exact(p, ['displayName', 'email']) &&
    typeof p.displayName === 'string' &&
    p.displayName.trim().length > 0 &&
    p.displayName.length <= 200 &&
    typeof p.email === 'string' &&
    p.email.length <= 254 &&
    (p.email === '' || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(p.email)) &&
    !/[\x00-\x1f\x7f]/.test(p.displayName)
  )
}
export function isStaffManagementRequest(body?: string) {
  try {
    if (!body || body.length > 4096) return false
    const p = JSON.parse(body)
    return Object.keys(p).join() === 'data' && validStaffManagementData(p.data)
  } catch {
    return false
  }
}
