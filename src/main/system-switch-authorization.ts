import { firebaseProjectId, systemSwitcherUid } from '../shared/firebase-policy'

/** Claim filter only. Firestore must still validate the signature and its deployed rules. */
export function allowSystemSwitchAuthorization(authorization: unknown, now = Date.now()): boolean {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
  try {
    const parts = authorization.slice(7).split('.')
    if (parts.length !== 3 || parts.some((part) => !part)) return false
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'))
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
    return (
      header.alg === 'RS256' &&
      claims.sub === systemSwitcherUid &&
      claims.aud === firebaseProjectId &&
      claims.iss === `https://securetoken.google.com/${firebaseProjectId}` &&
      typeof claims.exp === 'number' &&
      claims.exp > now / 1000
    )
  } catch {
    return false
  }
}
