import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'
import { getFirebaseServices } from './firebase-membership'
import { accountEndpoint, isAccountRequest } from '../shared/account-policy'
export interface AccountDetails {
  displayName: string
  profileEmail: string
  email: string
  emailVerified: boolean
  version: string
}
export function createAccountSettings(uid: string) {
  const { auth } = getFirebaseServices()
  const user = () => {
    const u = auth.currentUser
    if (!u || u.uid !== uid) throw Error('Sign in again to manage your account.')
    return u
  }
  async function call<T>(data: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ data })
    if (!isAccountRequest(body)) throw Error('Check your account details.')
    const response = await fetch(accountEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await user().getIdToken(true)}`,
      },
      body,
      signal: AbortSignal.timeout(20000),
    })
    const result = await response.json()
    if (!response.ok || result.error)
      throw Error(
        result.error?.message ||
          'Account change was not confirmed. Reload to check your saved settings.',
      )
    user()
    return result.result as T
  }
  async function reauthenticate(password: string) {
    const u = user()
    if (!u.email) throw Error('This account has no email login.')
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password))
    if (user() !== u) throw Error('Your session changed. Sign in again.')
    return u
  }
  return {
    async get() {
      await user().reload()
      return call<AccountDetails>({ action: 'get' })
    },
    saveName: (displayName: string, expectedVersion: string) =>
      call({ action: 'saveName', displayName: displayName.trim(), expectedVersion }),
    async refreshVerification() {
      await user().reload()
      const current = await call<AccountDetails>({ action: 'get' })
      if (current.emailVerified && current.profileEmail !== current.email) {
        await call({ action: 'syncEmail', expectedVersion: current.version })
        return call<AccountDetails>({ action: 'get' })
      }
      return current
    },
    verify: () => sendEmailVerification(user()),
    async changeEmail(email: string, password: string) {
      const u = await reauthenticate(password)
      await verifyBeforeUpdateEmail(u, email.trim().toLowerCase())
    },
    async changePassword(password: string, next: string) {
      if (next.length < 12 || next.length > 128) throw Error('Use a password of 12–128 characters.')
      const u = await reauthenticate(password)
      await updatePassword(u, next)
    },
  }
}
export function accountError(failure: unknown): string {
  const code = (failure as { code?: string })?.code
  if (
    ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(
      code ?? '',
    )
  )
    return 'Current password is incorrect.'
  if (code === 'auth/email-already-in-use') return 'That email already has a login.'
  if (code === 'auth/invalid-email') return 'Enter a valid email address.'
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.'
  if (
    ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/requires-recent-login'].includes(
      code ?? '',
    )
  )
    return 'Sign in again before changing your login.'
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements')
    return 'Choose a stronger password (12–128 characters).'
  if (code === 'auth/network-request-failed')
    return 'Unable to connect. Check your connection and try again.'
  if (code?.startsWith('auth/'))
    return 'Account change could not be confirmed. Reload your account and try again.'
  return failure instanceof Error ? failure.message : 'Unable to update your account.'
}
