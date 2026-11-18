import { validDiscountData, priceDiscount } from './discount-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const view = (s) => {
  const d = s.data()
  return {
    rule: d.rule,
    version: d.version,
    usedCount: d.usedCount ?? 0,
    archived: d.archived === true,
  }
}
async function access(tx, db, business, uid, fail, manage) {
  if (!uid) fail('unauthenticated', 'Sign in to use discount codes.')
  const [profile, system, permissions] = await Promise.all([
    tx.get(db.doc('users/' + uid)),
    tx.get(db.doc('system/' + business)),
    tx.get(db.doc(`system/${business}/staffPermissions/${uid}`)),
  ])
  if (
    !profile.exists ||
    profile.data().uid !== uid ||
    profile.data().access !== business ||
    !system.exists ||
    (uid !== owner &&
      permissions.data()?.permissions?.[manage ? 'manageDiscountCodes' : 'processSales'] !== true)
  )
    fail(
      'permission-denied',
      manage
        ? 'Discount-code management permission is required.'
        : 'Point of sale permission is required.',
    )
  return { canWaive: uid === owner || permissions.data()?.permissions?.waiveProducts === true }
}
/** Reads/reserves usage in the checkout transaction; apply only after every read completes. */
export async function prepareDiscount(
  tx,
  { db, business, selection, lines, memberId, fail, now, timestamp },
) {
  const ref = db.doc(`system/${business}/discountCodes/${selection.code}`),
    snapshot = await tx.get(ref),
    record = snapshot.data()
  if (!record || record.archived === true)
    fail('failed-precondition', 'This discount code is unavailable.')
  if (selection.version !== undefined && record.version !== selection.version)
    fail('failed-precondition', 'This discount changed. Remove it and apply it again.')
  if (
    record.rule?.code !== selection.code ||
    !Number.isSafeInteger(record.version) ||
    !Number.isSafeInteger(record.usedCount ?? 0) ||
    (record.usedCount ?? 0) < 0
  )
    fail('failed-precondition', 'This discount needs review.')
  if (record.rule.maxUses !== null && (record.usedCount ?? 0) >= record.rule.maxUses)
    fail('failed-precondition', 'This discount has reached its use limit.')
  let memberRef = null,
    memberCount = 0
  if (record.rule.maxUsesPerMember !== null) {
    if (!memberId) fail('failed-precondition', 'Link an existing member to use this discount.')
    const member = await tx.get(db.doc(`members/${memberId}`))
    if (!member.exists || member.data().access !== business)
      fail('failed-precondition', 'Link an existing member in this business.')
    memberRef = db.doc(`system/${business}/discountCodes/${selection.code}/memberUses/${memberId}`)
    memberCount = (await tx.get(memberRef)).data()?.count ?? 0
    if (
      !Number.isSafeInteger(memberCount) ||
      memberCount < 0 ||
      memberCount >= record.rule.maxUsesPerMember
    )
      fail('failed-precondition', 'This member has reached the discount use limit.')
  }
  let pricing
  try {
    pricing = priceDiscount(record.rule, lines, now)
  } catch (e) {
    fail('failed-precondition', e.message)
  }
  if (
    selection.expectedDiscountCents !== undefined &&
    selection.expectedDiscountCents !== pricing.discountCents
  )
    fail('failed-precondition', 'The discount amount changed. Reapply the code and review payment.')
  return {
    quote: {
      code: selection.code,
      version: record.version,
      expectedDiscountCents: pricing.discountCents,
      name: record.rule.name,
      lineDiscounts: pricing.lineDiscounts,
    },
    snapshot: {
      code: selection.code,
      name: record.rule.name,
      kind: record.rule.kind,
      value: record.rule.value,
      version: record.version,
    },
    apply() {
      tx.update(ref, { usedCount: (record.usedCount ?? 0) + 1, lastUsedAt: timestamp() })
      if (memberRef) tx.set(memberRef, { memberId, count: memberCount + 1, updatedAt: timestamp() })
    },
  }
}
export async function discountCodes(request, { db, fail, timestamp, now = () => Date.now() }) {
  const d = request.data,
    uid = request.auth?.uid
  if (!validDiscountData(d)) fail('invalid-argument', 'Check the discount code settings.')
  const base = `system/${d.business}/discountCodes`
  if (d.action === 'list') {
    await db.runTransaction((tx) => access(tx, db, d.business, uid, fail, true))
    let query = db.collection(base).orderBy('__name__').limit(101)
    if (d.cursor) query = query.startAfter(d.cursor)
    const result = await query.get()
    await db.runTransaction((tx) => access(tx, db, d.business, uid, fail, true))
    const docs = result.docs.slice(0, 100)
    return { rows: docs.map(view), more: result.docs.length > 100, cursor: docs.at(-1)?.id ?? null }
  }
  return db.runTransaction(async (tx) => {
    const rights = await access(tx, db, d.business, uid, fail, d.action !== 'quote')
    if (d.action === 'quote') {
      const products = await Promise.all(
        d.lines.map((l) => tx.get(db.doc(`system/${d.business}/products/${l.productId}`))),
      )
      const lines = d.lines.map((l, i) => {
        const p = products[i].data()
        if (
          !p ||
          !p.active ||
          p.version !== l.version ||
          (p.restricted && !p.restrictedUsers?.includes(uid)) ||
          (!p.askforprice && p.priceCents !== l.unitPriceCents) ||
          (l.waived && !rights.canWaive)
        )
          fail('failed-precondition', 'A product changed or is unavailable. Refresh the catalog.')
        return {
          ...l,
          categoryId: p.cat ?? '',
          kind: p.membership ? 'membership' : p.rental ? 'rental' : 'retail',
          payout: p.payout === true,
        }
      })
      return (
        await prepareDiscount(tx, {
          db,
          business: d.business,
          selection: { code: d.code },
          lines,
          memberId: d.memberId,
          fail,
          now: now(),
          timestamp,
        })
      ).quote
    }
    const code = d.action === 'save' ? d.rule.code : d.code,
      ref = db.doc(`${base}/${code}`),
      current = await tx.get(ref),
      before = current.data()
    if ((before?.version ?? 0) !== d.expectedVersion)
      fail(
        'failed-precondition',
        'This code changed or already exists. Reload codes before saving.',
      )
    if (d.action === 'archive') {
      if (!before) fail('not-found', 'Discount code not found.')
      tx.update(ref, {
        archived: true,
        rule: { ...before.rule, active: false },
        version: before.version + 1,
        updatedBy: uid,
        updatedAt: timestamp(),
      })
      return { saved: true }
    }
    if (d.rule.maxUses !== null && d.rule.maxUses < (before?.usedCount ?? 0))
      fail('failed-precondition', 'The total-use limit cannot be below its existing use count.')
    const references = [
      ...d.rule.productIds.map((id) => `system/${d.business}/products/${id}`),
      ...d.rule.categoryIds.map((id) => `system/${d.business}/categories/${id}`),
    ]
    const targets = await Promise.all(references.map((path) => tx.get(db.doc(path))))
    if (targets.some((s) => !s.exists))
      fail('failed-precondition', 'A selected product or category is unavailable in this business.')
    tx.set(ref, {
      rule: { ...d.rule, name: d.rule.name.trim(), description: d.rule.description.trim() },
      version: (before?.version ?? 0) + 1,
      usedCount: before?.usedCount ?? 0,
      archived: false,
      createdBy: before?.createdBy ?? uid,
      createdAt: before?.createdAt ?? timestamp(),
      ...(before?.lastUsedAt ? { lastUsedAt: before.lastUsedAt } : {}),
      updatedBy: uid,
      updatedAt: timestamp(),
    })
    return { saved: true }
  })
}
