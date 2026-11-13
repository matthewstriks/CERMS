import { createHash, randomInt } from 'node:crypto'
import {
  validateDevMember,
  devMemberRecord,
  normalizeGovernmentId,
  emptyMemberDraft,
  durationUnits,
} from './checkout-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const visitId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,260}$/.test(v)
const cents = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 999999999
const methods = ['cash', 'card', 'giftCard', 'check', 'other']
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === keys.sort().join()
function require(condition, fail, message) {
  if (!condition) fail('invalid-argument', message)
}
export function validateSale(d, fail) {
  require(d && typeof d === 'object' && !Array.isArray(d), fail, 'Invalid sale request.')
  require(exact(d, [
    'business',
    'requestId',
    'registerId',
    'lines',
    'payments',
    'taxRateBps',
    'note',
    'customerName',
    ...('member' in d ? ['member'] : []),
    ...('rentals' in d ? ['rentals'] : []),
    ...('pendingMembers' in d ? ['pendingMembers'] : []),
  ]), fail, 'Invalid sale request.')
  require(id(d.business) &&
    /^[a-f0-9-]{36}$/.test(d.requestId) &&
    /^[a-f0-9-]{36}$/.test(d.registerId), fail, 'Invalid sale or register.')
  require(Array.isArray(d.lines) &&
    d.lines.length > 0 &&
    d.lines.length <= 100, fail, 'Add between 1 and 100 products.')
  require(new Set(d.lines.map((l) => l.productId)).size ===
    d.lines.length, fail, 'Combine duplicate products.')
  for (const l of d.lines)
    require(exact(l, ['productId', 'version', 'quantity', 'unitPriceCents']) &&
      id(l.productId) &&
      Number.isSafeInteger(l.version) &&
      l.version > 0 &&
      Number.isSafeInteger(l.quantity) &&
      l.quantity > 0 &&
      l.quantity <= 1000 &&
      cents(l.unitPriceCents), fail, 'Check product quantities and prices.')
  require(Number.isInteger(d.taxRateBps) &&
    d.taxRateBps >= 0 &&
    d.taxRateBps <= 10000, fail, 'Confirm the sales tax rate.')
  require(typeof d.note === 'string' &&
    d.note.length <= 1000 &&
    typeof d.customerName === 'string' &&
    d.customerName.length <= 200, fail, 'Check customer name and note.')
  require(Array.isArray(d.payments) && d.payments.length <= 12, fail, 'Use at most 12 payments.')
  for (const p of d.payments)
    require(exact(p, ['method', 'amountCents', 'receivedCents', 'reference']) &&
      methods.includes(p.method) &&
      cents(p.amountCents) &&
      p.amountCents > 0 &&
      cents(p.receivedCents) &&
      typeof p.reference === 'string' &&
      p.reference.length <= 120 &&
      (p.method === 'cash'
        ? p.receivedCents >= p.amountCents && !p.reference
        : p.receivedCents ===
          p.amountCents), fail, 'Check payment amounts. Cash received must cover its payment portion.')
  require(d.payments.filter((p) => p.method === 'cash').length <=
    1, fail, 'Use a single cash payment portion.')
  function validateMember(m, pending = false) {
    require(m && typeof m === 'object' && !Array.isArray(m), fail, 'Invalid linked member.')
    require(exact(m, ['id', 'name', ...('draft' in m ? ['draft'] : [])]) &&
      id(m.id) &&
      typeof m.name === 'string' &&
      m.name.length <= 200, fail, 'Invalid linked member.')
    if (pending || m.draft !== undefined)
      require(exact(m.draft, Object.keys(emptyMemberDraft())), fail, 'Invalid new member details.')
  }
  if (d.member !== undefined) validateMember(d.member)
  if (d.pendingMembers !== undefined) {
    require(Array.isArray(d.pendingMembers) &&
      d.pendingMembers.length <= 20 &&
      new Set(d.pendingMembers.map((m) => m?.id)).size === d.pendingMembers.length &&
      !d.member?.draft, fail, 'Invalid pending memberships.')
    for (const m of d.pendingMembers) validateMember(m, true)
  }
  if (d.rentals !== undefined) {
    require(Array.isArray(d.rentals) && d.rentals.length <= 100, fail, 'Use at most 100 rentals.')
    for (const r of d.rentals)
      require(exact(r, [
        'productId',
        'assignedRoom',
        ...('id' in r ? ['id'] : []),
        ...('memberId' in r ? ['memberId'] : []),
        ...('renewalVisitId' in r ? ['renewalVisitId'] : []),
      ]) &&
        id(r.productId) &&
        (r.id === undefined || /^[a-f0-9-]{36}$/.test(r.id)) &&
        (r.memberId === undefined || id(r.memberId)) &&
        (r.renewalVisitId === undefined || visitId(r.renewalVisitId)) &&
        typeof r.assignedRoom === 'string' &&
        r.assignedRoom.trim().length > 0 &&
        r.assignedRoom.length <=
          120, fail, 'Every rental needs a member and an Assigned Room/Number.')
    require(new Set(d.rentals.map((r) => r.id ?? r.productId)).size ===
      d.rentals.length, fail, 'Each rental needs a unique assignment.')
  }
  return d
}
// Every participant is resolved server-side; all reads precede all fulfillment writes.
async function fulfillment(tx, db, d, products, uid, timestamp, fail, now) {
  const productMap = new Map(d.lines.map((l, i) => [l.productId, products[i].data()]))
  const assignments = (d.rentals ?? []).map((r) => ({ ...r, memberId: r.memberId ?? d.member?.id }))
  require(new Set(assignments.filter((r) => r.renewalVisitId).map((r) => r.renewalVisitId)).size ===
    assignments.filter((r) => r.renewalVisitId)
      .length, fail, 'Renew each visit only once per order.')
  const renewals = []
  const pending = d.pendingMembers ?? (d.member?.draft ? [d.member] : [])
  if (pending.length && (uid !== owner || d.business !== 'dev'))
    fail('permission-denied', 'New membership checkout is owner-only in Dev System.')
  require(pending.length <= 20, fail, 'Use at most 20 new memberships per order.')
  const pendingIds = new Set(pending.map((m) => m.id))
  const memberIds = new Set([
    ...(d.member ? [d.member.id] : []),
    ...pendingIds,
    ...assignments.map((r) => r.memberId),
  ])
  require(memberIds.size <= 50 &&
    [...memberIds].every(id), fail, 'Every rental needs a member in this business.')
  for (const l of d.lines) {
    const p = productMap.get(l.productId)
    const assignedRentals = assignments.filter((r) => r.productId === l.productId)
    const assignedMemberships = pending.filter((m) => m.draft.membershipProductId === l.productId)
    require(p.rental
      ? assignedRentals.length === l.quantity
      : assignedRentals.length === 0, fail, 'Assign every rental unit exactly once.')
    require(p.membership
      ? assignedMemberships.length === l.quantity
      : assignedMemberships.length ===
          0, fail, 'Each membership unit needs its own new member details.')
  }
  require(assignments.every((r) => productMap.get(r.productId)?.rental) &&
    pending.every(
      (m) => productMap.get(m.draft.membershipProductId)?.membership,
    ), fail, 'A membership or rental assignment is missing its product.')
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const records = new Map(),
    identityKeys = new Set(),
    numbers = new Set()
  for (const memberId of memberIds) {
    const ref = db.doc(`members/${memberId}`),
      snapshot = await tx.get(ref)
    const entry = { ref, member: snapshot.data(), isNew: false, visits: [] }
    const input = pending.find((m) => m.id === memberId)
    if (input) {
      require(/^[a-f0-9-]{36}$/.test(memberId), fail, 'Invalid new member ID.')
      let draft
      try {
        draft = validateDevMember(input.draft)
      } catch (e) {
        fail('invalid-argument', e.message)
      }
      if (snapshot.exists)
        fail('failed-precondition', 'This member already exists. Link the existing member instead.')
      const p = productMap.get(draft.membershipProductId)
      const durationSeconds = p.membershipLengthRaw * durationUnits[p.membershipLengthType]
      require(Number.isSafeInteger(durationSeconds) &&
        durationSeconds > 0 &&
        !p.payout, fail, 'Invalid membership duration.')
      const identity = hash([
        'dev',
        draft.governmentIdType,
        normalizeGovernmentId(draft.governmentId),
        draft.birthDate,
      ])
      require(!identityKeys.has(
        identity,
      ), fail, 'Two pending members have the same ID and date of birth.')
      identityKeys.add(identity)
      entry.identityRef = db.doc(`system/dev/memberIdentities/${identity}`)
      if ((await tx.get(entry.identityRef)).exists)
        fail('failed-precondition', 'A member with this ID and date of birth already exists.')
      let number = null
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = randomInt(100000000, 1000000000)
        if (numbers.has(candidate)) continue
        entry.numberRef = db.doc(`system/dev/memberNumbers/${candidate}`)
        if (!(await tx.get(entry.numberRef)).exists) {
          number = candidate
          break
        }
      }
      if (number === null)
        fail('unavailable', 'Unable to reserve a member number. Retry the same order.')
      numbers.add(number)
      entry.member = {
        ...devMemberRecord(
          draft,
          uid,
          number,
          identity,
          hash(draft),
          { id: draft.membershipProductId, name: p.name, durationSeconds },
          new Date(now),
        ),
        creation_time: timestamp(),
        orderId: d.requestId,
      }
      entry.isNew = true
    } else if (!entry.member || entry.member.access !== d.business) {
      fail('permission-denied', 'An assigned member is unavailable in this business.')
    }
    const rentals = assignments.filter((r) => r.memberId === memberId && !r.renewalVisitId)
    for (const r of assignments.filter((r) => r.memberId === memberId && r.renewalVisitId)) {
      require(!entry.isNew, fail, 'Renewal requires an existing member.')
      const ref = db.doc(`activity/${r.renewalVisitId}`),
        snapshot = await tx.get(ref),
        v = snapshot.data()
      const p = productMap.get(r.productId),
        seconds = p.rentalLengthRaw * durationUnits[p.rentalLengthType]
      if (
        !v ||
        v.access !== d.business ||
        v.memberID !== memberId ||
        v.active !== true ||
        v.goingInactive === true ||
        v.lockerRoomStatus?.[0] !== true
      )
        fail('failed-precondition', 'This rental is no longer active in this business.')
      require(Number.isSafeInteger(seconds) &&
        seconds > 0 &&
        !p.payout &&
        Number.isFinite(v.lockerRoomStatus[5]), fail, 'Invalid rental duration or expiry.')
      const status = [...v.lockerRoomStatus]
      status[5] = Math.max(status[5], Math.floor(now / 1000)) + seconds
      require(Number.isSafeInteger(status[5]), fail, 'Rental expiry exceeds the supported range.')
      renewals.push({ ref, status })
      r.assignedRoom = String(status[1])
    }
    if (rentals.length) {
      entry.visitClaimRef = db.doc(`system/${d.business}/memberVisits/${memberId}`)
      const claim = await tx.get(entry.visitClaimRef)
      if (
        entry.member.dna === true ||
        !Number.isFinite(Number(entry.member.id_expiration)) ||
        Number(entry.member.id_expiration) * 1000 <= now
      )
        fail('failed-precondition', 'Only active, admitted memberships can check in.')
      if (entry.member.checkedIn === true || claim.exists)
        fail('failed-precondition', 'An assigned member already has an active visit.')
      entry.visits = rentals.map((r) => {
        const p = productMap.get(r.productId),
          seconds = p.rentalLengthRaw * durationUnits[p.rentalLengthType]
        require(Number.isSafeInteger(seconds) &&
          seconds > 0 &&
          !p.payout, fail, 'Invalid rental duration.')
        return {
          id: `${d.requestId}_${r.id ?? r.productId}`,
          data: {
            access: d.business,
            memberID: memberId,
            active: true,
            goingInactive: false,
            waitlist: false,
            currIn: true,
            timeIn: timestamp(),
            notes: '',
            removed: false,
            orderId: d.requestId,
            productId: r.productId,
            createdBy: uid,
            lockerRoomStatus: [
              true,
              r.assignedRoom.trim(),
              p.name,
              r.productId,
              Math.floor(now / 1000),
              Math.floor(now / 1000) + seconds,
            ],
          },
        }
      })
    }
    records.set(memberId, entry)
  }
  const snapshots = [...records].map(([id, e]) => ({
    id,
    name: e.member.name,
    number: String(e.member.id_number),
  }))
  return {
    member: snapshots.find((m) => m.id === d.member?.id) ?? null,
    members: snapshots,
    memberships: pending.map((m) => ({ productId: m.draft.membershipProductId, memberId: m.id })),
    rentals: assignments,
    apply() {
      for (const r of renewals)
        tx.update(r.ref, {
          lockerRoomStatus: r.status,
          renewedAt: timestamp(),
          renewedBy: uid,
          renewalOrderId: d.requestId,
        })
      for (const [memberId, e] of records) {
        if (e.isNew) {
          tx.create(e.ref, { ...e.member, checkedIn: e.visits.length > 0 })
          const claim = { access: 'dev', memberId }
          tx.create(e.identityRef, claim)
          tx.create(e.numberRef, claim)
        } else if (e.visits.length) tx.update(e.ref, { checkedIn: true })
        if (e.visits.length)
          tx.create(e.visitClaimRef, {
            memberId,
            orderId: d.requestId,
            visitIds: e.visits.map((v) => v.id),
          })
        for (const visit of e.visits) tx.create(db.doc(`activity/${visit.id}`), visit.data)
      }
    },
  }
}
async function access(tx, db, business, uid, fail, admin = false) {
  if (!uid || !id(business)) fail('permission-denied', 'Sign in to your business.')
  const [profile, system, permission] = await Promise.all([
    tx.get(db.doc('users/' + uid)),
    tx.get(db.doc('system/' + business)),
    tx.get(db.doc(`system/${business}/staffPermissions/${uid}`)),
  ])
  if (
    !profile.exists ||
    profile.data().uid !== uid ||
    profile.data().access !== business ||
    !system.exists ||
    (admin ? uid !== owner : uid !== owner && permission.data()?.permissions?.processSales !== true)
  )
    fail('permission-denied', 'Point of sale permission is required in this business.')
  return { profile: profile.data(), system: system.data() }
}
export function posSettings(system, stored) {
  const legacy =
    typeof system.taxRate === 'number' && system.taxRate >= 0 && system.taxRate <= 1
      ? Math.round(system.taxRate * 10000)
      : null
  return {
    taxRateBps: stored?.taxRateBps ?? legacy,
    receiptName: stored?.receiptName || system.businessName || system.name || 'CERMS',
    receiptAddress: stored?.receiptAddress || '',
    receiptFooter: stored?.receiptFooter || 'Thank you for your visit.',
  }
}
export async function savePosSettings(request, { db, fail, timestamp }) {
  const d = request.data
  require(exact(d, ['business', 'taxRateBps', 'receiptName', 'receiptAddress', 'receiptFooter']) &&
    id(d.business) &&
    Number.isInteger(d.taxRateBps) &&
    d.taxRateBps >= 0 &&
    d.taxRateBps <= 10000 &&
    typeof d.receiptName === 'string' &&
    d.receiptName.trim().length > 0 &&
    d.receiptName.length <= 200 &&
    typeof d.receiptAddress === 'string' &&
    d.receiptAddress.length <= 500 &&
    typeof d.receiptFooter === 'string' &&
    d.receiptFooter.length <= 500, fail, 'Check receipt settings and tax rate.')
  await db.runTransaction(async (tx) => {
    await access(tx, db, d.business, request.auth?.uid, fail, true)
    const { business, ...settings } = d
    tx.set(db.doc(`system/${business}/posSettings/default`), {
      ...settings,
      updatedBy: request.auth.uid,
      updatedAt: timestamp(),
    })
  })
  return { saved: true }
}
export async function completeSale(request, { db, fail, timestamp, now = () => Date.now() }) {
  const d = validateSale(request.data, fail),
    uid = request.auth?.uid
  const fingerprint = createHash('sha256').update(JSON.stringify(d)).digest('hex')
  const path = `system/${d.business}`,
    saleRef = db.doc(`${path}/sales/${d.requestId}`)
  return db.runTransaction(async (tx) => {
    const { profile, system } = await access(tx, db, d.business, uid, fail)
    const prior = await tx.get(saleRef)
    if (prior.exists) {
      if (prior.data().fingerprint !== fingerprint || prior.data().cashierUid !== uid)
        fail(
          'already-exists',
          'This sale request already saved different details. Open its receipt.',
        )
      return { saleId: d.requestId }
    }
    const registerRef = db.doc(`${path}/registers/${d.registerId}`),
      totalsRef = db.doc(`${path}/registerTotals/${d.registerId}`)
    const [register, claim, totalsDoc, settingsDoc, ...products] = await Promise.all([
      tx.get(registerRef),
      tx.get(db.doc(`${path}/registerOwners/${uid}`)),
      tx.get(totalsRef),
      tx.get(db.doc(`${path}/posSettings/default`)),
      ...d.lines.map((l) => tx.get(db.doc(`${path}/products/${l.productId}`))),
    ])
    if (
      !register.exists ||
      register.data().status !== 'open' ||
      register.data().ownerUid !== uid ||
      claim.data()?.registerId !== d.registerId
    )
      fail('failed-precondition', 'Open your own register before completing a sale.')
    const settings = posSettings(system, settingsDoc.data()),
      lines = []
    let subtotalCents = 0,
      taxCents = 0
    for (let i = 0; i < d.lines.length; i++) {
      const l = d.lines[i],
        p = products[i].data()
      if (
        !p ||
        !p.active ||
        p.version !== l.version ||
        (p.restricted && !p.restrictedUsers?.includes(uid)) ||
        (!p.askforprice && p.priceCents !== l.unitPriceCents)
      )
        fail(
          'failed-precondition',
          'A product changed or is unavailable. Refresh the catalog and review the sale.',
        )
      if (p.taxable && settings.taxRateBps === null)
        fail(
          'failed-precondition',
          'The owner must configure sales tax before selling taxable products.',
        )
      if (settings.taxRateBps !== null && settings.taxRateBps !== d.taxRateBps)
        fail('failed-precondition', 'Sales tax changed. Refresh and review the sale.')
      if (
        p.inventory !== null &&
        (!Number.isSafeInteger(p.inventory) || p.inventory < l.quantity) &&
        !p.payout
      )
        fail('failed-precondition', `${p.name}: not enough inventory.`)
      require(cents(l.quantity * l.unitPriceCents), fail, 'A line exceeds the supported amount.')
      const lineSubtotal = l.quantity * l.unitPriceCents * (p.payout ? -1 : 1),
        lineTax = p.taxable
          ? Math.round((Math.abs(lineSubtotal) * d.taxRateBps) / 10000) * Math.sign(lineSubtotal)
          : 0
      subtotalCents += lineSubtotal
      taxCents += lineTax
      lines.push({
        ...l,
        name: p.name,
        barcode: p.barcode,
        categoryId: p.cat,
        taxable: p.taxable,
        membership: p.membership,
        rental: p.rental,
        payout: p.payout,
        subtotalCents: lineSubtotal,
        taxCents: lineTax,
        totalCents: lineSubtotal + lineTax,
      })
    }
    const totalCents = subtotalCents + taxCents,
      outgoing = totalCents < 0
    require(cents(Math.abs(totalCents)) &&
      cents(Math.abs(subtotalCents)) &&
      cents(Math.abs(taxCents)), fail, 'Sale exceeds supported amount.')
    require(d.payments.reduce((s, p) => s + p.amountCents, 0) ===
      Math.abs(totalCents), fail, 'Payment portions must exactly cover the total.')
    if (outgoing && d.payments.some((p) => p.receivedCents !== p.amountCents))
      fail(
        'invalid-argument',
        'For payouts, enter the exact amount handed out; change is not applicable.',
      )
    const payments = d.payments.map((p) => ({
      ...p,
      direction: outgoing ? 'out' : 'in',
      changeCents: p.method === 'cash' && !outgoing ? p.receivedCents - p.amountCents : 0,
    }))
    const previous = totalsDoc.data() ?? {},
      netByMethod = Object.fromEntries(methods.map((m) => [m, previous.netByMethod?.[m] ?? 0]))
    for (const p of payments) netByMethod[p.method] += p.amountCents * (outgoing ? -1 : 1)
    const expectedCashCents = register.data().openingTotalCents + netByMethod.cash
    if (expectedCashCents < 0)
      fail(
        'failed-precondition',
        'The register does not have enough recorded cash for this payout.',
      )
    const cash = payments.find((p) => p.method === 'cash')
    const fulfilled = await fulfillment(tx, db, d, products, uid, timestamp, fail, now())
    const receipt = {
      schemaVersion: 1,
      business: d.business,
      receiptNumber: d.requestId,
      registerId: d.registerId,
      cashierUid: uid,
      cashierName: profile.displayName || uid,
      customerName: fulfilled.member?.name ?? d.customerName,
      ...(fulfilled.member ? { member: fulfilled.member } : {}),
      rentals: fulfilled.rentals,
      members: fulfilled.members,
      memberships: fulfilled.memberships,
      note: d.note,
      lines,
      payments,
      subtotalCents,
      taxCents,
      totalCents,
      taxRateBps: d.taxRateBps,
      receiptName: settings.receiptName,
      receiptAddress: settings.receiptAddress,
      receiptFooter: settings.receiptFooter,
      status: 'completed',
      createdAt: timestamp(),
      fingerprint,
    }
    fulfilled.apply()
    tx.create(saleRef, receipt)
    tx.set(totalsRef, {
      schemaVersion: 1,
      registerId: d.registerId,
      saleCount: (previous.saleCount ?? 0) + 1,
      totalCents: (previous.totalCents ?? 0) + totalCents,
      taxCents: (previous.taxCents ?? 0) + taxCents,
      netByMethod,
      expectedCashCents,
      cashReceivedCents:
        (previous.cashReceivedCents ?? 0) + (cash && !outgoing ? cash.receivedCents : 0),
      changeGivenCents: (previous.changeGivenCents ?? 0) + (cash?.changeCents ?? 0),
      cashPaidOutCents:
        (previous.cashPaidOutCents ?? 0) + (cash && outgoing ? cash.amountCents : 0),
      updatedAt: timestamp(),
    })
    for (let i = 0; i < products.length; i++) {
      const p = products[i].data()
      if (p.inventory !== null && !p.payout)
        tx.update(db.doc(`${path}/products/${d.lines[i].productId}`), {
          inventory: p.inventory - d.lines[i].quantity,
          version: p.version + 1,
          updatedBy: uid,
          updatedAt: timestamp(),
        })
    }
    return { saleId: d.requestId }
  })
}

// Restricted field edit; no time, product, member, admission or billing mutations.
export async function updateRental(request, { db, fail, timestamp }) {
  const d = request.data
  require(exact(d, [
    'business',
    'visitId',
    'expectedRevision',
    'assignedRoom',
    'notes',
    'inside',
    'waiting',
  ]) &&
    id(d.business) &&
    visitId(d.visitId) &&
    Number.isSafeInteger(d.expectedRevision) &&
    d.expectedRevision >= 0 &&
    typeof d.assignedRoom === 'string' &&
    !!d.assignedRoom.trim() &&
    d.assignedRoom.length <= 120 &&
    typeof d.notes === 'string' &&
    d.notes.length <= 1000 &&
    typeof d.inside === 'boolean' &&
    typeof d.waiting === 'boolean', fail, 'Check the rental details.')
  await db.runTransaction(async (tx) => {
    await access(tx, db, d.business, request.auth?.uid, fail)
    const ref = db.doc(`activity/${d.visitId}`),
      snapshot = await tx.get(ref),
      v = snapshot.data()
    if (
      !v ||
      v.access !== d.business ||
      v.active !== true ||
      v.goingInactive === true ||
      v.lockerRoomStatus?.[0] !== true
    )
      fail('failed-precondition', 'This rental is no longer active in this business.')
    if ((v.editRevision ?? 0) !== d.expectedRevision)
      fail(
        'failed-precondition',
        'This rental was edited by someone else. Reopen it and review the latest details.',
      )
    const status = [...v.lockerRoomStatus]
    status[1] = d.assignedRoom.trim()
    tx.update(ref, {
      lockerRoomStatus: status,
      notes: d.notes.trim(),
      currIn: d.inside,
      waitlist: d.waiting,
      editRevision: d.expectedRevision + 1,
      updatedAt: timestamp(),
      updatedBy: request.auth.uid,
    })
  })
  return { saved: true }
}
