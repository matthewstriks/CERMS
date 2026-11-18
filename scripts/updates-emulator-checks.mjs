import { discountCodes } from '../functions/discounts.mjs'
import { refundSale } from '../functions/refunds.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cashDrop, completeSale } from '../functions/pos.mjs'
import { submitBugReport } from '../functions/bug-report.mjs'
import { sendSaleReceipt } from '../functions/receipt-email.mjs'
import { posFixture, owner, business, registerId } from './fixtures/pos-server.mjs'
export async function updatesEmulatorChecks({ project, port }) {
  assert.equal(project, 'demo-cerms-rules')
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536)
  const require = createRequire(new URL('../functions/package.json', import.meta.url))
  const { initializeApp, deleteApp } = require('firebase-admin/app')
  const { getFirestore, FieldValue } = require('firebase-admin/firestore')
  const previous = process.env.FIRESTORE_EMULATOR_HOST
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${port}`
  const app = initializeApp({ projectId: project }, 'synthetic-updates')
  const db = getFirestore(app, 'cerms')
  try {
    const f = posFixture()
    for (const [path, data] of f.docs) await db.doc(path).set(data)
    const deps = { ...f.deps, db, timestamp: () => FieldValue.serverTimestamp() }
    const drops = await Promise.allSettled(
      [0, 1].map((i) =>
        cashDrop(
          {
            auth: { uid: owner },
            data: {
              business,
              registerId,
              amountCents: 6000,
              note: 'Synthetic concurrent drop',
              requestId: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            },
          },
          deps,
        ),
      ),
    )
    assert.equal(drops.filter((r) => r.status === 'fulfilled').length, 1)
    let totals = (await db.doc(`system/${business}/registerTotals/${registerId}`).get()).data()
    assert.equal(totals.cashDropCents, 6000)
    assert.equal(totals.expectedCashCents, 4000)
    await Promise.all([completeSale(f.request, deps), completeSale(f.request, deps)])
    totals = (await db.doc(`system/${business}/registerTotals/${registerId}`).get()).data()
    assert.equal(totals.saleCount, 1)
    assert.equal(totals.cashDropCents, 6000)
    assert.equal(totals.expectedCashCents, 5000)
    const waived = structuredClone(f.request)
    waived.data.requestId = '40000000-0000-4000-8000-000000000001'
    waived.data.lines[0].waived = true
    waived.data.lines[0].version = 2
    waived.data.payments = []
    await completeSale(waived, deps)
    totals = (await db.doc(`system/${business}/registerTotals/${registerId}`).get()).data()
    assert.equal(totals.saleCount, 2)
    assert.equal(totals.expectedCashCents, 5000)
    assert.equal(
      (await db.doc(`system/${business}/sales/${waived.data.requestId}`).get()).data().totalCents,
      0,
    )
    let sent = 0
    const report = {
      auth: { uid: owner, token: { email: 'synthetic@example.test' } },
      data: {
        requestId: '50000000-0000-4000-8000-000000000001',
        subject: 'Synthetic concurrent report',
        priority: 'normal',
        message: 'Synthetic',
        context: {
          uid: owner,
          email: 'untrusted@example.test',
          business,
          version: 'test',
          platform: 'test',
          electron: 'test',
          logs: [],
        },
        screenshots: [],
        files: [],
      },
    }
    const supportDeps = {
      ...deps,
      bucket: {
        file: () => {
          throw Error('No artifacts expected')
        },
      },
      send: async () => {
        sent++
        return { accepted: ['matthew@rocmtssolutions.com'] }
      },
    }
    const submissions = await Promise.allSettled(
      Array.from({ length: 4 }, () => submitBugReport(report, supportDeps)),
    )
    assert.ok(submissions.some((r) => r.status === 'fulfilled'))
    assert.equal(sent, 1)
    await submitBugReport(report, supportDeps)
    assert.equal(sent, 1)
    const audit = (
      await db.doc(`system/${business}/bugReports/${owner}-${report.data.requestId}`).get()
    ).data()
    assert.equal(audit.state, 'sent')
    assert.ok(audit.sentAt.toMillis())
    await db
      .doc('members/receipt-customer')
      .set({ access: business, email: 'synthetic@example.test' })
    await db
      .doc(`system/${business}/sales/${f.request.data.requestId}`)
      .update({ member: { id: 'receipt-customer', name: 'Synthetic customer' } })
    const emailRequest = {
      auth: { uid: owner },
      data: {
        action: 'send',
        business,
        saleId: f.request.data.requestId,
        requestId: '60000000-0000-4000-8000-000000000001',
        email: 'edited@example.test',
        timeZone: 'America/New_York',
      },
    }
    let receiptSends = 0
    const receiptDeps = {
      ...deps,
      send: async () => {
        receiptSends++
        return { accepted: ['edited@example.test'] }
      },
    }
    await Promise.allSettled(
      Array.from({ length: 4 }, () => sendSaleReceipt(emailRequest, receiptDeps)),
    )
    await sendSaleReceipt(emailRequest, receiptDeps)
    assert.equal(receiptSends, 1)
    assert.equal(
      (
        await db
          .doc(`system/${business}/sales/${f.request.data.requestId}/receiptDelivery/email`)
          .get()
      ).data().state,
      'sent',
    )
    assert.equal(
      (await db.doc('members/receipt-customer').get()).data().email,
      'synthetic@example.test',
    )
    const refund = {
      auth: { uid: owner },
      data: {
        action: 'refund',
        business,
        saleId: f.request.data.requestId,
        registerId,
        requestId: '70000000-0000-4000-8000-000000000001',
        expectedRevision: 0,
        reason: 'Synthetic concurrent full return',
        confirmed: true,
        lines: [{ index: 0, quantity: 2, restock: true, cancelService: false }],
        payments: [
          { method: 'cash', amountCents: 1000, reference: '' },
          { method: 'card', amountCents: 1160, reference: '' },
        ],
      },
    }
    await Promise.all([refundSale(refund, deps), refundSale(refund, deps)])
    const refundState = (
      await db.doc(`system/${business}/saleRefunds/${f.request.data.requestId}`).get()
    ).data()
    assert.equal(refundState.revision, 1)
    assert.deepEqual(refundState.returnedQuantities, [2])
    const afterRefund = (
      await db.doc(`system/${business}/registerTotals/${registerId}`).get()
    ).data()
    assert.equal(afterRefund.refundCount, 1)
    assert.equal(afterRefund.refundCents, 2160)
    const other = structuredClone(refund)
    other.data.requestId = '70000000-0000-4000-8000-000000000002'
    await assert.rejects(refundSale(other, deps), { code: 'failed-precondition' })
    console.log(
      'Refund emulator passed concurrent identical retries and original-receipt over-refund protection; no production writes.',
    )
    const limitedRule = {
      code: 'LIMITED',
      name: 'One use only',
      description: 'Synthetic discount',
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
      maxUses: 1,
      maxUsesPerMember: null,
    }
    await discountCodes(
      {
        auth: { uid: owner },
        data: { action: 'save', business, rule: limitedRule, expectedVersion: 0 },
      },
      deps,
    )
    const productRef = db.doc(`system/${business}/products/retail`)
    await productRef.update({ inventory: null })
    const product = (await productRef.get()).data()
    const discounted = structuredClone(f.request)
    delete discounted.data.member
    discounted.data.lines = [
      { productId: 'retail', version: product.version, quantity: 1, unitPriceCents: 1000 },
    ]
    discounted.data.discount = { code: 'LIMITED', version: 1, expectedDiscountCents: 100 }
    discounted.data.payments = [
      { method: 'cash', amountCents: 972, receivedCents: 972, reference: '' },
    ]
    const attempts = [1, 2].map((i) => {
      const r = structuredClone(discounted)
      r.data.requestId = `80000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      return r
    })
    const discountResults = await Promise.allSettled(attempts.map((r) => completeSale(r, deps)))
    assert.equal(discountResults.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(
      (await db.doc(`system/${business}/discountCodes/LIMITED`).get()).data().usedCount,
      1,
    )
    const winner = attempts[discountResults.findIndex((r) => r.status === 'fulfilled')]
    await completeSale(winner, deps)
    assert.equal(
      (await db.doc(`system/${business}/discountCodes/LIMITED`).get()).data().usedCount,
      1,
    )
    console.log(
      'Discount emulator passed concurrent global-use limit and same-order retry without double redemption.',
    )
    console.log(
      'Receipt email emulator passed concurrent sends, confirmed-address override without member changes, real timestamps and duplicate suppression; SMTP mocked.',
    )
    console.log(
      'Updates emulator passed concurrent cash-drop overdraft protection, sale retries after drops, zero-price waiver fulfillment and concurrent bug-report/email deduplication. No real SMTP or Storage requests.',
    )
  } finally {
    await deleteApp(app)
    if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST
    else process.env.FIRESTORE_EMULATOR_HOST = previous
  }
}
