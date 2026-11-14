import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { reportConfig as config } from './config.mjs'
import { reportWindow, readReportData, summarize } from './report-data.mjs'
import { renderEmail, renderWorkbook } from './report-render.mjs'

export async function deliverDailyReport(
  event,
  { db, send, timestamp, now = () => Date.now(), read = readReportData, workbook = renderWorkbook },
) {
  assert.equal(db.databaseId, 'cerms', 'Never send reports from the legacy database')
  const window = reportWindow(event.scheduleTime)
  // A forced Cloud Scheduler run can carry its *next* scheduled timestamp.
  // Keep these previews separate so they cannot suppress the full morning report.
  const testDelivery = new Date(event.scheduleTime).getTime() > now() + 5 * 60_000
  const ref = db.doc(`system/dev/dailyReports/${testDelivery ? 'test-' : ''}${window.date}`)
  const runId = randomUUID()
  const claimed = await db.runTransaction(async (tx) => {
    const previous = (await tx.get(ref)).data()
    const previouslySentAt = previous?.sentAt?.toMillis?.()
    // Preserve the first explicitly requested test, sent before forced-run
    // bookkeeping was introduced, without suppressing its next scheduled day.
    const priorForcedPreview =
      !testDelivery &&
      previous?.state === 'sent' &&
      (previous.deliveryKind === 'test' ||
        (previous.deliveryKind === undefined &&
          Number.isFinite(previouslySentAt) &&
          new Date(previous.scheduledAt).getTime() > previouslySentAt + 5 * 60_000))
    if (previous?.state === 'sent' && !priorForcedPreview) return 'sent'
    // SMTP cannot promise exactly-once delivery. Never automatically resend an
    // attempt that might have been accepted before the process lost its response.
    if (['sending', 'uncertain'].includes(previous?.state)) return 'needs-review'
    if (previous?.state === 'preparing' && previous.leaseUntil.toMillis() > now())
      return 'in-progress'
    tx.set(
      ref,
      {
        state: 'preparing',
        deliveryKind: testDelivery ? 'test' : 'scheduled',
        ...(priorForcedPreview
          ? {
              priorTestDelivery: {
                sentAt: previous.sentAt,
                scheduledAt: previous.scheduledAt,
                messageId: previous.messageId,
                attachmentSha256: previous.attachmentSha256,
              },
            }
          : {}),
        runId,
        business: 'dev',
        reportDate: window.date,
        recipient: config.recipient,
        scheduledAt: event.scheduleTime,
        updatedAt: timestamp(),
        periodStart: window.start,
        periodEnd: window.end,
        leaseUntil: new Date(now() + 15 * 60_000),
        attempt: (previous?.attempt ?? 0) + 1,
      },
      { merge: true },
    )
    return 'claimed'
  })
  if (claimed !== 'claimed') return { state: claimed, date: window.date }
  let sending = false
  try {
    const data = await read(db, window)
    data.testDelivery = testDelivery
    const summary = summarize(data)
    const attachment = await workbook(data, summary)
    assert.ok(
      attachment.length <= 20 * 1024 * 1024,
      'Workbook exceeds safe email size; no partial report was sent',
    )
    const { html, text } = renderEmail(data, summary)
    const messageId = `<cerms5-dev-${testDelivery ? 'test' : 'scheduled'}-${window.date}@rocmtssolutions.com>`
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data()
      assert.ok(current?.runId === runId && current.state === 'preparing', 'Report claim changed')
      tx.update(ref, {
        state: 'sending',
        updatedAt: timestamp(),
        messageId,
        attachmentSha256: createHash('sha256').update(attachment).digest('hex'),
        orderCount: data.sales.length,
        closedRegisterCount: data.registers.length,
        totalCents: summary.total,
      })
    })
    sending = true
    const result = await send({
      from: { name: 'CERMS 5 Reports', address: config.from },
      to: [config.recipient],
      replyTo: config.replyTo,
      subject: `${testDelivery ? '[TEST] ' : ''}CERMS 5 · Dev System daily report · ${window.date}`,
      messageId,
      html,
      text,
      attachments: [
        {
          filename: `${window.date}_CERMS5_Dev_Daily_Report.xlsx`,
          content: attachment,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    assert.ok(
      result.accepted?.some(
        (value) =>
          (typeof value === 'string' ? value : value.address)?.toLowerCase() ===
          config.recipient.toLowerCase(),
      ),
      'Recipient was not confirmed accepted',
    )
    await ref.update({ state: 'sent', sentAt: timestamp(), updatedAt: timestamp() })
    return {
      state: 'sent',
      date: window.date,
      orders: data.sales.length,
      registers: data.registers.length,
    }
  } catch {
    await db
      .runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data()
        if (current?.runId === runId && current.state !== 'sent')
          tx.update(ref, {
            state: sending ? 'uncertain' : 'failed',
            updatedAt: timestamp(),
            error: sending
              ? 'SMTP delivery or final confirmation was not confirmed. Review before resending.'
              : 'Report preparation failed before email submission; retry is safe.',
          })
      })
      .catch(() => {})
    // Do not leak SMTP credentials, customer data or workbook contents into logs.
    throw new Error(
      sending
        ? 'Dev report delivery requires review; automatic resend is suppressed.'
        : 'Dev report preparation failed; no email was submitted.',
    )
  }
}
