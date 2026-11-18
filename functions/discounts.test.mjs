import test from 'node:test'
import assert from 'node:assert/strict'
import { posFixture, business, registerId, owner } from '../scripts/fixtures/pos-server.mjs'
import { discountCodes } from './discounts.mjs'
import { completeSale } from './pos.mjs'
import { refundSale } from './refunds.mjs'
const rule = () => ({
  code: 'SAVE10',
  name: 'Save ten',
  description: '',
  kind: 'percent',
  value: 1000,
  active: true,
  productIds: [],
  categoryIds: [],
  productKinds: [],
  startsAt: null,
  endsAt: null,
  minimumCents: 0,
  maxDiscountCents: null,
  maxUses: null,
  maxUsesPerMember: null,
})
const call = (f, data, uid = owner) =>
  discountCodes({ auth: { uid }, data: { business, ...data } }, f.deps)
const quote = (f) =>
  call(f, { action: 'quote', code: 'SAVE10', memberId: null, lines: f.request.data.lines })
test('discount management is separate from sales; edits/archive preserve counters and reject stale/cross-business requests', async () => {
  const f = posFixture(),
    manager = 'manager'
  f.docs.set('users/' + manager, { uid: manager, access: business })
  f.docs.set(`system/${business}/staffPermissions/${manager}`, {
    permissions: { manageDiscountCodes: true, processSales: false },
  })
  await call(f, { action: 'save', rule: rule(), expectedVersion: 0 }, manager)
  await assert.rejects(
    call(
      f,
      { action: 'quote', code: 'SAVE10', memberId: null, lines: f.request.data.lines },
      manager,
    ),
    { code: 'permission-denied' },
  )
  const ref = `system/${business}/discountCodes/SAVE10`
  f.docs.get(ref).usedCount = 2
  await call(
    f,
    { action: 'save', rule: { ...rule(), name: 'Updated' }, expectedVersion: 1 },
    manager,
  )
  assert.equal(f.docs.get(ref).usedCount, 2)
  await assert.rejects(call(f, { action: 'save', rule: rule(), expectedVersion: 1 }, manager), {
    code: 'failed-precondition',
  })
  await call(f, { action: 'archive', code: 'SAVE10', expectedVersion: 2 }, manager)
  assert.equal(f.docs.get(ref).archived, true)
  assert.equal(f.docs.get(ref).usedCount, 2)
  await assert.rejects(quote(f), { code: 'failed-precondition' })
  await assert.rejects(
    call(f, { action: 'save', business: 'foreign', rule: rule(), expectedVersion: 0 }, manager),
    { code: 'permission-denied' },
  )
  f.docs.get(`system/${business}/staffPermissions/${manager}`).permissions.manageDiscountCodes =
    false
  await assert.rejects(call(f, { action: 'save', rule: rule(), expectedVersion: 3 }, manager), {
    code: 'permission-denied',
  })
})
test('checkout stores allocated savings and discounted tax once; partial returns reverse only the paid portion and discount', async () => {
  const f = posFixture()
  await call(f, { action: 'save', rule: rule(), expectedVersion: 0 })
  const q = await quote(f)
  assert.equal(q.expectedDiscountCents, 200)
  f.request.data.discount = {
    code: q.code,
    version: q.version,
    expectedDiscountCents: q.expectedDiscountCents,
  }
  f.request.data.payments[1].amountCents = f.request.data.payments[1].receivedCents = 944
  await completeSale(f.request, f.deps)
  const sale = f.docs.get(`system/${business}/sales/${f.request.data.requestId}`)
  assert.equal(sale.subtotalCents, 1800)
  assert.equal(sale.taxCents, 144)
  assert.equal(sale.totalCents, 1944)
  assert.equal(sale.discountCents, 200)
  assert.equal(sale.lines[0].grossSubtotalCents, 2000)
  assert.equal(sale.lines[0].discountCents, 200)
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get(`system/${business}/discountCodes/SAVE10`).usedCount, 1)
  await refundSale(
    {
      auth: { uid: owner },
      data: {
        action: 'refund',
        business,
        saleId: f.request.data.requestId,
        registerId,
        requestId: '90000000-0000-4000-8000-000000000001',
        expectedRevision: 0,
        reason: 'Return discounted unit',
        confirmed: true,
        lines: [{ index: 0, quantity: 1, restock: true, cancelService: false }],
        payments: [{ method: 'cash', amountCents: 972, reference: '' }],
      },
    },
    f.deps,
  )
  const refund = f.docs.get(`system/${business}/sales/90000000-0000-4000-8000-000000000001`)
  assert.equal(refund.totalCents, -972)
  assert.equal(refund.discountCents, -100)
  assert.equal(f.docs.get(`system/${business}/registerTotals/${registerId}`).discountCents, 100)
  assert.equal(f.docs.get(`system/${business}/discountCodes/SAVE10`).usedCount, 1)
})
test('global/member limits, disabled codes and edited quotes fail without changing sale, stock or usage', async () => {
  for (const alter of [
    (f) => (f.docs.get(`system/${business}/discountCodes/SAVE10`).rule.active = false),
    (f) => f.docs.get(`system/${business}/discountCodes/SAVE10`).version++,
    (f) => {
      const c = f.docs.get(`system/${business}/discountCodes/SAVE10`)
      c.rule.maxUses = 1
      c.usedCount = 1
    },
    (f) => (f.request.data.discount.expectedDiscountCents = 1),
  ]) {
    const f = posFixture()
    await call(f, { action: 'save', rule: rule(), expectedVersion: 0 })
    const q = await quote(f)
    f.request.data.discount = {
      code: q.code,
      version: q.version,
      expectedDiscountCents: q.expectedDiscountCents,
    }
    f.request.data.payments[1].amountCents = f.request.data.payments[1].receivedCents = 944
    alter(f)
    const before = structuredClone([...f.docs])
    await assert.rejects(completeSale(f.request, f.deps))
    assert.deepEqual([...f.docs], before)
  }
  const f = posFixture()
  await call(f, { action: 'save', rule: { ...rule(), maxUsesPerMember: 1 }, expectedVersion: 0 })
  await assert.rejects(quote(f), /existing member/)
  f.docs.set('members/buyer', { access: business })
  f.request.data.member = { id: 'buyer', name: 'Ignored client name' }
  const q = await call(f, {
    action: 'quote',
    code: 'SAVE10',
    memberId: 'buyer',
    lines: f.request.data.lines,
  })
  f.request.data.discount = {
    code: q.code,
    version: q.version,
    expectedDiscountCents: q.expectedDiscountCents,
  }
  f.request.data.payments[1].amountCents = f.request.data.payments[1].receivedCents = 944
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get(`system/${business}/discountCodes/SAVE10/memberUses/buyer`).count, 1)
  await assert.rejects(
    call(f, {
      action: 'quote',
      code: 'SAVE10',
      memberId: 'buyer',
      lines: [{ ...f.request.data.lines[0], version: 2 }],
    }),
    /use limit/,
  )
})
test('a 100% promotion records a zero-payment order and remains retry-safe after archive and register close', async () => {
  const f = posFixture()
  await call(f, { action: 'save', rule: { ...rule(), value: 10000 }, expectedVersion: 0 })
  const q = await quote(f)
  f.request.data.discount = {
    code: q.code,
    version: q.version,
    expectedDiscountCents: q.expectedDiscountCents,
  }
  f.request.data.payments = []
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get(`system/${business}/sales/${f.request.data.requestId}`).totalCents, 0)
  await call(f, { action: 'archive', code: 'SAVE10', expectedVersion: 1 })
  f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get(`system/${business}/discountCodes/SAVE10`).usedCount, 1)
})
