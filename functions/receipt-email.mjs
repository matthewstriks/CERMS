import { receiptText, displayReference, validReceiptEmail } from './receipt-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k))
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

// Delivery has its own audit; it never repeats checkout or changes the customer email.
export async function sendSaleReceipt(request, { db, send, timestamp, fail }) {
  const d = request.data,
    uid = request.auth?.uid
  if (!uid) fail('unauthenticated', 'Sign in before emailing a receipt.')
  if (
    !exact(
      d,
      d?.action === 'recipient'
        ? ['action', 'business', 'saleId']
        : ['action', 'business', 'saleId', 'requestId', 'email', 'timeZone'],
    ) ||
    !['recipient', 'send'].includes(d.action) ||
    !id(d.business) ||
    !uuid(d.saleId)
  )
    fail('invalid-argument', 'Invalid receipt request.')
  if (d.action === 'send') {
    if (
      !uuid(d.requestId) ||
      !validReceiptEmail(d.email) ||
      d.email !== d.email.trim() ||
      typeof d.timeZone !== 'string' ||
      d.timeZone.length > 80
    )
      fail('invalid-argument', 'Enter one valid customer email address.')
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: d.timeZone })
    } catch {
      fail('invalid-argument', 'Invalid receipt time zone.')
    }
  }
  const path = `system/${d.business}`,
    saleRef = db.doc(`${path}/sales/${d.saleId}`)
  const auditRef = db.doc(`${path}/sales/${d.saleId}/receiptDelivery/email`)
  const result = await db.runTransaction(async (tx) => {
    const [profile, system, permissions, saved, audit] = await Promise.all([
      tx.get(db.doc('users/' + uid)),
      tx.get(db.doc(path)),
      tx.get(db.doc(`${path}/staffPermissions/${uid}`)),
      tx.get(saleRef),
      tx.get(auditRef),
    ])
    if (
      !profile.exists ||
      profile.data().uid !== uid ||
      profile.data().access !== d.business ||
      !system.exists ||
      (uid !== owner && permissions.data()?.permissions?.processSales !== true)
    )
      fail('permission-denied', 'Point of sale permission is required in this business.')
    const sale = saved.data()
    if (
      !saved.exists ||
      sale.business !== d.business ||
      sale.status !== 'completed' ||
      sale.schemaVersion !== 1
    )
      fail('not-found', 'This completed order is unavailable.')
    const primary = sale.member?.id
    const member = id(primary) ? (await tx.get(db.doc('members/' + primary))).data() : null
    const address =
      member?.access === d.business &&
      typeof member.email === 'string' &&
      member.email.trim() &&
      member.email.length <= 320 &&
      !/[\r\n]/.test(member.email)
        ? member.email.trim()
        : null
    if (d.action === 'recipient') return { email: address }
    if (!address)
      fail(
        'failed-precondition',
        'The linked customer no longer has an email on file. Print the receipt instead.',
      )
    const previous = audit.data()
    if (previous) {
      if (previous.email.toLowerCase() !== d.email.toLowerCase())
        fail(
          'already-exists',
          'Email delivery was already requested for this order. The customer address cannot be changed after submission.',
        )
      if (previous.state === 'sent') return { sent: true }
      fail(
        'failed-precondition',
        'Email delivery is awaiting review. Do not send again; you can still print this saved receipt.',
      )
    }
    const createdAt = sale.createdAt?.toMillis?.() ?? sale.createdAt?.getTime?.()
    if (!Number.isFinite(createdAt))
      fail('failed-precondition', 'The saved receipt time is unavailable.')
    const text = receiptText({ ...sale, id: d.saleId, createdAt }, d.timeZone)
    const subject = `${String(sale.receiptName || 'CERMS 5')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 150)} receipt ${displayReference('order', sale.receiptNumber)}`
    tx.create(auditRef, {
      schemaVersion: 1,
      state: 'sending',
      email: d.email,
      timeZone: d.timeZone,
      requestId: d.requestId,
      actorUid: uid,
      actorName: profile.data().displayName || uid,
      requestedAt: timestamp(),
      updatedAt: timestamp(),
    })
    return { text, subject }
  })
  if (d.action === 'recipient') return result
  if (result.sent) return { status: 'sent' }
  try {
    const accepted = await send({
      from: { name: 'CERMS 5 Receipts', address: 'system@rocmtssolutions.com' },
      to: [d.email],
      replyTo: 'support@rocmtssolutions.com',
      subject: result.subject,
      messageId: `<cerms5-receipt-${d.business}-${d.saleId}@rocmtssolutions.com>`,
      text: result.text,
      html: `<!doctype html><html><body><pre style="white-space:pre-wrap;font-family:monospace">${escape(result.text)}</pre></body></html>`,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    if (
      !accepted.accepted?.some(
        (v) => (typeof v === 'string' ? v : v.address)?.toLowerCase() === d.email.toLowerCase(),
      )
    )
      throw Error('Delivery not confirmed')
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(auditRef)).data()
      if (current?.requestId !== d.requestId || current.state !== 'sending')
        throw Error('Delivery claim changed')
      tx.update(auditRef, { state: 'sent', sentAt: timestamp(), updatedAt: timestamp() })
    })
    return { status: 'sent' }
  } catch {
    await db
      .runTransaction(async (tx) => {
        const current = (await tx.get(auditRef)).data()
        if (current?.requestId === d.requestId && current.state === 'sending')
          tx.update(auditRef, { state: 'uncertain', updatedAt: timestamp() })
      })
      .catch(() => {})
    fail(
      'failed-precondition',
      'Email delivery could not be confirmed. Do not send again; you can still print the saved receipt.',
    )
  }
}
