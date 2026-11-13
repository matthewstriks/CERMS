import { expect, it } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { themeEndpoint } from '../src/shared/theme-policy'
it('allows only explicit bounded theme preference requests and keeps direct profile writes blocked', () => {
  const allowed = (data: unknown) =>
    allowFirebaseRequest(themeEndpoint, 'POST', JSON.stringify({ data }))
  expect(allowed({ theme: 'dark' })).toBe(true)
  expect(allowed({ theme: 'light' })).toBe(true)
  for (const d of [
    null,
    [],
    { theme: 'system' },
    { theme: 'dark', uid: 'other' },
    { theme: 'dark', access: 'dev' },
  ])
    expect(allowed(d)).toBe(false)
  expect(allowFirebaseRequest(themeEndpoint, 'GET')).toBe(false)
  expect(
    allowFirebaseRequest(
      themeEndpoint + '/extra',
      'POST',
      JSON.stringify({ data: { theme: 'dark' } }),
    ),
  ).toBe(false)
  const name = 'projects/cerms-7af24/databases/cerms/documents/users/staff'
  expect(
    allowFirebaseRequest(
      'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
      'POST',
      JSON.stringify({
        writes: [
          {
            update: { name, fields: { themePreference: { stringValue: 'dark' } } },
            updateMask: { fieldPaths: ['themePreference'] },
            currentDocument: { exists: true },
          },
        ],
      }),
    ),
  ).toBe(false)
})
