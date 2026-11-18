import { createHash, randomUUID } from 'node:crypto'
import { inventoryRecipients, validInventoryEmailData } from './inventory-email-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const hash = (v) => createHash('sha256').update(v).digest('hex')
const stamp = (t) =>
  t
    ? `${String(t.seconds ?? t._seconds ?? 0).padStart(12, '0')}.${String(t.nanoseconds ?? t._nanoseconds ?? 0).padStart(9, '0')}`
    : ''
const max = (...keys) => keys.filter(Boolean).sort().at(-1) || ''
export function lowInventory(p) {
  return (
    !!p &&
    p.active === true &&
    p.payout !== true &&
    Number.isSafeInteger(p.inventory) &&
    p.inventory >= 0 &&
    Number.isSafeInteger(p.invWarning) &&
    p.invWarning >= 0 &&
    p.inventory <= p.invWarning
  )
}
function validConfig(d) {
  try {
    return (
      !!d &&
      typeof d.enabled === 'boolean' &&
      Number.isSafeInteger(d.revision) &&
      d.revision > 0 &&
      typeof d.epoch === 'string' &&
      /^[a-f0-9-]{36}$/.test(d.epoch) &&
      Array.isArray(d.recipients) &&
      inventoryRecipients(d.recipients).length === d.recipients.length &&
      (!d.enabled || d.recipients.length > 0)
    )
  } catch {
    return false
  }
}
const view = (d) => ({
  enabled: d?.enabled ?? false,
  recipients: d?.recipients ?? [],
  revision: d?.revision ?? 0,
})
export async function inventoryEmailSettings(request, { db, fail, timestamp }) {
  const d = request.data
  if (!validInventoryEmailData(d)) fail('invalid-argument', 'Check inventory email settings.')
  if (request.auth?.uid !== owner)
    fail('permission-denied', 'Only the owner can configure inventory emails.')
  const ref = db.doc(`system/${d.business}/inventoryEmailSettings/config`)
  return db.runTransaction(async (tx) => {
    const [profile, system, saved] = await Promise.all([
      tx.get(db.doc(`users/${owner}`)),
      tx.get(db.doc(`system/${d.business}`)),
      tx.get(ref),
    ])
    if (!profile.exists || profile.data().access !== d.business || !system.exists)
      fail('permission-denied', 'Business access changed. Reopen Settings.')
    const current = saved.data()
    if (current && !validConfig(current))
      fail('failed-precondition', 'Inventory email settings need review.')
    if (d.action === 'get') return view(current)
    if ((current?.revision ?? 0) !== d.expectedRevision)
      fail('failed-precondition', 'Settings changed. Reload before saving.')
    if (
      current &&
      current.enabled === d.enabled &&
      JSON.stringify(current.recipients) === JSON.stringify(d.recipients)
    )
      return view(current)
    const next = {
      enabled: d.enabled,
      recipients: d.recipients,
      revision: (current?.revision ?? 0) + 1,
      epoch: current?.enabled && d.enabled ? current.epoch : randomUUID(),
      updatedBy: owner,
      updatedAt: timestamp(),
    }
    tx.set(ref, next)
    return view(next)
  })
}
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
export async function notifyInventory(
  { business, productId, before, after },
  { db, send, timestamp },
) {
  if (!id(business) || !id(productId)) throw Error('Invalid inventory scope')
  const path = `system/${business}`,
    stateRef = db.doc(`${path}/inventoryEmailState/${productId}`)
  const plan = await db.runTransaction(async (tx) => {
    const [product, settings, state, system] = await Promise.all([
      tx.get(db.doc(`${path}/products/${productId}`)),
      tx.get(db.doc(`${path}/inventoryEmailSettings/config`)),
      tx.get(stateRef),
      tx.get(db.doc(path)),
    ])
    const p = product.data(),
      config = settings.data(),
      prior = state.data() ?? {}
    // High-stock/inactive/untracked snapshots rearm alerts even if event delivery is out of order.
    const healthy = max(
      prior.lastHealthyVersion,
      stamp(product.createTime),
      before?.exists && !lowInventory(before.data()) ? stamp(before.updateTime) : '',
      after?.exists && !lowInventory(after.data()) ? stamp(after.updateTime) : '',
      after?.exists === false && before?.exists ? stamp(before.updateTime) + 'd' : '',
      product.exists && !lowInventory(p) ? stamp(product.updateTime) : '',
    )
    if (
      !product.exists ||
      !lowInventory(p) ||
      !validConfig(config) ||
      !config.enabled ||
      !system.exists
    ) {
      if (state.exists && healthy !== prior.lastHealthyVersion)
        tx.set(stateRef, { ...prior, lastHealthyVersion: healthy, updatedAt: timestamp() })
      return null
    }
    const version = stamp(product.updateTime)
    const already =
      prior.epoch === config.epoch && prior.lastAlertVersion && prior.lastAlertVersion >= healthy
    if (already) {
      if (healthy !== prior.lastHealthyVersion)
        tx.set(stateRef, { ...prior, lastHealthyVersion: healthy, updatedAt: timestamp() })
      return prior.alertId ? { alertId: prior.alertId, existing: true } : null
    }
    const alertId = hash(`${business}/${productId}/${config.epoch}/${healthy}`)
    const alert = {
      productId,
      name: typeof p.name === 'string' ? p.name : 'Product',
      business,
      businessName: system.data().businessName || business,
      inventory: p.inventory,
      threshold: p.invWarning,
      par: p.inventoryPar ?? null,
      recipients: config.recipients,
      state: 'pending',
      createdAt: timestamp(),
    }
    tx.set(db.doc(`${path}/inventoryAlerts/${alertId}`), alert)
    tx.set(stateRef, {
      epoch: config.epoch,
      lastHealthyVersion: healthy,
      lastAlertVersion: version,
      alertId,
      updatedAt: timestamp(),
    })
    return { alertId, existing: false }
  })
  if (!plan) return
  const alertRef = db.doc(`${path}/inventoryAlerts/${plan.alertId}`)
  const alert = (await alertRef.get()).data()
  if (!alert || alert.state === 'sent' || alert.state === 'review') return
  for (const recipient of alert.recipients) {
    const delivery = db.doc(`${path}/inventoryAlerts/${plan.alertId}/deliveries/${hash(recipient)}`)
    const claim = await db.runTransaction(async (tx) => {
      const prior = await tx.get(delivery)
      if (prior.exists) return prior.data().state === 'sent' ? 'sent' : 'review'
      tx.set(delivery, {
        recipient,
        state: 'sending',
        createdAt: timestamp(),
        updatedAt: timestamp(),
      })
      return 'send'
    })
    if (claim !== 'send') {
      continue
    }
    const rows = [
      ['Business', alert.businessName],
      ['Product', alert.name],
      ['Product ID', alert.productId],
      ['Stock remaining', alert.inventory],
      ['Warning threshold', alert.threshold],
      ['Inventory par', alert.par ?? 'Not configured'],
    ]
    const text = `Low inventory alert\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nStock is at or below its warning threshold. Review Products and replenish inventory. This is a stock snapshot when the alert was queued; later sales/restocking may change it. Another alert is sent only after stock recovers and becomes low again, or alerts are re-enabled.`
    try {
      const result = await send({
        from: { name: 'CERMS 5 Inventory', address: 'system@rocmtssolutions.com' },
        to: [recipient],
        replyTo: 'support@rocmtssolutions.com',
        subject: `Low inventory · ${alert.name}`.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 180),
        messageId: `<cerms5-inventory-${plan.alertId}-${hash(recipient)}@rocmtssolutions.com>`,
        text,
        html: `<!doctype html><html><body style="padding:24px;background:#f1f5f2;font-family:Arial,sans-serif;color:#20392c"><div style="max-width:660px;margin:auto;background:white;border:1px solid #dce7df"><h1 style="margin:0;padding:24px;background:#285b43;color:white;font-size:24px">Low inventory</h1><div style="padding:24px"><table>${rows.map(([k, v]) => `<tr><th align="left" style="padding:8px 20px 8px 0">${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table><p>Stock is at or below its warning threshold. Review Products and replenish inventory.</p><p style="font-size:12px;color:#607267">This is the stock snapshot when queued. Further sales while it stays low do not send repeated alerts.</p></div></div></body></html>`,
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      if (
        !result.accepted?.some(
          (v) => (typeof v === 'string' ? v : v.address)?.toLowerCase() === recipient,
        )
      )
        throw Error('Acceptance not confirmed')
      await db.runTransaction(async (tx) => {
        await tx.get(delivery)
        tx.update(delivery, { state: 'sent', sentAt: timestamp(), updatedAt: timestamp() })
      })
    } catch {
      await db
        .runTransaction(async (tx) => {
          await tx.get(delivery)
          tx.update(delivery, { state: 'uncertain', updatedAt: timestamp() })
        })
        .catch(() => {})
    }
  }
  await db.runTransaction(async (tx) => {
    await tx.get(alertRef)
    const deliveries = await Promise.all(
      alert.recipients.map((recipient) =>
        tx.get(db.doc(`${path}/inventoryAlerts/${plan.alertId}/deliveries/${hash(recipient)}`)),
      ),
    )
    const states = deliveries.map((d) => d.data()?.state)
    tx.update(alertRef, {
      state: states.every((v) => v === 'sent')
        ? 'sent'
        : states.some((v) => v === 'uncertain')
          ? 'review'
          : 'pending',
      updatedAt: timestamp(),
    })
  })
}
export async function inventorySettingsWritten(business, deps) {
  const config = (
    await deps.db.doc(`system/${business}/inventoryEmailSettings/config`).get()
  ).data()
  if (!validConfig(config) || !config.enabled) return
  let last
  do {
    let query = deps.db.collection(`system/${business}/products`).orderBy('__name__').limit(100)
    if (last) query = query.startAfter(last)
    const page = await query.get()
    for (const product of page.docs)
      if (lowInventory(product.data()))
        await notifyInventory({ business, productId: product.id }, deps)
    last = page.size === 100 ? page.docs.at(-1) : undefined
  } while (last)
}
