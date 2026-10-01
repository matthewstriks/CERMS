import { createHash } from 'node:crypto'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
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
  require(exact(d, [
    'business',
    'requestId',
    'registerId',
    'lines',
    'payments',
    'taxRateBps',
    'note',
    'customerName',
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
  return d
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
export async function completeSale(request, { db, fail, timestamp }) {
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
    const receipt = {
      schemaVersion: 1,
      business: d.business,
      receiptNumber: d.requestId,
      registerId: d.registerId,
      cashierUid: uid,
      cashierName: profile.displayName || uid,
      customerName: d.customerName,
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
