export const accountEndpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/accountSettings'
const exact = (d: Record<string, unknown>, keys: string[]) =>
  Object.keys(d).sort().join() === keys.sort().join()
export function validAccountData(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const d = value as Record<string, unknown>
  if (d.action === 'get') return exact(d, ['action'])
  if (
    !['saveName', 'syncEmail'].includes(d.action as string) ||
    typeof d.expectedVersion !== 'string' ||
    !/^\d{1,12}\.\d{9}$/.test(d.expectedVersion)
  )
    return false
  if (d.action === 'syncEmail') return exact(d, ['action', 'expectedVersion'])
  return (
    exact(d, ['action', 'expectedVersion', 'displayName']) &&
    typeof d.displayName === 'string' &&
    d.displayName.trim().length > 0 &&
    d.displayName.length <= 200 &&
    !/[\x00-\x1f\x7f]/.test(d.displayName)
  )
}
export function isAccountRequest(body?: string): boolean {
  try {
    if (!body || body.length > 2048) return false
    const d = JSON.parse(body)
    return Object.keys(d).join() === 'data' && validAccountData(d.data)
  } catch {
    return false
  }
}
/** Narrow exceptions for deliberate current-user account settings; no sign-up, deletion or email bypass. */
export function isSelfAccountAuthRequest(path: string, body?: string): boolean {
  try {
    if (!body || body.length > 16384) return false
    const d = JSON.parse(body)
    if (!d || Array.isArray(d) || typeof d.idToken !== 'string' || !d.idToken) return false
    if (path === '/v1/accounts:update')
      return (
        exact(d, ['idToken', 'password', 'returnSecureToken']) &&
        typeof d.password === 'string' &&
        d.password.length >= 12 &&
        d.password.length <= 128 &&
        d.returnSecureToken === true
      )
    if (path !== '/v1/accounts:sendOobCode') return false
    if (d.requestType === 'VERIFY_EMAIL') return exact(d, ['requestType', 'idToken'])
    return (
      d.requestType === 'VERIFY_AND_CHANGE_EMAIL' &&
      exact(d, ['requestType', 'idToken', 'newEmail']) &&
      typeof d.newEmail === 'string' &&
      d.newEmail.length <= 254 &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.newEmail)
    )
  } catch {
    return false
  }
}
