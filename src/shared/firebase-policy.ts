/** Fixed to the existing CERMS project. This is configuration, not a credential. */
export const firebaseProjectId = 'cerms-7af24'
export const firebaseDatabaseId = 'cerms'
export const systemSwitcherUid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
export const canSwitchSystems = (uid: string | undefined): boolean => uid === systemSwitcherUid
export function isSystemId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value) &&
    new TextEncoder().encode(value).length <= 1500
  )
}
export const firebaseBucket = 'cerms-7af24.appspot.com'

/** Electron enforces this on renderer requests, independently of the UI and repository. */
export function allowFirebaseRequest(rawUrl: string, method: string, body?: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (method === 'OPTIONS')
      return [
        'firestore.googleapis.com',
        'identitytoolkit.googleapis.com',
        'securetoken.googleapis.com',
      ].includes(url.hostname)
    if (url.hostname === 'firestore.googleapis.com') {
      // Listen is a read-only streaming RPC. The separate Write stream stays blocked.
      if (url.pathname === '/google.firestore.v1.Firestore/Listen/channel') {
        return (
          ['GET', 'POST'].includes(method) &&
          url.searchParams.get('database') ===
            `projects/${firebaseProjectId}/databases/${firebaseDatabaseId}`
        )
      }
      const base = `/v1/projects/${firebaseProjectId}/databases/${firebaseDatabaseId}/documents`
      if (method === 'POST' && url.pathname === base + ':commit') return isAccessSwitchCommit(body)
      return (
        method === 'POST' && [':batchGet', ':runQuery'].some((rpc) => url.pathname === base + rpc)
      )
    }
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (method === 'POST' && url.pathname === '/v1/accounts:sendOobCode') {
        const payload = JSON.parse(body ?? '{}')
        return (
          payload.requestType === 'PASSWORD_RESET' &&
          typeof payload.email === 'string' &&
          payload.email.trim().length > 0
        )
      }
      return (
        method === 'POST' &&
        ['/v1/accounts:signInWithPassword', '/v1/accounts:lookup'].includes(url.pathname)
      )
    }
    return (
      url.hostname === 'securetoken.googleapis.com' &&
      method === 'POST' &&
      url.pathname === '/v1/token'
    )
  } catch {
    return false
  }
}

export function isMemberFileUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    return (
      (url.hostname === 'firebasestorage.googleapis.com' &&
        url.pathname.startsWith(`/v0/b/${firebaseBucket}/o/`)) ||
      (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith(`/${firebaseBucket}/`))
    )
  } catch {
    return false
  }
}

/** The sole allowed Firestore mutation: one existing user's access field, nothing else. */
export function isAccessSwitchCommit(body?: string): boolean {
  try {
    const payload = JSON.parse(body ?? '{}')
    if (
      !exactKeys(payload, ['writes']) ||
      !Array.isArray(payload.writes) ||
      payload.writes.length !== 1
    )
      return false
    const write = payload.writes[0]
    return (
      exactKeys(write, ['update', 'updateMask', 'currentDocument']) &&
      exactKeys(write.update, ['name', 'fields']) &&
      write.update.name ===
        `projects/${firebaseProjectId}/databases/${firebaseDatabaseId}/documents/users/${systemSwitcherUid}` &&
      exactKeys(write.update.fields, ['access']) &&
      exactKeys(write.update.fields.access, ['stringValue']) &&
      isSystemId(write.update.fields.access.stringValue) &&
      exactKeys(write.updateMask, ['fieldPaths']) &&
      Array.isArray(write.updateMask.fieldPaths) &&
      write.updateMask.fieldPaths.length === 1 &&
      write.updateMask.fieldPaths[0] === 'access' &&
      exactKeys(write.currentDocument, ['exists']) &&
      write.currentDocument.exists === true
    )
  } catch {
    return false
  }
}
function exactKeys(value: unknown, keys: string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
