import test from 'node:test'
import assert from 'node:assert/strict'
import { completeSale, savePosSettings, updateRental } from './pos.mjs'
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

function memberCheckout() {
  const f = posFixture()
  for (const [key, value] of [...f.docs]) {
    if (key.startsWith('system/' + business)) {
      f.docs.set(key.replace('system/' + business, 'system/dev'), value)
      f.docs.delete(key)
    }
  }
  f.docs.get('users/' + owner).access = 'dev'
  f.request.data.business = 'dev'
  const retail = f.docs.get('system/dev/products/retail')
  f.docs.set('system/dev/products/plan', {
    ...retail,
    membership: true,
    rental: false,
    name: 'Monthly',
    membershipLengthRaw: 30,
    membershipLengthType: 'day',
    inventory: null,
  })
  f.docs.set('system/dev/products/room', {
    ...retail,
    rental: true,
    membership: false,
    name: 'Room',
    rentalLengthRaw: 2,
    rentalLengthType: 'hour',
    inventory: null,
  })
  f.request.data.lines = ['plan', 'room'].map((productId) => ({
    productId,
    version: 1,
    quantity: 1,
    unitPriceCents: 1000,
  }))
  f.request.data.member = {
    id: '40000000-0000-4000-8000-000000000001',
    name: 'Forged display',
    draft: {
      firstName: 'Synthetic',
      middleName: '',
      lastName: 'Guest',
      suffix: '',
      birthDate: '1990-01-02',
      phone: '+12105550123',
      email: '',
      governmentId: 'FAKE-ONLY-1',
      governmentIdType: 'TX',
      membershipProductId: 'plan',
      notes: 'Synthetic notes',
      importExisting: false,
      createdDate: '',
      expiresDate: '',
      membershipNumber: '',
    },
  }
  f.request.data.rentals = [{ productId: 'room', assignedRoom: 'A-12' }]
  f.deps.now = () => Date.parse('2026-10-11T12:00:00Z')
  return f
}
test('membership, identity/number, rental visits, linked receipt and totals commit together; retry does not duplicate', async () => {
  const f = memberCheckout(),
    memberId = f.request.data.member.id,
    saleId = f.request.data.requestId
  assert.equal(f.docs.has('members/' + memberId), false)
  await completeSale(f.request, f.deps)
  const m = f.docs.get('members/' + memberId)
  assert.equal(m.checkedIn, true)
  assert.equal(m.orderId, saleId)
  assert.equal(m.phone, '+12105550123')
  assert.equal(m.id_expiration, Math.floor(f.deps.now() / 1000) + 30 * 86400)
  assert.equal(f.docs.get('system/dev/memberNumbers/' + m.id_number).memberId, memberId)
  assert.equal(f.docs.get('system/dev/memberIdentities/' + m.identityKey).memberId, memberId)
  const receipt = f.docs.get('system/dev/sales/' + saleId)
  assert.equal(receipt.member.id, memberId)
  assert.equal(receipt.member.draft, undefined)
  assert.equal(receipt.customerName, 'Synthetic Guest')
  const visit = f.docs.get(`activity/${saleId}_room`)
  assert.equal(visit.memberID, memberId)
  assert.equal(visit.access, 'dev')
  assert.equal(visit.active, true)
  assert.equal(visit.currIn, true)
  assert.equal(visit.lockerRoomStatus[1], 'A-12')
  assert.equal(visit.lockerRoomStatus[5], Math.floor(f.deps.now() / 1000) + 7200)
  f.docs.get(`system/dev/registers/${registerId}`).status = 'closed'
  await completeSale(f.request, f.deps)
  assert.equal(f.commits(), 1)
})
test('failed checkout never creates a member or rental (payment, assignment, catalog, age, identity, scope)', async () => {
  for (const mutate of [
    (f) => (f.request.data.payments[0].amountCents = 1),
    (f) => (f.request.data.rentals = []),
    (f) => (f.request.data.rentals[0].assignedRoom = ' '),
    (f) => (f.request.data.lines[1].quantity = 2),
    (f) => (f.request.data.member.draft.birthDate = '2020-01-01'),
    (f) => (f.request.data.member.draft.phone = 'invalid'),
    (f) => (f.request.data.member.draft.extra = true),
    (f) => (f.docs.get('system/dev/products/plan').active = false),
    (f) => (f.docs.get('system/dev/products/plan').membershipLengthType = 'invalid'),
    (f) => (f.request.data.member.draft.membershipProductId = 'missing'),
    (f) => (f.request.data.member.id = 'existing-invalid-id'),
    (f) => (f.request.data.member = null),
  ]) {
    const f = memberCheckout()
    mutate(f)
    await assert.rejects(completeSale(f.request, f.deps))
    assert.equal(f.commits(), 0)
    assert.equal(
      [...f.docs.keys()].some((k) => k.startsWith('members/') || k.startsWith('activity/')),
      false,
    )
  }
  const f = memberCheckout()
  await completeSale(f.request, f.deps)
  f.request.data.requestId = '50000000-0000-4000-8000-000000000001'
  f.request.data.member.id = '60000000-0000-4000-8000-000000000001'
  await assert.rejects(completeSale(f.request, f.deps), /already exists/)
  assert.equal(f.commits(), 1)
})
test('existing member order supports rentals only after checkout; blocks expired/DNA/foreign/already admitted members', async () => {
  for (const change of [
    null,
    { dna: true },
    { access: 'other' },
    { id_expiration: 1 },
    { checkedIn: true },
  ]) {
    const f = posFixture(),
      memberId = 'existing'
    const p = f.docs.get(`system/${business}/products/retail`)
    Object.assign(p, { rental: true, rentalLengthRaw: 1, rentalLengthType: 'hour' })
    f.request.data.lines[0].quantity = 1
    f.request.data.payments = [
      { method: 'card', amountCents: 1080, receivedCents: 1080, reference: '' },
    ]
    f.request.data.member = { id: memberId, name: 'Display name' }
    f.request.data.rentals = [{ productId: 'retail', assignedRoom: 'Locker 3' }]
    f.docs.set('members/' + memberId, {
      access: business,
      name: 'Saved member',
      id_number: 123,
      id_expiration: Math.floor(Date.now() / 1000) + 86400,
      dna: false,
      checkedIn: false,
      ...change,
    })
    if (change) {
      await assert.rejects(completeSale(f.request, f.deps))
      assert.equal(f.commits(), 0)
    } else {
      await completeSale(f.request, f.deps)
      assert.equal(f.docs.get('members/' + memberId).checkedIn, true)
      f.request.data.requestId = '60000000-0000-4000-8000-000000000001'
      f.request.data.lines[0].version = 2
      await assert.rejects(completeSale(f.request, f.deps), /active visit/)
      assert.equal(f.commits(), 1)
    }
  }
})
test('membership without rentals creates an unchecked-in member; membership line cannot be detached from creation', async () => {
  const f = memberCheckout()
  f.request.data.lines = f.request.data.lines.slice(0, 1)
  f.request.data.rentals = []
  f.request.data.payments = [
    { method: 'cash', amountCents: 1080, receivedCents: 1080, reference: '' },
  ]
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get('members/' + f.request.data.member.id).checkedIn, false)
  assert.equal(
    [...f.docs.keys()].some((k) => k.startsWith('activity/')),
    false,
  )
  const anonymous = memberCheckout()
  delete anonymous.request.data.member
  await assert.rejects(completeSale(anonymous.request, anonymous.deps))
  assert.equal(anonymous.commits(), 0)
})

function groupCheckout() {
  const f = memberCheckout(),
    first = f.request.data.member
  const second = {
    id: '70000000-0000-4000-8000-000000000001',
    name: 'Second guest',
    draft: { ...first.draft, firstName: 'Second', governmentId: 'FAKE-ONLY-2' },
  }
  f.request.data.pendingMembers = [first, second]
  f.request.data.member = { id: 'buyer', name: 'Forged buyer label' }
  for (const [id, name] of [
    ['buyer', 'Existing buyer'],
    ['friend', 'Existing friend'],
  ])
    f.docs.set('members/' + id, {
      access: 'dev',
      name,
      id_number: id === 'buyer' ? 10 : 20,
      id_expiration: Math.floor(f.deps.now() / 1000) + 86400,
      checkedIn: false,
      dna: false,
    })
  f.request.data.lines = [
    { productId: 'plan', version: 1, quantity: 2, unitPriceCents: 1000 },
    { productId: 'room', version: 1, quantity: 3, unitPriceCents: 1000 },
    { productId: 'retail', version: 1, quantity: 1, unitPriceCents: 1000 },
  ]
  f.docs.get('system/dev/products/room').inventory = 5
  f.request.data.rentals = [first.id, second.id, 'friend'].map((memberId, index) => ({
    id: `80000000-0000-4000-8000-00000000000${index + 1}`,
    productId: 'room',
    memberId,
    assignedRoom: `Room ${index + 1}`,
  }))
  f.request.data.payments = [
    { method: 'cash', amountCents: 6480, receivedCents: 7000, reference: '' },
  ]
  return f
}
test('one order creates multiple memberships and repeated rentals for pending/existing recipients independently of buyer, atomically and idempotently', async () => {
  const f = groupCheckout()
  assert.equal(f.docs.has('members/' + f.request.data.pendingMembers[0].id), false)
  await completeSale(f.request, f.deps)
  const sale = f.docs.get('system/dev/sales/' + f.request.data.requestId)
  assert.equal(sale.member.id, 'buyer')
  assert.equal(sale.customerName, 'Existing buyer')
  assert.equal(sale.members.length, 4)
  assert.equal(sale.memberships.length, 2)
  assert.equal(sale.pendingMembers, undefined)
  assert.ok(sale.members.every((m) => Object.keys(m).sort().join() === 'id,name,number'))
  assert.equal(sale.totalCents, 6480)
  assert.equal(sale.payments[0].changeCents, 520)
  assert.equal(f.docs.get('system/dev/products/room').inventory, 2)
  assert.equal(f.docs.get('system/dev/products/retail').inventory, 9)
  assert.equal(f.docs.get('members/buyer').checkedIn, false)
  assert.equal(f.docs.get('members/friend').checkedIn, true)
  for (const m of f.request.data.pendingMembers) {
    const record = f.docs.get('members/' + m.id)
    assert.equal(record.checkedIn, true)
    assert.equal(record.orderId, f.request.data.requestId)
    assert.equal(f.docs.get('system/dev/memberIdentities/' + record.identityKey).memberId, m.id)
    assert.equal(f.docs.get('system/dev/memberNumbers/' + record.id_number).memberId, m.id)
  }
  for (const r of f.request.data.rentals) {
    const visit = f.docs.get(`activity/${f.request.data.requestId}_${r.id}`)
    assert.equal(visit.memberID, r.memberId)
    assert.equal(visit.lockerRoomStatus[1], r.assignedRoom)
  }
  f.docs.get(`system/dev/registers/${registerId}`).status = 'closed'
  await completeSale(f.request, f.deps)
  assert.equal(f.commits(), 1)
  f.request.data.rentals[0].memberId = 'friend'
  await assert.rejects(completeSale(f.request, f.deps), /different details/)
  assert.equal(f.commits(), 1)
})
test('any invalid group recipient, duplicate pending identity, quantity mismatch or assignment invalidates the entire checkout', async () => {
  for (const mutate of [
    (f) => f.request.data.rentals.pop(),
    (f) => (f.request.data.rentals[0].id = f.request.data.rentals[1].id),
    (f) => (f.request.data.rentals[0].memberId = 'missing'),
    (f) => (f.request.data.rentals[0].assignedRoom = ''),
    (f) => (f.request.data.rentals[0].productId = 'retail'),
    (f) => (f.docs.get('members/friend').access = 'foreign'),
    (f) => (f.docs.get('members/friend').dna = true),
    (f) => (f.docs.get('members/friend').checkedIn = true),
    (f) => (f.docs.get('members/friend').id_expiration = 1),
    (f) =>
      (f.request.data.pendingMembers[1].draft.governmentId =
        f.request.data.pendingMembers[0].draft.governmentId),
    (f) => (f.request.data.pendingMembers[1].id = f.request.data.pendingMembers[0].id),
    (f) => f.request.data.pendingMembers.pop(),
    (f) => (f.request.data.lines[0].quantity = 3),
    (f) => (f.docs.get('system/dev/products/room').inventory = 2),
    (f) => (f.docs.get('system/dev/products/plan').version = 2),
  ]) {
    const f = groupCheckout(),
      before = structuredClone([...f.docs])
    mutate(f)
    const expected = structuredClone([...f.docs])
    await assert.rejects(completeSale(f.request, f.deps))
    assert.equal(f.commits(), 0)
    assert.deepEqual([...f.docs], expected)
    assert.equal(
      [...f.docs.keys()].filter((k) => k.startsWith('members/')).length,
      before.filter(([k]) => k.startsWith('members/')).length,
    )
  }
})
test('multiple rentals for one recipient share a single admission claim; linked pending member can differ from membership recipients', async () => {
  const f = groupCheckout()
  const first = f.request.data.pendingMembers[0]
  f.request.data.member = { id: first.id, name: first.name }
  f.request.data.rentals.forEach((r) => (r.memberId = 'friend'))
  await completeSale(f.request, f.deps)
  assert.equal(f.docs.get('system/dev/memberVisits/friend').visitIds.length, 3)
  assert.equal(f.docs.get('members/' + first.id).checkedIn, false)
  assert.equal(f.docs.get('system/dev/sales/' + f.request.data.requestId).member.id, first.id)
})
test('cashier permission does not grant pending member creation or access to foreign rental recipients', async () => {
  const f = groupCheckout(),
    uid = 'cashier'
  f.request.auth.uid = uid
  f.docs.set('users/' + uid, { uid, access: 'dev' })
  f.docs.set('system/dev/staffPermissions/' + uid, { permissions: { processSales: true } })
  f.docs.set('system/dev/registerOwners/' + uid, { registerId })
  f.docs.get(`system/dev/registers/${registerId}`).ownerUid = uid
  await assert.rejects(completeSale(f.request, f.deps), /owner-only/)
  assert.equal(f.commits(), 0)
})

function rentalRenewal(offset = 3600) {
  const f = memberCheckout()
  const memberId = 'existing',
    visitId = 'existing-visit'
  const now = Math.floor(f.deps.now() / 1000)
  f.docs.set('members/' + memberId, {
    access: 'dev',
    name: 'Existing Guest',
    id_number: 123,
    checkedIn: true,
    id_expiration: now + 86400,
  })
  f.docs.set('activity/' + visitId, {
    access: 'dev',
    memberID: memberId,
    active: true,
    goingInactive: false,
    currIn: true,
    waitlist: false,
    notes: 'Original',
    lockerRoomStatus: [true, 'A-12', 'Room', 'room', now - 7200, now + offset],
  })
  f.docs.set('system/dev/memberVisits/' + memberId, { memberId, visitIds: [visitId] })
  f.request.data.member = { id: memberId, name: 'Forged' }
  f.request.data.lines = [{ productId: 'room', version: 1, quantity: 1, unitPriceCents: 1000 }]
  f.request.data.rentals = [
    { productId: 'room', assignedRoom: 'forged room', memberId, renewalVisitId: visitId },
  ]
  f.request.data.payments = [
    { method: 'cash', amountCents: 1080, receivedCents: 2000, reference: '' },
  ]
  return f
}
test('paid renewals extend remaining time or restart overdue at server checkout time, atomically and once', async () => {
  for (const offset of [3600, -3600, 0]) {
    const f = rentalRenewal(offset),
      before = structuredClone(f.docs.get('activity/existing-visit'))
    assert.equal(
      f.docs.get('activity/existing-visit').lockerRoomStatus[5],
      before.lockerRoomStatus[5],
    )
    await completeSale(f.request, f.deps)
    const visit = f.docs.get('activity/existing-visit')
    assert.equal(
      visit.lockerRoomStatus[5],
      Math.floor(f.deps.now() / 1000) + Math.max(offset, 0) + 7200,
    )
    assert.deepEqual(visit.lockerRoomStatus.slice(0, 5), before.lockerRoomStatus.slice(0, 5))
    assert.equal([...f.docs.keys()].filter((p) => p.startsWith('activity/')).length, 1)
    assert.equal(f.docs.get('members/existing').checkedIn, true)
    const receipt = f.docs.get('system/dev/sales/' + f.request.data.requestId)
    assert.equal(receipt.rentals[0].assignedRoom, 'A-12')
    assert.equal(receipt.rentals[0].renewalVisitId, 'existing-visit')
    await completeSale(f.request, f.deps)
    assert.equal(f.commits(), 1)
  }
})
test('failed or forged renewal never saves sale, inventory, ledger or time', async () => {
  for (const change of [
    (f) => {
      f.request.data.payments[0].amountCents = 1
    },
    (f) => {
      f.docs.get('activity/existing-visit').access = 'foreign'
    },
    (f) => {
      f.docs.get('activity/existing-visit').memberID = 'other'
    },
    (f) => {
      f.docs.get('activity/existing-visit').active = false
    },
    (f) => {
      f.docs.get('activity/existing-visit').goingInactive = true
    },
    (f) => {
      f.docs.get('activity/existing-visit').lockerRoomStatus[0] = false
    },
    (f) => {
      f.docs.get('system/dev/products/room').rentalLengthRaw = -1
    },
    (f) => {
      f.request.auth.uid = 'intruder'
    },
    (f) => {
      f.request.data.rentals[0].renewalVisitId = '../foreign'
    },
    (f) => {
      f.request.data.lines[0].quantity = 2
      f.request.data.rentals.push({
        ...f.request.data.rentals[0],
        id: '10000000-0000-4000-8000-000000000001',
      })
    },
  ]) {
    const f = rentalRenewal()
    change(f)
    const before = structuredClone([...f.docs])
    await assert.rejects(completeSale(f.request, f.deps))
    assert.equal(f.commits(), 0)
    assert.deepEqual([...f.docs], before)
  }
})
test('rental editing permits only scoped room, notes, in/out and waitlist, detects stale edits and preserves expiry', async () => {
  const f = rentalRenewal()
  const request = {
    auth: f.request.auth,
    data: {
      business: 'dev',
      visitId: 'existing-visit',
      expectedRevision: 0,
      assignedRoom: 'B-9',
      notes: 'Updated',
      inside: false,
      waiting: true,
    },
  }
  const before = structuredClone(f.docs.get('activity/existing-visit'))
  await updateRental(request, f.deps)
  const saved = f.docs.get('activity/existing-visit')
  assert.equal(saved.lockerRoomStatus[1], 'B-9')
  assert.equal(saved.lockerRoomStatus[5], before.lockerRoomStatus[5])
  assert.equal(saved.currIn, false)
  assert.equal(saved.waitlist, true)
  assert.equal(saved.notes, 'Updated')
  await assert.rejects(updateRental(request, f.deps), /edited by someone else/)
  for (const change of [
    (r) => {
      r.data.expiresAt = 9999999999
    },
    (r) => {
      r.data.business = 'foreign'
    },
    (r) => {
      r.auth.uid = 'intruder'
    },
    (r) => {
      r.data.assignedRoom = ''
    },
  ]) {
    const bad = structuredClone(request)
    bad.data.expectedRevision = 1
    change(bad)
    await assert.rejects(updateRental(bad, f.deps))
  }
  assert.equal(f.commits(), 1)
})
test('assigned cashier can edit and renew rentals; revoked permissions fail without writes', async () => {
  const f = rentalRenewal(),
    uid = 'cashier'
  f.docs.set('users/' + uid, { uid, access: 'dev' })
  f.docs.set(`system/dev/staffPermissions/${uid}`, { permissions: { processSales: true } })
  f.docs.set(`system/dev/registerOwners/${uid}`, { registerId })
  f.docs.get(`system/dev/registers/${registerId}`).ownerUid = uid
  f.request.auth.uid = uid
  await updateRental(
    {
      auth: { uid },
      data: {
        business: 'dev',
        visitId: 'existing-visit',
        expectedRevision: 0,
        assignedRoom: 'B-1',
        notes: '',
        inside: true,
        waiting: false,
      },
    },
    f.deps,
  )
  await completeSale(f.request, f.deps)
  f.docs.get(`system/dev/staffPermissions/${uid}`).permissions.processSales = false
  await assert.rejects(completeSale(f.request, f.deps), /permission/)
  assert.equal(f.commits(), 2)
})
