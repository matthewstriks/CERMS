import test from 'node:test'
import assert from 'node:assert/strict'
import { completeSale, savePosSettings } from './pos.mjs'
import { posFixture, owner, business, registerId } from '../scripts/fixtures/pos-server.mjs'
test('split payment saves receipt, change, register ledger and inventory atomically; retry after close never doubles totals', async () => {
  const f = posFixture()
  await completeSale(f.request, f.deps)
  const totals = f.docs.get(`system/${business}/registerTotals/${registerId}`)
  assert.equal(totals.expectedCashCents, 11000)
  assert.equal(totals.netByMethod.card, 1160)
  assert.equal(totals.cashReceivedCents, 2000)
  assert.equal(totals.changeGivenCents, 1000)
  assert.equal(f.docs.get(`system/${business}/products/retail`).inventory, 8)
  assert.equal(f.docs.get(`system/${business}/sales/${f.request.data.requestId}`).totalCents, 2160)
  f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'
  await completeSale(f.request, f.deps)
  assert.equal(f.commits(), 1)
  f.request.data.note = 'changed'
  await assert.rejects(completeSale(f.request, f.deps), /different details/)
})
test('rejects forged totals, stale prices, stock shortages, unavailable register and unauthorized staff with no writes', async () => {
  for (const change of [
    (f) => (f.request.data.payments[1].amountCents = 1000),
    (f) => (f.request.data.lines[0].unitPriceCents = 1),
    (f) => (f.docs.get(`system/${business}/products/retail`).inventory = 1),
    (f) => (f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'),
    (f) => (f.request.auth.uid = 'intruder'),
    (f) => (f.request.data.taxRateBps = 0),
  ]) {
    const f = posFixture()
    change(f)
    await assert.rejects(completeSale(f.request, f.deps))
    assert.equal(f.commits(), 0)
  }
})
test('assigned cashier can sell; payout subtracts cash and cannot overdraw drawer', async () => {
  const f = posFixture(),
    uid = 'cashier'
  f.docs.set('users/' + uid, { uid, access: business })
  f.docs.set(`system/${business}/staffPermissions/${uid}`, { permissions: { processSales: true } })
  f.docs.set(`system/${business}/registerOwners/${uid}`, { registerId })
  f.docs.get(`system/${business}/registers/${registerId}`).ownerUid = uid
  f.request.auth.uid = uid
  const p = f.docs.get(`system/${business}/products/retail`)
  p.payout = true
  p.taxable = false
  f.request.data.lines[0].quantity = 1
  f.request.data.payments = [
    { method: 'cash', amountCents: 1000, receivedCents: 1000, reference: '' },
  ]
  await completeSale(f.request, f.deps)
  assert.equal(
    f.docs.get(`system/${business}/registerTotals/${registerId}`).expectedCashCents,
    9000,
  )
  assert.equal(f.docs.get(`system/${business}/products/retail`).inventory, 10)
  f.request.data.requestId = '30000000-0000-4000-8000-000000000001'
  f.request.data.lines[0].quantity = 10
  f.request.data.payments[0].amountCents = f.request.data.payments[0].receivedCents = 10000
  await assert.rejects(completeSale(f.request, f.deps), /enough recorded cash/)
  assert.equal(f.commits(), 1)
})
test('tax and receipt settings are owner-only and configurable, with no default zero for missing taxable setup', async () => {
  const f = posFixture()
  delete f.docs.get('system/' + business).taxRate
  await assert.rejects(completeSale(f.request, f.deps), /configure sales tax/)
  const data = {
    business,
    taxRateBps: 800,
    receiptName: 'Test club',
    receiptAddress: 'Synthetic address',
    receiptFooter: 'Thank you',
  }
  await assert.rejects(savePosSettings({ auth: { uid: 'intruder' }, data }, f.deps))
  await savePosSettings({ auth: { uid: owner }, data }, f.deps)
  await completeSale(f.request, f.deps)
  assert.equal(
    f.docs.get(`system/${business}/sales/${f.request.data.requestId}`).receiptAddress,
    'Synthetic address',
  )
})
