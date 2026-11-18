import test from 'node:test'
import assert from 'node:assert/strict'
import { sendSaleReceipt } from './receipt-email.mjs'
import { completeSale } from './pos.mjs'
import { posFixture, owner, business } from '../scripts/fixtures/pos-server.mjs'
async function fixture() {
  const f = posFixture()
  await completeSale(f.request, f.deps)
  const saleId = f.request.data.requestId,
    salePath = `system/${business}/sales/${saleId}`
  const sale = f.docs.get(salePath)
  sale.member = { id: 'customer', name: 'Synthetic Customer', number: '123' }
  sale.createdAt = new Date('2026-11-17T18:30:00Z')
  sale.receiptName = 'Synthetic <Club>'
  f.docs.set('members/customer', {
    access: business,
    email: 'onfile@example.test',
    name: 'Synthetic Customer',
  })
  const sent = [],
    deps = {
      ...f.deps,
      send: async (message) => {
        sent.push(message)
        return { accepted: message.to }
      },
    }
  const lookup = { auth: { uid: owner }, data: { action: 'recipient', business, saleId } }
  const request = {
    auth: { uid: owner },
    data: {
      action: 'send',
      business,
      saleId,
      requestId: '30000000-0000-4000-8000-000000000001',
      email: 'edited@example.test',
      timeZone: 'America/New_York',
    },
  }
  const audit = `${salePath}/receiptDelivery/email`
  return { ...f, deps, sent, lookup, request, audit, salePath }
}
test('reads linked email without writes; explicit edited address sends server receipt and leaves customer/financial records unchanged', async () => {
  const f = await fixture(),
    before = new Map(f.docs)
  const commits = f.commits()
  assert.deepEqual(await sendSaleReceipt(f.lookup, f.deps), { email: 'onfile@example.test' })
  assert.equal(f.commits(), commits)
  assert.equal(f.sent.length, 0)
  await sendSaleReceipt(f.request, f.deps)
  assert.deepEqual(f.sent[0].to, ['edited@example.test'])
  assert.ok(f.sent[0].text.includes('SALES RECEIPT'))
  assert.ok(f.sent[0].text.includes('EST'))
  assert.ok(f.sent[0].html.includes('Synthetic &lt;Club&gt;'))
  assert.ok(!f.sent[0].html.includes('Synthetic <Club>'))
  assert.equal(f.docs.get(f.audit).state, 'sent')
  for (const [path, doc] of before) assert.deepEqual(f.docs.get(path), doc)
  assert.ok([...f.docs.keys()].every((p) => !p.startsWith('mail/')))
  await sendSaleReceipt(
    {
      ...f.request,
      data: { ...f.request.data, requestId: '40000000-0000-4000-8000-000000000001' },
    },
    f.deps,
  )
  assert.equal(f.sent.length, 1)
  await assert.rejects(
    sendSaleReceipt(
      { ...f.request, data: { ...f.request.data, email: 'different@example.test' } },
      f.deps,
    ),
    { code: 'already-exists' },
  )
})
test('email on file is required for the primary same-business customer; never infer group recipients', async () => {
  for (const mutate of [
    (f) => delete f.docs.get(f.salePath).member,
    (f) => f.docs.delete('members/customer'),
    (f) => {
      f.docs.get('members/customer').access = 'foreign'
    },
    (f) => {
      f.docs.get('members/customer').email = ''
    },
  ]) {
    const f = await fixture()
    mutate(f)
    f.docs.get(f.salePath).members = [{ id: 'other', name: 'Other group recipient' }]
    f.docs.set('members/other', { access: business, email: 'not-the-buyer@example.test' })
    assert.deepEqual(await sendSaleReceipt(f.lookup, f.deps), { email: null })
    await assert.rejects(sendSaleReceipt(f.request, f.deps), { code: 'failed-precondition' })
    assert.equal(f.sent.length, 0)
    assert.ok(!f.docs.has(f.audit))
  }
})
test('denies revoked/foreign/anonymous staff, forged receipts/headers and invalid requests without email or audit writes', async () => {
  for (const mutate of [
    (f) => {
      f.request.auth = null
    },
    (f) => {
      f.docs.get('users/' + owner).access = 'other'
    },
    (f) => {
      f.request.auth.uid = 'cashier'
      f.docs.set('users/cashier', { uid: 'cashier', access: business })
    },
    (f) => {
      f.docs.get(f.salePath).business = 'other'
    },
    (f) => {
      f.docs.get(f.salePath).status = 'pending'
    },
    (f) => {
      f.request.data.receipt = 'forged'
    },
    (f) => {
      f.request.data.email = 'a@example.test\r\nBcc: b@example.test'
    },
    (f) => {
      f.request.data.email = 'a@example.test,b@example.test'
    },
    (f) => {
      f.request.data.timeZone = 'bogus'
    },
  ]) {
    const f = await fixture()
    mutate(f)
    await assert.rejects(sendSaleReceipt(f.request, f.deps))
    assert.equal(f.sent.length, 0)
    assert.ok(!f.docs.has(f.audit))
  }
})
test('uncertain SMTP delivery is never automatically resent and does not alter checkout', async () => {
  const f = await fixture(),
    before = f.docs.get(f.salePath)
  f.deps.send = async (message) => {
    f.sent.push(message)
    throw Error('SMTP acceptance response lost')
  }
  await assert.rejects(sendSaleReceipt(f.request, f.deps), /could not be confirmed/)
  assert.equal(f.docs.get(f.audit).state, 'uncertain')
  await assert.rejects(sendSaleReceipt(f.request, f.deps), /awaiting review/)
  assert.equal(f.sent.length, 1)
  assert.deepEqual(f.docs.get(f.salePath), before)
})
test('assigned sales staff may send; removing permission denies even sent retries', async () => {
  const f = await fixture(),
    uid = 'cashier'
  f.docs.set('users/' + uid, { uid, access: business, displayName: 'Test cashier' })
  f.docs.set(`system/${business}/staffPermissions/${uid}`, { permissions: { processSales: true } })
  f.request.auth.uid = uid
  await sendSaleReceipt(f.request, f.deps)
  assert.equal(f.docs.get(f.audit).actorUid, uid)
  f.docs.get(`system/${business}/staffPermissions/${uid}`).permissions.processSales = false
  await assert.rejects(sendSaleReceipt(f.request, f.deps), { code: 'permission-denied' })
  assert.equal(f.sent.length, 1)
})
