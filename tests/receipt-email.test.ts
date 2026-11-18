import { describe, it, expect } from 'vitest'
import { validReceiptEmail } from '../src/domain/receipt-email'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { posEndpoints } from '../src/shared/pos-policy'
describe('receipt email confirmation boundary', () => {
  it('accepts one customer mailbox and rejects lists, headers and oversized addresses', () => {
    expect(validReceiptEmail('customer+receipt@example.com')).toBe(true)
    for (const value of [
      '',
      'wrong',
      'a@example.com,b@example.com',
      'Name <a@example.com>',
      'a@example.com\r\nBcc:b@example.com',
      'a@example.com;b@example.com',
      ' ' + 'a@example.com',
      'a'.repeat(250) + '@example.com',
    ])
      expect(validReceiptEmail(value)).toBe(false)
  })
  it('permits only a narrow saved-order lookup or explicit email request', () => {
    const url = posEndpoints.sendSaleReceipt,
      base = {
        action: 'recipient',
        business: 'dev',
        saleId: '10000000-0000-4000-8000-000000000001',
      }
    const allowed = (data: unknown) => allowFirebaseRequest(url, 'POST', JSON.stringify({ data }))
    expect(allowed(base)).toBe(true)
    expect(
      allowed({
        ...base,
        action: 'send',
        email: 'customer@example.com',
        requestId: base.saleId,
        timeZone: 'America/New_York',
      }),
    ).toBe(true)
    expect(allowed({ ...base, receipt: 'forged receipt' })).toBe(false)
    expect(allowed({ ...base, action: 'send' })).toBe(false)
    expect(allowFirebaseRequest(url + '?extra=1', 'POST', JSON.stringify({ data: base }))).toBe(
      false,
    )
    expect(allowFirebaseRequest(url, 'GET')).toBe(false)
  })
})
