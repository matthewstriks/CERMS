import test from 'node:test'
import assert from 'node:assert/strict'
import { completeSale } from './pos.mjs'
import { posFixture, owner, business, registerId } from '../scripts/fixtures/pos-server.mjs'
const now = Date.UTC(2026, 10, 14, 12),
  day = 86400
function fixture(mode = 'extend', expiry = now / 1000 + 10 * day) {
  const f = posFixture(),
    retail = f.docs.get(`system/${business}/products/retail`)
  f.docs.set(`system/${business}/products/plan`, {
    ...retail,
    membership: true,
    taxable: false,
    inventory: null,
    name: '30 day membership',
    membershipLengthRaw: 30,
    membershipLengthType: 'day',
  })
  f.docs.set('members/existing', {
    access: business,
    name: 'Actual Member',
    id_number: 123456789,
    membership_type: 'Old plan',
    id_expiration: expiry,
    checkedIn: false,
    dna: false,
    notes: ['Keep notes'],
    creation_time: 'original',
    productId: 'original-product',
    waiver_status: true,
  })
  f.deps.now = () => now
  f.request.data.lines = [{ productId: 'plan', version: 1, quantity: 1, unitPriceCents: 1000 }]
  f.request.data.payments = [
    { method: 'cash', amountCents: 1000, receivedCents: 1000, reference: '' },
  ]
  f.request.data.membershipAssignments = [
    { id: '50000000-0000-4000-8000-000000000001', productId: 'plan', memberId: 'existing', mode },
  ]
  return f
}
test('membership renewal keeps remaining time, changes only type/expiry and returns immutable server snapshots', async () => {
  const f = fixture(),
    original = structuredClone(f.docs.get('members/existing'))
  await completeSale(f.request, f.deps)
  assert.deepEqual(f.docs.get('members/existing'), {
    ...original,
    membership_type: '30 day membership',
    id_expiration: now / 1000 + 40 * day,
  })
  const receipt = f.docs.get(`system/${business}/sales/${f.request.data.requestId}`)
  assert.equal(receipt.members[0].name, 'Actual Member')
  assert.equal(receipt.memberships[0].mode, 'extend')
  assert.equal(receipt.memberships[0].expiresAt, now / 1000 + 40 * day)
  assert.equal(receipt.memberships[0].previousExpiresAt, original.id_expiration)
  f.docs.get(`system/${business}/registers/${registerId}`).status = 'closed'
  f.deps.now = () => now + 100 * day * 1000
  await completeSale(f.request, f.deps)
  assert.equal(f.commits(), 1)
  assert.equal(f.docs.get('members/existing').id_expiration, now / 1000 + 40 * day)
})
test('restart deliberately replaces remaining time; extending expired memberships starts now; repeated units add all purchased duration', async () => {
  for (const [mode, expiry] of [
    ['restart', now / 1000 + 100 * day],
    ['extend', now / 1000 - 100 * day],
  ]) {
    const f = fixture(mode, expiry)
    f.request.data.membershipAssignments.push({
      ...f.request.data.membershipAssignments[0],
      id: '50000000-0000-4000-8000-000000000002',
    })
    f.request.data.lines[0].quantity = 2
    f.request.data.payments[0].amountCents = 2000
    f.request.data.payments[0].receivedCents = 2000
    await completeSale(f.request, f.deps)
    assert.equal(f.docs.get('members/existing').id_expiration, now / 1000 + 60 * day)
  }
})
test('POS-authorized staff can renew in their saved business without member-edit rights', async () => {
  const f = fixture(),
    uid = 'cashier'
  f.request.auth.uid = uid
  f.docs.set(`users/${uid}`, { uid, access: business, displayName: 'Cashier' })
  f.docs.set(`system/${business}/staffPermissions/${uid}`, {
    permissions: { processSales: true, editMembers: false },
  })
  f.docs.get(`system/${business}/registers/${registerId}`).ownerUid = uid
  f.docs.set(`system/${business}/registerOwners/${uid}`, { registerId })
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get('members/existing').id_expiration, now / 1000 + 40 * day)
  assert.deepEqual(f.docs.get(`users/${uid}`), { uid, access: business, displayName: 'Cashier' })
})
test('invalid, foreign, DNA, unavailable and inconsistent membership assignments commit nothing', async () => {
  for (const change of [
    (f) => (f.docs.get('members/existing').access = 'foreign'),
    (f) => (f.docs.get('members/existing').dna = true),
    (f) => f.docs.delete('members/existing'),
    (f) => (f.docs.get(`system/${business}/products/plan`).active = false),
    (f) => (f.docs.get(`system/${business}/products/plan`).membership = false),
    (f) => (f.docs.get(`system/${business}/products/plan`).membershipLengthRaw = 0),
    (f) => (f.request.data.membershipAssignments[0].mode = 'forged'),
    (f) => (f.request.data.membershipAssignments[0].memberId = '../foreign'),
    (f) => (f.request.data.membershipAssignments[0].expiresAt = 9999999999),
    (f) => (f.request.data.membershipAssignments = []),
    (f) => (f.request.data.lines[0].quantity = 2),
    (f) => (f.docs.get('members/existing').id_expiration = null),
  ]) {
    const f = fixture()
    change(f)
    await assert.rejects(completeSale(f.request, f.deps))
    assert.equal(f.commits(), 0)
  }
})
test('renewal plus rental check-in admits an expired member atomically after payment and never after rejected payment', async () => {
  const f = fixture('restart', now / 1000 - day)
  const plan = f.docs.get(`system/${business}/products/plan`)
  f.docs.set(`system/${business}/products/room`, {
    ...plan,
    membership: false,
    rental: true,
    rentalLengthRaw: 2,
    rentalLengthType: 'hour',
  })
  f.request.data.lines.push({ productId: 'room', version: 1, quantity: 1, unitPriceCents: 1000 })
  f.request.data.rentals = [{ productId: 'room', memberId: 'existing', assignedRoom: 'A-1' }]
  const old = structuredClone(f.docs.get('members/existing'))
  await assert.rejects(completeSale(f.request, f.deps), /exactly cover/)
  assert.deepEqual(f.docs.get('members/existing'), old)
  f.request.data.payments[0].amountCents = 2000
  f.request.data.payments[0].receivedCents = 2000
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get('members/existing').checkedIn, true)
  assert.equal(f.docs.get('members/existing').id_expiration, now / 1000 + 30 * day)
  assert.ok(f.docs.has(`system/${business}/memberVisits/existing`))
})
