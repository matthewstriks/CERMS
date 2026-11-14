import { expect, it } from 'vitest'
import { displayReference, matchesDisplayReference } from '../src/domain/display-reference'
import { receiptText, type SaleReceipt } from '../src/domain/pos'

const id = 'f2345678-1234-4567-89ab-cdef01234567'
it('formats stable eight-symbol order/register references without ambiguous alphabet characters', () => {
  const order = displayReference('order', id),
    register = displayReference('register', id)
  expect(order).toBe('O-R2KQ-8K8E') // Printed references must remain stable across releases.
  expect(order).toMatch(/^O-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
  expect(register).toBe(order.replace(/^O-/, 'R-'))
  expect(displayReference('order', id.toUpperCase())).toBe(order)
  expect(displayReference('order', 'e2345678-1234-4567-89ab-cdef01234567')).not.toBe(order)
  expect(order).toHaveLength(11)
})
it('search ignores case, spaces and hyphens while preserving the kind prefix', () => {
  const ref = displayReference('order', id)
  expect(matchesDisplayReference('order', id, ref.toLowerCase().replaceAll('-', ' '))).toBe(true)
  expect(matchesDisplayReference('order', id, ref.replaceAll('-', ''))).toBe(true)
  expect(matchesDisplayReference('order', id, ref.slice(2))).toBe(true)
  expect(matchesDisplayReference('register', id, ref)).toBe(false)
  expect(matchesDisplayReference('order', id, '   ')).toBe(false)
})
it('keeps custom historical references intact and prints compact aliases without changing saved receipt data', () => {
  expect(displayReference('order', 'CUSTOM-123')).toBe('CUSTOM-123')
  const receipt = {
    receiptNumber: id,
    registerId: id,
    receiptName: 'Test club',
    receiptAddress: '',
    receiptFooter: '',
    createdAt: 1,
    cashierName: 'Cashier',
    lines: [],
    payments: [],
    subtotalCents: 0,
    taxCents: 0,
    totalCents: 0,
    taxRateBps: 0,
    note: '',
  } as unknown as SaleReceipt
  const text = receiptText(receipt)
  expect(text).toContain(`Order: ${displayReference('order', id)}`)
  expect(text).toContain(`Register: ${displayReference('register', id)}`)
  expect(text).not.toContain(id)
  expect(receipt.receiptNumber).toBe(id)
  expect(receipt.registerId).toBe(id)
})
