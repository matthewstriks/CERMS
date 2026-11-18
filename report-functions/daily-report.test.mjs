import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import nodemailer from 'nodemailer'
import { Timestamp } from 'firebase-admin/firestore'
import { reportWindow, summarize, readReportData } from './report-data.mjs'
import { renderWorkbook, renderEmail, registerRows } from './report-render.mjs'
import { deliverDailyReport } from './delivery.mjs'
import { fixtureData } from './fixtures.mjs'
import { reportConfig } from './config.mjs'

test('cash drops reconcile shift balances, export separately and preserve historical totals', async () => {
  const d = fixtureData()
  registerRows(d)
  const total = d.totals.get(d.registers[0].id)
  total.cashDropCents = 100
  total.expectedCashCents -= 100
  const { rows } = registerRows(d)
  assert.equal(rows[0][24], 1)
  assert.ok((await renderWorkbook(d)).length > 0)
  assert.ok(renderEmail(d).text.includes('Dev System'))
  total.cashDropCents = -1
  assert.throws(() => registerRows(d), /Invalid cash drop total/)
  total.cashDropCents = 0
  assert.throws(() => registerRows(d), /Register cash mismatch/)
})

test('previous Central calendar day uses exclusive midnight and follows 23/25-hour DST days and month rollover', () => {
  for (const [scheduled, date, hours] of [
    ['2026-03-09T12:00:00Z', '2026-03-08', 23],
    ['2026-11-02T13:00:00Z', '2026-11-01', 25],
    ['2026-01-01T13:00:00Z', '2025-12-31', 24],
    ['2026-11-14T13:00:00Z', '2026-11-13', 24],
  ]) {
    const w = reportWindow(scheduled)
    assert.equal(w.date, date)
    assert.equal((w.end - w.start) / 3600000, hours)
  }
  assert.throws(() => reportWindow('invalid'))
})

test('reconciles split payments, actual quantities, category aliases and immutable product names', () => {
  const d = fixtureData(),
    s = summarize(d)
  assert.equal(s.total, 2160)
  assert.equal(s.tax, 160)
  assert.equal(s.payments.cash, 1000)
  assert.equal(s.payments.card, 1160)
  assert.equal(s.cashReceived, 2000)
  assert.equal(s.changeGiven, 1000)
  assert.equal(s.products[0].sold, 2)
  assert.equal(s.products[0].name, '=Synthetic snack <item>')
  assert.equal(s.legacyCategoryTotals.Snacks, 2)
  assert.equal(s.rentalRows[0][7], 'Room 7')
  assert.equal(s.rentalRows[0][5], 'Synthetic Member')
  assert.equal(s.membershipRows[0][5], 123456789)
  const rows = registerRows(d).rows
  assert.equal(rows[0][9], 2) // full-shift $2 over; the daily sale total is separate
  assert.equal(rows[0][11], 50) // previous-day shift activity is retained
})

test('reports waived products separately from collected sales', () => {
  const d = fixtureData()
  d.sales[0].lines[0].waived = true
  d.sales[0].lines[0].subtotalCents = 0
  d.sales[0].lines[0].taxCents = 0
  d.sales[0].lines[0].totalCents = 0
  d.sales[0].subtotalCents = 0
  d.sales[0].taxCents = 0
  d.sales[0].totalCents = 0
  d.sales[0].payments = []
  const summary = summarize(d)
  assert.equal(summary.total, 0)
  assert.equal(summary.waivedUnits, 2)
  assert.equal(summary.waivedTotal, 2000)
  assert.equal(summary.products[0].waivedValue, 2000)
  assert.equal(summary.orderItems[0][12], 'Yes')
  assert.equal(summary.orderItems[0][13], 20)
})

test('payouts stay signed; missing/deleted categories and zero-activity days are explicit', () => {
  const d = fixtureData(),
    payout = structuredClone(d.sales[0])
  payout.id = 'payout'
  payout.subtotalCents = -500
  payout.taxCents = 0
  payout.totalCents = -500
  payout.lines = [
    {
      productId: 'payout-product',
      name: 'Payout',
      quantity: 1,
      unitPriceCents: 500,
      subtotalCents: -500,
      taxCents: 0,
      totalCents: -500,
      payout: true,
    },
  ]
  payout.payments = [
    { method: 'cash', direction: 'out', amountCents: 500, receivedCents: 500, changeCents: 0 },
  ]
  payout.createdAt = d.sales[0].createdAt
  d.sales.push(payout)
  const s = summarize(d)
  assert.equal(s.total, 1660)
  assert.equal(s.cashPaidOut, 500)
  assert.equal(s.payments.cash, 500)
  assert.ok(s.categories.some((c) => c.name === 'Uncategorized'))
  assert.equal(s.notes.length, 1)
  d.sales = []
  d.registers = []
  assert.equal(summarize(d).total, 0)
  assert.match(renderEmail(d).text, /Completed orders: 0/)
})

test('rejects foreign-business, out-of-period and inconsistent receipts rather than emailing partial totals', () => {
  for (const mutate of [
    (s) => (s.business = 'TheZSATX'),
    (s) => s.totalCents++,
    (s) => s.payments[0].amountCents++,
    (s) => (s.createdAt = Timestamp.fromDate(new Date('2026-11-14T06:00:00Z'))),
  ]) {
    const d = fixtureData()
    mutate(d.sales[0])
    assert.throws(() => summarize(d))
  }
})

test('real workbook preserves legacy sections, adds typed money and denomination detail, and stores user text as strings', async () => {
  const data = fixtureData(),
    buffer = await renderWorkbook(data)
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer)
  for (const name of [
    'Summary',
    'Orders',
    'Product Sales',
    'Category Totals',
    'Legacy Category Groups',
    'Registers',
    'Register Counts',
    'Order Items',
    'Payments',
    'Rentals',
    'Memberships',
    'Cashiers',
    'Open Registers',
  ])
    assert.ok(book.getWorksheet(name), name)
  assert.ok(book.worksheets.some((s) => s.name.startsWith('Register 1 - ')))
  const orders = book.getWorksheet('Orders')
  assert.equal(orders.getCell('J5').value, 21.6)
  assert.match(orders.getCell('J5').numFmt, /\$/)
  assert.equal(orders.getCell('S5').value, '=Literal user note')
  assert.equal(orders.views[0].ySplit, 4)
  assert.equal(book.getWorksheet('Register Counts').rowCount, 17)
  assert.equal(book.getWorksheet('Registers').getCell('J5').value, 2)
  const items = book.getWorksheet('Order Items')
  assert.equal(items.getCell('E5').value, '=Synthetic snack <item>')
  assert.equal(items.getCell('E5').type, ExcelJS.ValueType.String)
  const mail = renderEmail(data)
  assert.match(mail.html, /Dev System &lt;Preview&gt;/)
  assert.doesNotMatch(mail.html, /https:\/\/storage.googleapis.com/)
  const mime = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({
    from: 'sender@example.test',
    to: 'recipient@example.test',
    subject: 'Synthetic report',
    ...mail,
    attachments: [{ filename: 'report.xlsx', content: buffer }],
  })
  assert.match(mime.message.toString(), /Content-Disposition: attachment; filename=report.xlsx/)
  assert.match(mime.message.toString(), /multipart\/alternative/)
})

function deliveryDb() {
  const records = new Map(),
    paths = []
  let tail = Promise.resolve()
  const refFor = (path) => ({
    path,
    update: async (data) => {
      Object.assign(records.get(path), data)
    },
  })
  const db = {
    databaseId: 'cerms',
    doc: (path) => {
      paths.push(path)
      assert.match(path, /^system\/dev\/dailyReports\/(?:test-)?\d{4}-\d{2}-\d{2}$/)
      return refFor(path)
    },
    runTransaction: (fn) => {
      const work = tail.then(() =>
        fn({
          get: async (ref) => ({ data: () => records.get(ref.path) }),
          set: (ref, data) =>
            records.set(ref.path, {
              ...records.get(ref.path),
              ...data,
              leaseUntil: Timestamp.fromDate(data.leaseUntil),
            }),
          update: (ref, data) => Object.assign(records.get(ref.path), data),
        }),
      )
      tail = work.catch(() => {})
      return work
    },
  }
  return { db, records, paths }
}
const event = { scheduleTime: '2026-11-14T13:00:00Z' }
function dependencies(db, overrides = {}) {
  return {
    db,
    read: async () => fixtureData(),
    workbook: async () => Buffer.from('synthetic attachment'),
    timestamp: () => Timestamp.fromMillis(Date.now()),
    send: async () => ({ accepted: [reportConfig.recipient] }),
    ...overrides,
  }
}

test('delivery is Dev-only, attaches full workbook, and ignores completed/concurrent scheduler retries', async () => {
  const f = deliveryDb(),
    messages = []
  const deps = dependencies(f.db, {
    send: async (m) => {
      messages.push(m)
      return { accepted: [reportConfig.recipient] }
    },
  })
  const result = await Promise.all([
    deliverDailyReport(event, deps),
    deliverDailyReport(event, deps),
  ])
  assert.equal(result.filter((r) => r.state === 'sent').length, 1)
  assert.equal(messages.length, 1)
  assert.deepEqual(messages[0].to, ['matthew@rocmtssolutions.com'])
  assert.equal(messages[0].attachments[0].filename, '2026-11-13_CERMS5_Dev_Daily_Report.xlsx')
  assert.match(messages[0].attachments[0].contentType, /spreadsheetml/)
  assert.equal((await deliverDailyReport(event, deps)).state, 'sent')
  assert.equal(messages.length, 1)
  assert.ok(f.paths.every((path) => path.startsWith('system/dev/dailyReports/')))
  await assert.rejects(
    deliverDailyReport(event, dependencies({ ...f.db, databaseId: '(default)' })),
    /legacy database/,
  )
})

test('preparation failure can retry safely; uncertain SMTP delivery is never automatically resubmitted', async () => {
  const f = deliveryDb()
  let sent = 0
  const broken = dependencies(f.db, {
    read: async () => {
      throw new Error('synthetic read failure')
    },
    send: async () => {
      sent++
    },
  })
  await assert.rejects(deliverDailyReport(event, broken), /no email was submitted/)
  assert.equal(sent, 0)
  assert.equal([...f.records.values()][0].state, 'failed')
  const ambiguous = dependencies(f.db, {
    send: async () => {
      sent++
      throw new Error('Synthetic SMTP lost response — confidential value')
    },
  })
  await assert.rejects(deliverDailyReport(event, ambiguous), /delivery requires review/)
  assert.equal([...f.records.values()][0].state, 'uncertain')
  assert.equal((await deliverDailyReport(event, ambiguous)).state, 'needs-review')
  assert.equal(sent, 1)
  assert.doesNotMatch(JSON.stringify([...f.records.values()]), /confidential/)
})

test('register-only and zero-sales days still deliver their workbook instead of skipping closeouts', async () => {
  const f = deliveryDb()
  let sent = 0
  const data = fixtureData()
  data.sales = []
  const result = await deliverDailyReport(
    event,
    dependencies(f.db, {
      read: async () => data,
      send: async (message) => {
        sent++
        assert.match(message.text, /Completed orders: 0/)
        return { accepted: [reportConfig.recipient] }
      },
    }),
  )
  assert.equal(result.registers, 1)
  assert.equal(sent, 1)
})

test('reader paginates all receipts and only requests Dev business subcollections in named cerms', async () => {
  const paths = [],
    filters = []
  function query(path, start = 0) {
    return {
      where(field, op, value) {
        filters.push([path, field, op, value])
        return this
      },
      orderBy() {
        return this
      },
      startAfter(doc) {
        return query(path, doc.offset + 1)
      },
      limit() {
        return this
      },
      async get() {
        const size = path.endsWith('/sales') ? Math.min(500, 501 - start) : 0
        return {
          size,
          docs: Array.from({ length: size }, (_, i) => ({
            id: `sale-${start + i}`,
            offset: start + i,
            data: () => ({}),
          })),
        }
      },
    }
  }
  const db = {
    databaseId: 'cerms',
    collection(path) {
      paths.push(path)
      return query(path)
    },
    doc(path) {
      paths.push(path)
      return { get: async () => ({ exists: true, data: () => ({ businessName: 'Dev' }) }) }
    },
    getAll: async () => [],
  }
  const window = reportWindow(event.scheduleTime)
  const data = await readReportData(db, window)
  assert.equal(data.sales.length, 501)
  assert.ok(paths.every((p) => p === 'system/dev' || p.startsWith('system/dev/')))
  assert.ok(
    filters.some(
      ([, field, op, value]) => field === 'createdAt' && op === '<' && value === window.end,
    ),
  )
  await assert.rejects(readReportData({ ...db, databaseId: '(default)' }, window), /named cerms/)
})

test('forced future-schedule tests have separate audit/message IDs and cannot suppress the next full daily report', async () => {
  const f = deliveryDb(),
    messages = []
  const future = { scheduleTime: '2026-11-15T05:00:00-08:00' }
  const testTime = Date.parse('2026-11-14T18:00:00Z')
  const data = fixtureData()
  data.window = reportWindow(future.scheduleTime)
  data.sales[0].createdAt = Timestamp.fromMillis(testTime)
  const deps = dependencies(f.db, {
    now: () => testTime,
    read: async () => ({ ...data }),
    send: async (message) => {
      messages.push(message)
      return { accepted: [reportConfig.recipient] }
    },
  })
  await deliverDailyReport(future, deps)
  assert.equal(messages.length, 1)
  assert.match(messages[0].subject, /^\[TEST\]/)
  assert.match(messages[0].text, /current-day activity may be incomplete/)
  assert.equal(f.records.get('system/dev/dailyReports/test-2026-11-14').state, 'sent')
  await deliverDailyReport(future, { ...deps, now: () => Date.parse(future.scheduleTime) })
  assert.equal(messages.length, 2)
  assert.doesNotMatch(messages[1].subject, /TEST/)
  assert.notEqual(messages[0].messageId, messages[1].messageId)
  assert.equal(f.records.get('system/dev/dailyReports/2026-11-14').state, 'sent')
})

test('first confirmed forced preview is retained as audit history when its normal scheduled report becomes due', async () => {
  const f = deliveryDb(),
    scheduled = { scheduleTime: '2026-11-15T13:00:00Z' }
  const data = fixtureData()
  data.window = reportWindow(scheduled.scheduleTime)
  data.sales = []
  const old = {
    state: 'sent',
    scheduledAt: scheduled.scheduleTime,
    sentAt: Timestamp.fromDate(new Date('2026-11-14T18:00:43Z')),
    messageId: '<original-test@example.test>',
    attachmentSha256: 'synthetic-hash',
    attempt: 1,
  }
  const path = 'system/dev/dailyReports/2026-11-14'
  f.records.set(path, old)
  let sends = 0
  const deps = dependencies(f.db, {
    now: () => Date.parse(scheduled.scheduleTime),
    read: async () => data,
    send: async (message) => {
      sends++
      assert.notEqual(message.messageId, old.messageId)
      return { accepted: [reportConfig.recipient] }
    },
  })
  await deliverDailyReport(scheduled, deps)
  assert.equal(sends, 1)
  assert.equal(f.records.get(path).priorTestDelivery.messageId, old.messageId)
  assert.equal(f.records.get(path).deliveryKind, 'scheduled')
  await deliverDailyReport(scheduled, deps)
  assert.equal(sends, 1)
})

test('refund-only day reports negative net, separate refunds and original-order linkage without inventing new purchases', async () => {
  const d = fixtureData(),
    source = d.sales[0]
  d.sales = [
    {
      ...source,
      id: 'refund-1',
      receiptNumber: 'refund-1',
      kind: 'refund',
      originalSaleId: 'older-sale',
      reason: 'Returned item',
      subtotalCents: -1000,
      taxCents: -80,
      totalCents: -1080,
      memberships: [],
      rentals: [],
      lines: [
        { ...source.lines[0], quantity: 1, subtotalCents: -1000, taxCents: -80, totalCents: -1080 },
      ],
      payments: [
        {
          method: 'cash',
          direction: 'out',
          amountCents: 1080,
          receivedCents: 1080,
          changeCents: 0,
          reference: '',
        },
      ],
    },
  ]
  const result = summarize(d)
  assert.equal(result.completedOrders, 0)
  assert.equal(result.refundCount, 1)
  assert.equal(result.refundCents, 1080)
  assert.equal(result.total, -1080)
  assert.equal(result.payments.cash, -1080)
  assert.equal(result.membershipRows.length, 0)
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await renderWorkbook(d))
  assert.equal(book.getWorksheet('Refunds').getRow(5).getCell(2).value, 'older-sale')
  assert.match(renderEmail(d).text, /Refunds: 1/)
})

test('daily discount totals and workbook retain the code and savings alongside net tax/payments', async () => {
  const d = fixtureData(),
    s = d.sales[0]
  Object.assign(s, {
    discount: { code: 'SAVE10', name: 'Save ten', kind: 'percent', value: 1000, version: 1 },
    discountCents: 200,
    subtotalCents: 1800,
    taxCents: 144,
    totalCents: 1944,
  })
  Object.assign(s.lines[0], {
    grossSubtotalCents: 2000,
    discountCents: 200,
    subtotalCents: 1800,
    taxCents: 144,
    totalCents: 1944,
  })
  s.payments[1].amountCents = 944
  s.payments[1].receivedCents = 944
  const summary = summarize(d)
  assert.equal(summary.discounts, 200)
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await renderWorkbook(d))
  assert.equal(book.getWorksheet('Orders').getRow(5).getCell(21).value, 'SAVE10')
  assert.match(renderEmail(d).text, /Discounts net of returns: \$2\.00/)
})
