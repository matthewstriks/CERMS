import { expect, it } from 'vitest'
import { inventoryRecipients, inventoryEmailEndpoint } from '../src/shared/inventory-email-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
it('normalizes and deduplicates multiple recipients and rejects malformed/header-injected addresses', () => {
  expect(
    inventoryRecipients(' A@example.com, b@example.com\na@example.com; C@example.com'),
  ).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
  for (const v of [
    'bad email',
    'a@example.com\r\nBcc:bad@example.com',
    'a@x..com',
    '.a@example.com',
  ])
    expect(() => inventoryRecipients([v])).toThrow()
  expect(() =>
    inventoryRecipients(Array.from({ length: 21 }, (_, i) => `a${i}@example.com`)),
  ).toThrow()
})
it('permits only exact bounded inventory settings calls; other Firebase protection remains intact', () => {
  const body = JSON.stringify({
    data: {
      action: 'save',
      business: 'dev',
      enabled: true,
      recipients: ['a@example.com'],
      expectedRevision: 0,
    },
  })
  expect(allowFirebaseRequest(inventoryEmailEndpoint, 'POST', body)).toBe(true)
  expect(allowFirebaseRequest(inventoryEmailEndpoint + '?x=1', 'POST', body)).toBe(false)
  expect(
    allowFirebaseRequest(
      inventoryEmailEndpoint,
      'POST',
      body.replace('"enabled":true', '"enabled":true,"to":"evil@example.com"'),
    ),
  ).toBe(false)
  expect(
    allowFirebaseRequest(
      'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/(default)/documents:commit',
      'POST',
      body,
    ),
  ).toBe(false)
})
