import test from 'node:test'
import assert from 'node:assert/strict'
import { posFixture, business, registerId, owner } from '../scripts/fixtures/pos-server.mjs'
import { completeSale } from './pos.mjs'
import { refundSale } from './refunds.mjs'
const saleId = '20000000-0000-4000-8000-000000000001',
  refundId = '30000000-0000-4000-8000-000000000001'
async function fixture() {
  const f = posFixture()
  f.request.data.requestId = saleId
  await completeSale(f.request, f.deps)
  const request = {
    auth: { uid: owner },
    data: {
      action: 'refund',
      business,
      saleId,
      requestId: refundId,
      registerId,
      expectedRevision: 0,
      reason: 'Returned unopened',
      confirmed: true,
      lines: [{ index: 0, quantity: 1, restock: true, cancelService: false }],
      payments: [
        { method: 'cash', amountCents: 1000, reference: '' },
        { method: 'card', amountCents: 80, reference: '' },
      ],
    },
  }
  return { ...f, refund: request }
}
test('partial return uses original prices/tax, restocks once, preserves original and retries after register close', async () => {
  const f = await fixture()
  const before = structuredClone(f.docs.get(`system/${business}/sales/${saleId}`))
  await refundSale(f.refund, f.deps)
  const t = f.docs.get(`system/${business}/registerTotals/${registerId}`)
  assert.equal(t.totalCents, 1080)
  assert.equal(t.taxCents, 80)
  assert.equal(t.expectedCashCents, 10000)
  assert.equal(t.refundCents, 1080)
  assert.equal(t.refundCount, 1)
  assert.equal(t.saleCount, 1)
  assert.equal(f.docs.get(`system/${business}/products/retail`).inventory, 9)
  assert.deepEqual(f.docs.get(`system/${business}/sales/${saleId}`), before)
  f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'
  await refundSale(f.refund, f.deps)
  assert.equal(f.docs.get(`system/${business}/products/retail`).inventory, 9)
  f.refund.data.reason = 'changed'
  await assert.rejects(refundSale(f.refund, f.deps), { code: 'already-exists' })
})
test('permission, business, remaining quantity/method caps, cash and closed register failures leave everything unchanged', async () => {
  for (const change of [
    (f) => (f.refund.auth.uid = 'cashier'),
    (f) => (f.refund.data.business = 'foreign'),
    (f) => (f.refund.data.lines[0].quantity = 3),
    (f) => (f.refund.data.payments = [{ method: 'cash', amountCents: 1080, reference: '' }]),
    (f) => {
      f.docs.get(`system/${business}/registers/${registerId}`).openingTotalCents = 0
      f.docs.get(`system/${business}/registerTotals/${registerId}`).netByMethod.cash = 0
    },
    (f) => (f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'),
  ]) {
    const f = await fixture()
    change(f)
    const before = structuredClone([...f.docs])
    await assert.rejects(refundSale(f.refund, f.deps))
    assert.deepEqual([...f.docs], before)
  }
})
test('full refund limits stale/duplicate requests and preserves refund counters on later checkout', async () => {
  const f = await fixture()
  f.refund.data.lines[0].quantity = 2
  f.refund.data.payments[1].amountCents = 1160
  await refundSale(f.refund, f.deps)
  f.refund.data.requestId = '30000000-0000-4000-8000-000000000002'
  await assert.rejects(refundSale(f.refund, f.deps), { code: 'failed-precondition' })
  f.refund.data.expectedRevision = 1
  await assert.rejects(refundSale(f.refund, f.deps))
  const p = f.docs.get(`system/${business}/products/retail`)
  f.request.data.requestId = '20000000-0000-4000-8000-000000000002'
  f.request.data.lines[0].version = p.version
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get(`system/${business}/registerTotals/${registerId}`).refundCount, 1)
})
test('refund records on a different own open register without changing the original closed shift', async () => {
  const f = await fixture(),
    other = '10000000-0000-4000-8000-000000000002'
  f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'
  const original = structuredClone(f.docs.get(`system/${business}/registerTotals/${registerId}`))
  f.docs.set(`system/${business}/registers/${other}`, {
    status: 'open',
    ownerUid: owner,
    openingTotalCents: 10000,
  })
  f.docs.set(`system/${business}/registerOwners/${owner}`, { registerId: other })
  f.refund.data.registerId = other
  await refundSale(f.refund, f.deps)
  assert.deepEqual(f.docs.get(`system/${business}/registerTotals/${registerId}`), original)
  assert.equal(f.docs.get(`system/${business}/registerTotals/${other}`).totalCents, -1080)
})
test('optional membership undo restores purchased renewal only and refuses later changes', async () => {
  for (const cancel of [false, true]) {
    const f = await fixture()
    const sale = f.docs.get(`system/${business}/sales/${saleId}`)
    sale.lines[0].membership = true
    sale.memberships = [
      {
        productId: 'retail',
        memberId: 'member',
        action: 'renewal',
        expiresAt: 2000,
        previousExpiresAt: 1000,
      },
    ]
    f.docs.set('members/member', {
      access: business,
      id_expiration: 2000,
      checkedIn: false,
      membershipOrderId: saleId,
    })
    f.refund.data.lines[0] = { index: 0, quantity: 2, restock: false, cancelService: cancel }
    f.refund.data.payments[1].amountCents = 1160
    await refundSale(f.refund, f.deps)
    assert.equal(f.docs.get('members/member').id_expiration, cancel ? 1000 : 2000)
  }
  const f = await fixture()
  const sale = f.docs.get(`system/${business}/sales/${saleId}`)
  sale.lines[0].membership = true
  sale.memberships = [
    {
      productId: 'retail',
      memberId: 'member',
      action: 'renewal',
      expiresAt: 2000,
      previousExpiresAt: 1000,
    },
  ]
  f.docs.set('members/member', { access: business, id_expiration: 3000, checkedIn: false })
  f.refund.data.lines[0] = { index: 0, quantity: 2, restock: false, cancelService: true }
  f.refund.data.payments[1].amountCents = 1160
  await assert.rejects(refundSale(f.refund, f.deps), { code: 'failed-precondition' })
  assert.equal(f.docs.get('members/member').id_expiration, 3000)
})
test('rental cancellation ends only purchased visits and preserves admission until last unit is cancelled', async () => {
  const f = await fixture()
  const sale = f.docs.get(`system/${business}/sales/${saleId}`)
  sale.lines[0].rental = true
  sale.rentals = [{ productId: 'retail', id: 'rental', memberId: 'member' }]
  const visit = saleId + '_rental'
  f.docs.set('members/member', { access: business, checkedIn: true })
  f.docs.set(`activity/${visit}`, {
    access: business,
    memberID: 'member',
    orderId: saleId,
    active: true,
    editRevision: 0,
  })
  f.docs.set('activity/other', { access: business, memberID: 'member', active: true })
  f.docs.set(`system/${business}/memberVisits/member`, {
    memberId: 'member',
    visitIds: [visit, 'other'],
  })
  f.refund.data.lines[0] = { index: 0, quantity: 2, restock: false, cancelService: true }
  f.refund.data.payments[1].amountCents = 1160
  await refundSale(f.refund, f.deps)
  assert.equal(f.docs.get(`activity/${visit}`).active, false)
  assert.equal(f.docs.get('activity/other').active, true)
  assert.equal(f.docs.get('members/member').checkedIn, true)
  assert.deepEqual(f.docs.get(`system/${business}/memberVisits/member`).visitIds, ['other'])
})

test('refund-only staff can refund without sale permissions; ordinary cashiers cannot', async () => {
  for (const allowed of [false, true]) {
    const f = await fixture(),
      uid = 'refund-staff'
    f.docs.set('users/' + uid, { uid, access: business, displayName: 'Refund Staff' })
    f.docs.set(`system/${business}/staffPermissions/${uid}`, {
      permissions: { processSales: !allowed, processRefunds: allowed },
    })
    f.docs.get(`system/${business}/registers/${registerId}`).ownerUid = uid
    f.docs.set(`system/${business}/registerOwners/${uid}`, { registerId })
    f.refund.auth.uid = uid
    if (allowed) await refundSale(f.refund, f.deps)
    else await assert.rejects(refundSale(f.refund, f.deps), { code: 'permission-denied' })
  }
})
