import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { reportConfig as config } from './config.mjs'
import { methods, legacyGroups, time, summarize } from './report-data.mjs'

const currency = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )
const moneyFormat = '$#,##0.00;[Red]($#,##0.00);$0.00'
const denominations = [
  ['bill100', '$100 bills', 10000],
  ['bill50', '$50 bills', 5000],
  ['bill20', '$20 bills', 2000],
  ['bill10', '$10 bills', 1000],
  ['bill5', '$5 bills', 500],
  ['bill2', '$2 bills', 200],
  ['bill1', '$1 bills', 100],
  ['coin100', '$1 coins', 100],
  ['coin50', '50¢ coins', 50],
  ['coin25', '25¢ coins', 25],
  ['coin10', '10¢ coins', 10],
  ['coin5', '5¢ coins', 5],
  ['coin1', '1¢ coins', 1],
]

export function registerRows(data) {
  const rows = [],
    counts = []
  for (const r of [...data.registers, ...data.openRegisters]) {
    const closed = r.status === 'closed'
    assert.ok(
      closed
        ? r.closedAt && r.closingCounts && Number.isSafeInteger(r.closingTotalCents)
        : r.status === 'open',
      'Invalid included register',
    )
    const total = data.totals.get(r.id)
    if (total)
      assert.equal(
        total.expectedCashCents,
        r.openingTotalCents + total.netByMethod.cash,
        'Register cash mismatch',
      )
    const countCash = (values) =>
      denominations.reduce((sum, [key, , cents]) => {
        assert.ok(
          Number.isSafeInteger(values[key]) && values[key] >= 0,
          'Invalid register denomination',
        )
        return sum + values[key] * cents
      }, 0)
    assert.equal(countCash(r.openingCounts), r.openingTotalCents, 'Opening register count mismatch')
    if (closed)
      assert.equal(
        countCash(r.closingCounts),
        r.closingTotalCents,
        'Closing register count mismatch',
      )
    const expected = total?.expectedCashCents ?? r.openingTotalCents
    rows.push([
      r.id,
      closed ? 'Closed' : 'Still open (provisional)',
      r.ownerName || r.ownerUid,
      time(r.openedAt),
      closed ? time(r.closedAt) : '',
      r.closedByName || r.closedByUid || (closed ? 'Not recorded' : ''),
      r.openingTotalCents / 100,
      expected / 100,
      closed ? r.closingTotalCents / 100 : null,
      closed ? (r.closingTotalCents - expected) / 100 : null,
      total?.saleCount ?? 0,
      (total?.totalCents ?? 0) / 100,
      (total?.taxCents ?? 0) / 100,
      ...Object.keys(methods).map((key) => (total?.netByMethod[key] ?? 0) / 100),
      (total?.cashReceivedCents ?? 0) / 100,
      (total?.changeGivenCents ?? 0) / 100,
      (total?.cashPaidOutCents ?? 0) / 100,
      r.closeNote || '',
      total
        ? 'Full register lifetime totals'
        : 'No CERMS 5 POS ledger recorded; opening cash is the baseline',
      'Not recorded in CERMS 5',
    ])
    for (const [key, label, cents] of denominations)
      counts.push([
        r.id,
        r.ownerName || r.ownerUid,
        label,
        r.openingCounts[key],
        (r.openingCounts[key] * cents) / 100,
        closed ? r.closingCounts[key] : null,
        closed ? (r.closingCounts[key] * cents) / 100 : null,
      ])
  }
  return { rows, counts }
}

export async function renderWorkbook(data, summary = summarize(data)) {
  const book = new ExcelJS.Workbook()
  book.creator = 'CERMS 5'
  book.title = `Dev System daily report ${data.window.date}`
  book.subject = 'Previous calendar day sales and register reconciliation'
  // Fixed report-day timestamp makes workbook metadata reproducible across retries.
  book.created = data.window.end
  book.modified = data.window.end
  function sheet(name, headers, rows, money = []) {
    const ws = book.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 4 }],
      properties: { defaultRowHeight: 20 },
    })
    ws.mergeCells(1, 1, 1, headers.length)
    ws.getCell(1, 1).value = `${data.name} · ${name}`
    ws.getRow(1).height = 32
    ws.getCell(1, 1).font = { name: 'Calibri', bold: true, size: 17, color: { argb: 'FFFFFFFF' } }
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153F36' } }
    ws.mergeCells(2, 1, 2, headers.length)
    ws.getCell(2, 1).value = `${data.window.date} · ${config.timeZone} · CERMS 5 / Dev only`
    ws.getCell(2, 1).font = { name: 'Calibri', size: 11, color: { argb: 'FF52675F' } }
    ws.getRow(4).values = headers
    ws.getRow(4).height = 32
    ws.getRow(4).eachCell((cell) => {
      cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF286B58' } }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
    headers.forEach((header, i) => {
      ws.getColumn(i + 1).width = /id|timestamp|opened|closed at/i.test(header)
        ? 38
        : /note|detail|scope|product|customer|name|basis/i.test(header)
          ? 36
          : Math.max(16, Math.min(28, header.length + 3))
    })
    for (const values of rows) {
      const row = ws.addRow(
        values.map((value) => (typeof value === 'string' ? value.slice(0, 32767) : value)),
      )
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Calibri', size: 11 }
        cell.alignment = { vertical: 'top', wrapText: true }
        if (row.number % 2)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F6F2' } }
      })
      for (const index of money) row.getCell(index).numFmt = moneyFormat
    }
    if (!rows.length) ws.getCell(5, 1).value = 'No records for this period.'
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, ws.rowCount), column: headers.length },
    }
    ws.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:4',
    }
    return ws
  }
  const summaryRows = [
    ['Report date', data.window.date],
    ['Reporting timezone', config.timeZone],
    ['Period starts (inclusive)', time(data.window.start)],
    ['Period ends (exclusive)', time(data.window.end)],
    ['Business', 'dev'],
    [
      'Delivery',
      data.testDelivery
        ? 'Test preview; current-day data may be incomplete'
        : 'Scheduled daily report',
    ],
    ['Completed orders', data.sales.length],
    ['Net sales before tax', summary.subtotal / 100],
    ['Tax', summary.tax / 100],
    ['Net transaction total', summary.total / 100],
    ...Object.entries(methods).map(([key, label]) => [
      `Net ${label.toLowerCase()}`,
      summary.payments[key] / 100,
    ]),
    ['Cash received', summary.cashReceived / 100],
    ['Change given', summary.changeGiven / 100],
    ['Cash paid out', summary.cashPaidOut / 100],
    ['Registers closed during period', data.registers.length],
    ['Still-open registers at report time', data.openRegisters.length],
    ['Memberships fulfilled', summary.membershipRows.length],
    ['Rental units (including renewals)', summary.rentalRows.length],
    [
      'Period convention',
      'Sales are selected by completion time; register closes by closing time.',
    ],
    [
      'Register reconciliation scope',
      'Register balances cover the entire shift, possibly across midnight. Do not add register lifetime totals to daily sales.',
    ],
    [
      'Historical compatibility',
      'Legacy original-total and payout-slip counts are not stored by CERMS 5 and are not invented. No legacy data is queried.',
    ],
    [
      'Categories',
      'Line category IDs use saved receipts where present; current category names are used for labels. Older lines can use current product categories. Deleted categories remain labeled unavailable.',
    ],
    ...summary.notes.map((note) => ['Data note', note]),
  ]
  const overview = sheet('Summary', ['Metric', 'Value'], summaryRows)
  summaryRows.forEach(([label], i) => {
    if (/^(Net |Tax$|Cash received$|Change given$|Cash paid out$)/.test(label))
      overview.getCell(i + 5, 2).numFmt = moneyFormat
  })
  overview.getColumn(1).width = 38
  overview.getColumn(2).width = 100
  sheet(
    'Orders',
    [
      'Order ID',
      'Receipt number',
      'Timestamp (Central)',
      'Register ID',
      'Cashier',
      'Customer / linked members',
      'Products',
      'Subtotal',
      'Tax',
      'Net total',
      'Original total (legacy)',
      ...Object.values(methods),
      'Cash received',
      'Change given',
      'Note',
    ],
    data.sales.map((s) => {
      const paid = (key) =>
        s.payments
          .filter((p) => p.method === key)
          .reduce((sum, p) => sum + p.amountCents * (p.direction === 'out' ? -1 : 1), 0) / 100
      const cash = s.payments.find((p) => p.method === 'cash' && p.direction === 'in')
      return [
        s.id,
        s.receiptNumber || s.id,
        time(s.createdAt),
        s.registerId,
        s.cashierName || s.cashierUid,
        s.customerName || s.member?.name || s.members?.map((m) => m.name).join('; ') || 'Guest',
        s.lines.map((l) => `${l.quantity} × ${l.name}`).join('; '),
        s.subtotalCents / 100,
        s.taxCents / 100,
        s.totalCents / 100,
        'Not recorded in CERMS 5',
        ...Object.keys(methods).map(paid),
        cash ? cash.receivedCents / 100 : null,
        cash ? cash.changeCents / 100 : null,
        s.note || '',
      ]
    }),
    [8, 9, 10, 12, 13, 14, 15, 16, 17, 18],
  )
  sheet(
    'Order Items',
    [
      'Order ID',
      'Timestamp (Central)',
      'Register ID',
      'Product ID',
      'Product name',
      'Category',
      'Type',
      'Quantity',
      'Unit price',
      'Subtotal',
      'Tax',
      'Total',
    ],
    summary.orderItems,
    [9, 10, 11, 12],
  )
  sheet(
    'Payments',
    [
      'Order ID',
      'Timestamp (Central)',
      'Register ID',
      'Cashier',
      'Method',
      'Direction',
      'Net amount',
      'Cash received',
      'Change given',
      'External reference',
    ],
    summary.paymentRows,
    [7, 8, 9],
  )
  sheet(
    'Product Sales',
    [
      'Product ID',
      'Product name',
      'Quantity sold',
      'Payout units',
      'Net quantity',
      'Subtotal',
      'Tax',
      'Net total',
    ],
    summary.products.map((p) => [
      p.id,
      p.name,
      p.sold,
      p.payouts,
      p.sold - p.payouts,
      p.subtotal / 100,
      p.tax / 100,
      p.total / 100,
    ]),
    [6, 7, 8],
  )
  sheet(
    'Category Totals',
    ['Category', 'Net units', 'Net total'],
    summary.categories.map((c) => [c.name, c.units, c.total / 100]),
    [3],
  )
  sheet(
    'Legacy Category Groups',
    ['Legacy report group', 'Net quantity', 'Included categories'],
    legacyGroups.map((name) => [
      name,
      summary.legacyCategoryTotals[name],
      name === 'Snacks' ? 'Beverages, Candy, Chips, Snacks' : name,
    ]),
  )
  sheet(
    'Cashiers',
    ['Cashier ID', 'Cashier', 'Orders', 'Net total', 'Tax', ...Object.values(methods)],
    summary.cashiers.map((c) => [
      c.uid,
      c.name,
      c.orders,
      c.total / 100,
      c.tax / 100,
      ...Object.keys(methods).map((key) => c[key] / 100),
    ]),
    [4, 5, 6, 7, 8, 9, 10],
  )
  const { rows, counts } = registerRows(data)
  const registerHeaders = [
    'Register ID',
    'Status',
    'Cashier',
    'Opened (Central)',
    'Closed at (Central)',
    'Closed by',
    'Opening cash',
    'Expected cash',
    'Counted cash',
    'Over / short',
    'Shift transactions',
    'Shift net total',
    'Shift tax',
    ...Object.values(methods),
    'Cash received',
    'Change given',
    'Cash paid out',
    'Closing note',
    'Reconciliation basis',
    'Payout-slip count (legacy)',
  ]
  const registerMoney = [7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
  sheet(
    'Registers',
    registerHeaders,
    rows.filter((r) => r[1] === 'Closed'),
    registerMoney,
  )
  sheet(
    'Open Registers',
    registerHeaders,
    rows.filter((r) => r[1] !== 'Closed'),
    registerMoney,
  )
  sheet(
    'Register Counts',
    [
      'Register ID',
      'Cashier',
      'Denomination',
      'Opening count',
      'Opening value',
      'Closing count',
      'Closing value',
    ],
    counts,
    [5, 7],
  )
  // Unique numeric suffixes avoid Excel's 31-character/case-insensitive name collisions.
  const cashierIds = [...new Set(data.registers.map((r) => r.ownerUid))]
  cashierIds.forEach((id, i) => {
    const name = (data.registers.find((r) => r.ownerUid === id)?.ownerName || id)
      .replace(/[\[\]:*?/\\']/g, '')
      .slice(0, 15)
    const ids = new Set(data.registers.filter((r) => r.ownerUid === id).map((r) => r.id))
    sheet(
      `Register ${i + 1} - ${name}`.slice(0, 31),
      registerHeaders,
      rows.filter((r) => ids.has(r[0])),
      registerMoney,
    )
  })
  sheet(
    'Rentals',
    [
      'Order ID',
      'Timestamp (Central)',
      'Rental unit ID',
      'Product ID',
      'Rental product',
      'Recipient',
      'Member number',
      'Assigned room / number',
      'Action',
      'Renewed visit ID',
    ],
    summary.rentalRows,
  )
  sheet(
    'Memberships',
    [
      'Order ID',
      'Timestamp (Central)',
      'Product ID',
      'Membership product',
      'Recipient',
      'Member number',
    ],
    summary.membershipRows,
  )
  return Buffer.from(await book.xlsx.writeBuffer())
}

export function renderEmail(data, summary = summarize(data)) {
  const register = registerRows(data).rows.filter((r) => r[1] === 'Closed')
  const cards = [
    ['Net transactions', currency(summary.total)],
    ['Completed orders', data.sales.length],
    ['Tax recorded', currency(summary.tax)],
    ['Registers closed', data.registers.length],
  ]
  const table = (rows) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e2ebe5;color:#52675f">${escape(label)}</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e2ebe5;font-weight:bold;color:#153f36">${escape(value)}</td></tr>`).join('')}</table>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef3f0;font-family:Arial,Helvetica,sans-serif;color:#203b31"><div style="display:none;max-height:0;overflow:hidden">${escape(data.name)} daily summary for ${data.window.date}. Excel workbook attached.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:white;border-radius:16px;overflow:hidden"><tr><td style="padding:32px;background:#153f36;color:white"><div style="font-size:12px;letter-spacing:2px;color:#b9d8c9">CERMS 5 · DEV SYSTEM ONLY</div><h1 style="font-size:28px;line-height:1.2;margin:14px 0 8px">Your daily register report</h1><div style="font-size:16px;color:#deede5">${escape(data.name)} · ${data.window.date}</div></td></tr><tr><td style="padding:28px 32px"><p style="line-height:1.65;margin:0 0 22px">${data.testDelivery ? 'This is a test preview. Current-day activity may be incomplete.' : 'Here is the previous calendar day’s activity for your test system.'} The detailed Excel workbook is attached to this email.</p>${table(cards)}<h2 style="font-size:18px;margin:28px 0 6px">Payment breakdown</h2>${table(Object.entries(methods).map(([key, label]) => [label, currency(summary.payments[key])]))}<h2 style="font-size:18px;margin:28px 0 6px">Cash recorded for the day</h2>${table(
    [
      ['Cash received', currency(summary.cashReceived)],
      ['Change given', currency(summary.changeGiven)],
      ['Cash paid out', currency(summary.cashPaidOut)],
    ],
  )}<h2 style="font-size:18px;margin:28px 0 6px">Register closeouts</h2>${register.length ? table(register.map((r) => [`${r[2]} · ${String(r[0]).slice(0, 8)}`, `Counted ${currency(r[8] * 100)} · Over/short ${currency(r[9] * 100)}`])) : '<p style="line-height:1.6;color:#52675f">No registers closed during this reporting day.</p>'}${data.openRegisters.length ? `<p style="padding:14px;background:#fff5df;color:#70531c;line-height:1.6;border-radius:8px">${data.openRegisters.length} register(s) remain open at report time. Their balances are provisional and are listed separately in the workbook.</p>` : ''}<div style="margin-top:28px;padding:20px;background:#f0f6f2;border:1px solid #d9e8de;border-radius:10px"><strong>Excel workbook attached</strong><p style="line-height:1.65;margin:8px 0 0;color:#52675f">Includes orders, line items, split payments, product and category totals, cashier summaries, register closeouts and denomination counts, memberships and rental assignments.</p></div><p style="font-size:12px;line-height:1.7;color:#6b7e73;margin:24px 0 0">Reporting timezone: ${config.timeZone}. Sales cover ${escape(time(data.window.start))} through the next midnight (exclusive). Register balances cover each complete shift, which can cross midnight. Only Dev System in CERMS 5 is included; legacy business reports remain separate.</p></td></tr><tr><td style="padding:20px 32px;background:#f7faf8;font-size:12px;color:#6b7e73">CERMS 5 · Automated daily report · No payment processing or settlement is performed by this report.</td></tr></table></td></tr></table></body></html>`
  const text = `${data.testDelivery ? 'TEST PREVIEW — current-day activity may be incomplete.\n\n' : ''}${data.name} — Daily register report\n${data.window.date} (${config.timeZone})\nDev System / CERMS 5 only\n\nCompleted orders: ${data.sales.length}\nNet transactions: ${currency(summary.total)}\nTax: ${currency(summary.tax)}\nRegisters closed: ${data.registers.length}\nStill open: ${data.openRegisters.length}\n\n${Object.entries(
    methods,
  )
    .map(([key, name]) => `${name}: ${currency(summary.payments[key])}`)
    .join(
      '\n',
    )}\n\nThe detailed Excel workbook is attached. Sales cover the previous calendar day; register balances cover the full shift. Legacy reporting is unchanged.`
  return { html, text }
}
