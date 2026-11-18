import { expect, it, vi } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { accountEndpoint } from '../src/shared/account-policy'
const mocks = vi.hoisted(() => ({
  reauth: vi.fn(),
  verify: vi.fn(),
  password: vi.fn(),
  changeEmail: vi.fn(),
  user: { uid: 'staff', email: 'old@example.test' },
}))
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  reauthenticateWithCredential: mocks.reauth,
  sendEmailVerification: mocks.verify,
  updatePassword: mocks.password,
  verifyBeforeUpdateEmail: mocks.changeEmail,
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({ auth: { currentUser: mocks.user } }),
}))
import { createAccountSettings } from '../src/data/firebase-account'
it('allows only narrow own-account auth operations and denies email bypass, delete and other profiles', () => {
  const base = 'https://identitytoolkit.googleapis.com/v1/accounts:'
  const allow = (suffix: string, data: unknown) =>
    allowFirebaseRequest(base + suffix, 'POST', JSON.stringify(data))
  expect(
    allow('update', { idToken: 'token', password: 'new-password-123', returnSecureToken: true }),
  ).toBe(true)
  expect(allow('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: 'token' })).toBe(true)
  expect(
    allow('sendOobCode', {
      requestType: 'VERIFY_AND_CHANGE_EMAIL',
      idToken: 'token',
      newEmail: 'new@example.test',
    }),
  ).toBe(true)
  expect(
    allow('update', { idToken: 'token', email: 'new@example.test', returnSecureToken: true }),
  ).toBe(false)
  expect(
    allow('update', {
      idToken: 'token',
      password: 'new-password-123',
      returnSecureToken: true,
      localId: 'other',
    }),
  ).toBe(false)
  expect(allow('delete', { idToken: 'token' })).toBe(false)
  expect(
    allowFirebaseRequest(
      accountEndpoint,
      'POST',
      JSON.stringify({ data: { action: 'get', uid: 'other' } }),
    ),
  ).toBe(false)
})
it('reauthenticates before email/password changes and stops immediately on wrong password', async () => {
  const c = createAccountSettings('staff')
  mocks.reauth.mockResolvedValue(undefined)
  await c.changeEmail(' NEW@example.test ', 'current')
  expect(mocks.reauth).toHaveBeenCalledWith(mocks.user, {
    email: 'old@example.test',
    password: 'current',
  })
  expect(mocks.changeEmail).toHaveBeenCalledWith(mocks.user, 'new@example.test')
  await c.changePassword('current', 'new-password-123')
  expect(mocks.password).toHaveBeenCalledWith(mocks.user, 'new-password-123')
  mocks.password.mockClear()
  mocks.reauth.mockRejectedValueOnce(Error('wrong password'))
  await expect(c.changePassword('wrong', 'new-password-123')).rejects.toThrow()
  expect(mocks.password).not.toHaveBeenCalled()
  await c.verify()
  expect(mocks.verify).toHaveBeenCalledWith(mocks.user)
})
