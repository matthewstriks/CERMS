import { createHash } from 'node:crypto'
import { validRefundData, refundLineAmounts, refundMethods } from './refund-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
export async function refundSale(request, { db, fail, timestamp, now = () => Date.now() }) {
  const d = request.data,
    uid = request.auth?.uid
  if (!uid) fail('unauthenticated', 'Sign in to return items.')
  if (!validRefundData(d))
    fail('invalid-argument', 'Check return quantities, reason and refund payments.')
  const base = `system/${d.business}`,
    sourceRef = db.doc(`${base}/sales/${d.saleId}`),
    stateRef = db.doc(`${base}/saleRefunds/${d.saleId}`)
  return db.runTransaction(async (tx) => {
    const [profile, system, permissions] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(base)),
      tx.get(db.doc(`${base}/staffPermissions/${uid}`)),
    ])
    if (
      !profile.exists ||
      profile.data().uid !== uid ||
      profile.data().access !== d.business ||
      !system.exists ||
      (uid !== owner && permissions.data()?.permissions?.processRefunds !== true)
    )
      fail('permission-denied', 'Returns and refunds permission is required in this business.')
    const fingerprint = createHash('sha256').update(JSON.stringify(d)).digest('hex')
    const resultRef = d.action === 'refund' ? db.doc(`${base}/sales/${d.requestId}`) : null
    const [source, stateDoc, prior] = await Promise.all([
      tx.get(sourceRef),
      tx.get(stateRef),
      resultRef ? tx.get(resultRef) : null,
    ])
    if (prior?.exists) {
      if (prior.data().fingerprint !== fingerprint || prior.data().cashierUid !== uid)
        fail('already-exists', 'This refund request already contains different details.')
      return { saleId: d.requestId }
    }
    const s = source.data(),
      state = stateDoc.data() ?? {}
    if (
      !s ||
      s.business !== d.business ||
      s.schemaVersion !== 1 ||
      s.status !== 'completed' ||
      s.kind === 'refund' ||
      s.lines.some((l) => l.payout) ||
      s.totalCents < 0
    )
      fail(
        'failed-precondition',
        'Choose an original sales receipt. Payout orders cannot be returned.',
      )
    const returned = s.lines.map((_, i) => state.returnedQuantities?.[i] ?? 0)
    const paid = Object.fromEntries(
      refundMethods.map((m) => [
        m,
        s.payments
          .filter((p) => p.method === m)
          .reduce((sum, p) => sum + p.amountCents * (p.direction === 'out' ? -1 : 1), 0),
      ]),
    )
    const remaining = Object.fromEntries(
      refundMethods.map((m) => [m, paid[m] - (state.refundedByMethod?.[m] ?? 0)]),
    )
    if (Object.values(remaining).some((n) => !Number.isSafeInteger(n) || n < 0))
      fail('failed-precondition', 'The original payment ledger needs review.')
    if (d.action === 'quote') {
      const products = await Promise.all(
        s.lines.map((l) => tx.get(db.doc(`${base}/products/${l.productId}`))),
      )
      return {
        revision: state.revision ?? 0,
        returnedQuantities: returned,
        remainingByMethod: remaining,
        restockable: s.lines.map(
          (l, i) =>
            !l.membership &&
            !l.rental &&
            !l.payout &&
            Number.isSafeInteger(products[i].data()?.inventory) &&
            products[i].data().inventory >= 0,
        ),
      }
    }
    if ((state.revision ?? 0) !== d.expectedRevision)
      fail(
        'failed-precondition',
        'This receipt has another return. Reload and review the remaining quantities.',
      )
    const registerRef = db.doc(`${base}/registers/${d.registerId}`),
      totalsRef = db.doc(`${base}/registerTotals/${d.registerId}`)
    const [register, claim, totalsDoc] = await Promise.all([
      tx.get(registerRef),
      tx.get(db.doc(`${base}/registerOwners/${uid}`)),
      tx.get(totalsRef),
    ])
    if (
      !register.exists ||
      register.data().status !== 'open' ||
      register.data().ownerUid !== uid ||
      claim.data()?.registerId !== d.registerId
    )
      fail('failed-precondition', 'Open your own register before issuing a refund.')
    const writes = [],
      lines = [],
      cancellations = [],
      serviceMembers = new Map(),
      rentalIds = new Set()
    let subtotal = 0,
      discountReturned = 0,
      tax = 0
    for (const item of d.lines) {
      const original = s.lines[item.index]
      if (!original) fail('invalid-argument', 'Invalid receipt line.')
      let amount
      try {
        amount = refundLineAmounts(original, returned[item.index], item.quantity)
      } catch (e) {
        fail('failed-precondition', e.message)
      }
      const returnedDiscount = original.discountCents
        ? refundLineAmounts(
            { quantity: original.quantity, subtotalCents: original.discountCents, taxCents: 0 },
            returned[item.index],
            item.quantity,
          ).subtotalCents
        : 0
      discountReturned += returnedDiscount
      returned[item.index] += item.quantity
      subtotal += amount.subtotalCents
      tax += amount.taxCents
      lines.push({
        ...original,
        quantity: item.quantity,
        ...(s.discount
          ? {
              discountCents: -returnedDiscount,
              grossSubtotalCents: -amount.subtotalCents - returnedDiscount,
            }
          : {}),
        subtotalCents: -amount.subtotalCents,
        taxCents: -amount.taxCents,
        totalCents: -amount.totalCents,
        returnedFromIndex: item.index,
        restocked: item.restock,
        serviceCancelled: item.cancelService,
      })
      if (item.restock) {
        if (original.membership || original.rental || original.payout)
          fail('invalid-argument', 'Only retail products can be restocked.')
        const ref = db.doc(`${base}/products/${original.productId}`),
          product = (await tx.get(ref)).data()
        if (
          !product ||
          !Number.isSafeInteger(product.inventory) ||
          product.inventory < 0 ||
          !Number.isSafeInteger(product.version) ||
          product.version < 1 ||
          product.inventory + item.quantity > 999999999
        )
          fail(
            'failed-precondition',
            'This product is no longer available with tracked stock. Refund without restocking or review Products.',
          )
        writes.push(() =>
          tx.update(ref, {
            inventory: product.inventory + item.quantity,
            version: product.version + 1,
            updatedBy: uid,
            updatedAt: timestamp(),
          }),
        )
      }
      if (item.cancelService) {
        if (!original.membership && !original.rental)
          fail('invalid-argument', 'This product has no service to cancel.')
        if (returned[item.index] !== original.quantity)
          fail(
            'failed-precondition',
            'Return every remaining unit of this product to cancel its related services.',
          )
        for (const m of (s.memberships ?? []).filter((m) => m.productId === original.productId)) {
          const ref = db.doc(`members/${m.memberId}`),
            member = (await tx.get(ref)).data()
          if (
            !member ||
            member.access !== d.business ||
            !Number.isFinite(m.expiresAt) ||
            Number(member.id_expiration) !== m.expiresAt ||
            member.membershipOrderId !== d.saleId
          )
            fail(
              'failed-precondition',
              'A membership changed or lacks a reversible expiry snapshot. Refund without cancellation or review the member first.',
            )
          const previous = m.action === 'renewal' ? m.previousExpiresAt : Math.floor(now() / 1000)
          if (!Number.isFinite(previous))
            fail(
              'failed-precondition',
              'The previous membership expiry is unavailable. Refund without cancellation.',
            )
          const entry = serviceMembers.get(m.memberId) ?? { ref, member, updates: {} }
          entry.updates = {
            ...entry.updates,
            id_expiration: previous,
            ...(m.previousMembershipType ? { membership_type: m.previousMembershipType } : {}),
            membershipOrderId: `refund_${d.requestId}`,
          }
          serviceMembers.set(m.memberId, entry)
          cancellations.push({ type: 'membership', memberId: m.memberId })
        }
        for (const r of (s.rentals ?? []).filter((r) => r.productId === original.productId)) {
          const visitId = r.renewalVisitId ?? `${d.saleId}_${r.id ?? r.productId}`,
            ref = db.doc(`activity/${visitId}`),
            v = (await tx.get(ref)).data()
          if (!v || v.access !== d.business)
            fail('failed-precondition', 'A rental is unavailable. Refund without cancellation.')
          if (v.active === true) {
            if (
              (v.renewalOrderId && v.renewalOrderId !== d.saleId) ||
              (!r.renewalVisitId && v.orderId !== d.saleId) ||
              (r.renewalVisitId && v.renewalOrderId !== d.saleId)
            )
              fail(
                'failed-precondition',
                'A rental was renewed later. Refund without cancellation or review the visit first.',
              )
            const memberId = v.memberID,
              memberRef = db.doc(`members/${memberId}`),
              member = (await tx.get(memberRef)).data()
            if (!member || member.access !== d.business)
              fail('failed-precondition', 'The rental member is unavailable.')
            if (!serviceMembers.has(memberId))
              serviceMembers.set(memberId, { ref: memberRef, member, updates: {} })
            rentalIds.add(visitId)
            writes.push(() =>
              tx.update(ref, {
                active: false,
                currIn: false,
                waitlist: false,
                cancelledBy: uid,
                cancelledAt: timestamp(),
                refundId: d.requestId,
                itemsReturned: true,
                editRevision: (v.editRevision ?? 0) + 1,
              }),
            )
          }
          cancellations.push({ type: 'rental', visitId })
        }
        if (
          !(s.memberships ?? []).some((m) => m.productId === original.productId) &&
          !(s.rentals ?? []).some((r) => r.productId === original.productId)
        )
          fail(
            'failed-precondition',
            'This receipt has no linked service to cancel. Refund without cancellation.',
          )
      }
    }
    if (serviceMembers.size > 50) fail('invalid-argument', 'Too many service recipients.')
    for (const [memberId, entry] of serviceMembers) {
      const claimRef = db.doc(`${base}/memberVisits/${memberId}`),
        claimDoc = await tx.get(claimRef),
        visits = await tx.get(db.collection('activity').where('memberID', '==', memberId))
      const active = visits.docs.filter(
          (v) => v.data().access === d.business && v.data().active === true,
        ),
        remainingVisits = active.filter((v) => !rentalIds.has(v.id)).map((v) => v.id)
      if (
        'id_expiration' in entry.updates &&
        (remainingVisits.length || (entry.member.checkedIn === true && !active.length))
      )
        fail(
          'failed-precondition',
          'Check out this member or cancel all active rentals before undoing their membership.',
        )
      const hasCancelledVisit = active.some((v) => rentalIds.has(v.id))
      if (hasCancelledVisit) {
        const admission = claimDoc.data()
        if (
          admission &&
          (admission.memberId !== memberId ||
            !Array.isArray(admission.visitIds) ||
            active.some((v) => !admission.visitIds.includes(v.id)))
        )
          fail(
            'failed-precondition',
            'The member admission claim needs review before cancellation.',
          )
        if (claimDoc.exists)
          writes.push(() =>
            remainingVisits.length
              ? tx.update(claimRef, { visitIds: remainingVisits })
              : tx.delete(claimRef),
          )
        if (!remainingVisits.length) entry.updates.checkedIn = false
      }
      if (Object.keys(entry.updates).length) writes.push(() => tx.update(entry.ref, entry.updates))
    }
    const total = subtotal + tax,
      paidOut = d.payments.reduce((sum, p) => sum + p.amountCents, 0)
    if (!Number.isSafeInteger(total) || total < 0 || total > 999999999 || paidOut !== total)
      fail('invalid-argument', 'Refund payments must exactly match the selected return total.')
    for (const p of d.payments)
      if (p.amountCents > remaining[p.method])
        fail(
          'failed-precondition',
          'A refund exceeds the amount remaining on its original payment method.',
        )
    const previous = totalsDoc.data() ?? {},
      netByMethod = Object.fromEntries(
        refundMethods.map((m) => [m, previous.netByMethod?.[m] ?? 0]),
      )
    const refundedByMethod = { ...(state.refundedByMethod ?? {}) }
    for (const p of d.payments) {
      netByMethod[p.method] -= p.amountCents
      refundedByMethod[p.method] = (refundedByMethod[p.method] ?? 0) + p.amountCents
    }
    const expectedCashCents =
      register.data().openingTotalCents + netByMethod.cash - (previous.cashDropCents ?? 0)
    if (expectedCashCents < 0)
      fail(
        'failed-precondition',
        'The register does not have enough recorded cash for this refund.',
      )
    const cash = d.payments.find((p) => p.method === 'cash')?.amountCents ?? 0
    const receipt = {
      ...s,
      kind: 'refund',
      ...(s.discount ? { discountCents: -discountReturned } : {}),
      originalSaleId: d.saleId,
      originalReceiptNumber: s.receiptNumber,
      reason: d.reason.trim(),
      receiptNumber: d.requestId,
      registerId: d.registerId,
      cashierUid: uid,
      cashierName: profile.data().displayName || uid,
      note: d.reason.trim(),
      memberships: [],
      rentals: [],
      lines,
      payments: d.payments.map((p) => ({
        ...p,
        direction: 'out',
        receivedCents: p.amountCents,
        changeCents: 0,
      })),
      subtotalCents: -subtotal,
      taxCents: -tax,
      totalCents: -total,
      createdAt: timestamp(),
      fingerprint,
      cancellations,
    }
    for (const write of writes) write()
    tx.create(resultRef, receipt)
    tx.set(stateRef, {
      schemaVersion: 1,
      revision: (state.revision ?? 0) + 1,
      returnedQuantities: returned,
      refundedByMethod,
      updatedAt: timestamp(),
      updatedBy: uid,
    })
    tx.set(totalsRef, {
      ...previous,
      schemaVersion: 1,
      registerId: d.registerId,
      saleCount: previous.saleCount ?? 0,
      refundCount: (previous.refundCount ?? 0) + 1,
      discountCents: (previous.discountCents ?? 0) - discountReturned,
      refundCents: (previous.refundCents ?? 0) + total,
      refundTaxCents: (previous.refundTaxCents ?? 0) + tax,
      totalCents: (previous.totalCents ?? 0) - total,
      taxCents: (previous.taxCents ?? 0) - tax,
      netByMethod,
      expectedCashCents,
      cashDropCents: previous.cashDropCents ?? 0,
      cashReceivedCents: previous.cashReceivedCents ?? 0,
      changeGivenCents: previous.changeGivenCents ?? 0,
      cashPaidOutCents: (previous.cashPaidOutCents ?? 0) + cash,
      updatedAt: timestamp(),
    })
    return { saleId: d.requestId }
  })
}
