import assert from 'node:assert/strict'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { FieldPath } from 'firebase-admin/firestore'
import { reportConfig as config } from './config.mjs'

export function reportWindow(scheduleTime) {
  const when = new Date(scheduleTime)
  assert.ok(Number.isFinite(when.getTime()), 'A valid scheduled invocation time is required')
  const today = formatInTimeZone(when, config.timeZone, 'yyyy-MM-dd')
  const previous = new Date(`${today}T12:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  const date = previous.toISOString().slice(0, 10)
  return {
    date,
    start: fromZonedTime(`${date}T00:00:00`, config.timeZone),
    end: fromZonedTime(`${today}T00:00:00`, config.timeZone),
  }
}
export const time = (value) => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null
  return date ? formatInTimeZone(date, config.timeZone, 'yyyy-MM-dd HH:mm:ss XXX') : 'Not recorded'
}
export const methods = {
  cash: 'Cash',
  card: 'Credit card',
  giftCard: 'Gift card',
  check: 'Check',
  other: 'Other',
}
const cents = (value) => {
  assert.ok(Number.isSafeInteger(value), 'Invalid stored money value')
  return value
}
const sum = (rows, key) => rows.reduce((total, row) => cents(total + cents(row[key])), 0)
export const legacyGroups = ['Hygiene', 'Health', 'Snacks', 'Flip Flops', 'Incense', 'Towels']
const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

export async function readReportData(db, window) {
  assert.equal(db.databaseId, 'cerms', 'Reports must use only the named cerms database')
  const path = 'system/dev'
  async function all(query) {
    const rows = []
    let cursor
    do {
      const page = await (cursor ? query.startAfter(cursor) : query).limit(500).get()
      rows.push(...page.docs.map((doc) => ({ ...doc.data(), id: doc.id })))
      assert.ok(
        rows.length <= 100_000,
        'Report exceeds safe capacity; no partial email will be sent',
      )
      if (page.size < 500) return rows
      cursor = page.docs.at(-1)
    } while (cursor)
  }
  const range = (collection, field) =>
    db
      .collection(`${path}/${collection}`)
      .where(field, '>=', window.start)
      .where(field, '<', window.end)
      .orderBy(field)
      .orderBy(FieldPath.documentId())
  const [system, settings, sales, registers, openRegisters, categories, products] =
    await Promise.all([
      db.doc(path).get(),
      db.doc(`${path}/posSettings/default`).get(),
      all(range('sales', 'createdAt')),
      all(range('registers', 'closedAt')),
      all(
        db
          .collection(`${path}/registers`)
          .where('status', '==', 'open')
          .where('openedAt', '<', window.end)
          .orderBy('openedAt', 'desc')
          .orderBy(FieldPath.documentId(), 'desc'),
      ),
      all(db.collection(`${path}/categories`).orderBy(FieldPath.documentId())),
      all(db.collection(`${path}/products`).orderBy(FieldPath.documentId())),
    ])
  assert.ok(system.exists, 'Dev System does not exist')
  const totals = new Map()
  // Read only the totals of registers actually included in this report.
  const included = [...registers, ...openRegisters]
  for (let offset = 0; offset < included.length; offset += 100) {
    const docs = await db.getAll(
      ...included.slice(offset, offset + 100).map((r) => db.doc(`${path}/registerTotals/${r.id}`)),
    )
    for (const doc of docs) totals.set(doc.id, doc.exists ? doc.data() : null)
  }
  return {
    window,
    name: settings.data()?.receiptName || system.data().businessName || 'Dev System',
    address: settings.data()?.receiptAddress || '',
    sales,
    registers,
    openRegisters,
    categories,
    products,
    totals,
  }
}

export function summarize(data) {
  const { sales } = data
  const products = new Map(data.products.map((p) => [p.id, p]))
  const categories = new Map(data.categories.map((c) => [c.id, c.name]))
  const productSales = new Map(),
    categorySales = new Map(),
    cashiers = new Map()
  const legacyCategoryTotals = Object.fromEntries(legacyGroups.map((name) => [name, 0]))
  const payments = Object.fromEntries(Object.keys(methods).map((key) => [key, 0]))
  const orderItems = [],
    paymentRows = [],
    rentalRows = [],
    membershipRows = []
  const notes = new Set()
  let cashReceived = 0,
    changeGiven = 0,
    cashPaidOut = 0,
    waivedTotal = 0,
    waivedUnits = 0
  for (const sale of sales) {
    assert.equal(sale.business, 'dev', 'Foreign-business receipt rejected')
    assert.equal(sale.status, 'completed', 'Only completed server receipts can be reported')
    assert.ok(Array.isArray(sale.lines) && Array.isArray(sale.payments), 'Incomplete saved receipt')
    const when = sale.createdAt?.toDate?.()
    assert.ok(when >= data.window.start && when < data.window.end, 'Receipt outside report window')
    assert.equal(
      cents(sale.subtotalCents) + cents(sale.taxCents),
      cents(sale.totalCents),
      'Receipt total mismatch',
    )
    const cashier = cashiers.get(sale.cashierUid) ?? {
      uid: sale.cashierUid,
      name: sale.cashierName || sale.cashierUid,
      orders: 0,
      total: 0,
      tax: 0,
      ...Object.fromEntries(Object.keys(methods).map((key) => [key, 0])),
    }
    cashier.orders++
    cashier.total += sale.totalCents
    cashier.tax += sale.taxCents
    let receiptPayments = 0
    for (const p of sale.payments) {
      assert.ok(
        Object.hasOwn(methods, p.method) && ['in', 'out'].includes(p.direction),
        'Unsupported saved payment',
      )
      const amount = cents(p.amountCents) * (p.direction === 'out' ? -1 : 1)
      payments[p.method] = cents(payments[p.method] + amount)
      cashier[p.method] += amount
      receiptPayments += amount
      if (p.method === 'cash') {
        if (p.direction === 'out') cashPaidOut += p.amountCents
        else {
          cashReceived += cents(p.receivedCents)
          changeGiven += cents(p.changeCents)
        }
      }
      paymentRows.push([
        sale.id,
        time(sale.createdAt),
        sale.registerId,
        sale.cashierName || sale.cashierUid,
        methods[p.method],
        p.direction === 'out' ? 'Payout' : 'Received',
        amount / 100,
        p.method === 'cash' && p.direction === 'in' ? p.receivedCents / 100 : null,
        p.method === 'cash' && p.direction === 'in' ? p.changeCents / 100 : null,
        p.reference || '',
      ])
    }
    assert.equal(receiptPayments, sale.totalCents, 'Payments do not reconcile with saved receipt')
    cashiers.set(sale.cashierUid, cashier)
    for (const line of sale.lines) {
      assert.ok(
        Number.isSafeInteger(line.quantity) && line.quantity > 0,
        'Invalid saved line quantity',
      )
      const categoryId = line.categoryId ?? products.get(line.productId)?.cat ?? ''
      const category =
        categories.get(categoryId) ||
        (categoryId ? `Unavailable category (${categoryId})` : 'Uncategorized')
      if (line.categoryId === undefined)
        notes.add(
          'Older receipt categories use the current product category when available. Deleted/unavailable categories are labeled explicitly.',
        )
      const qty = line.quantity * (line.payout ? -1 : 1)
      const product = productSales.get(line.productId) ?? {
        id: line.productId,
        name: line.name,
        sold: 0,
        payouts: 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        waivedUnits: 0,
        waivedValue: 0,
      }
      product[line.payout ? 'payouts' : 'sold'] += line.quantity
      product.subtotal += cents(line.subtotalCents)
      product.tax += cents(line.taxCents)
      product.total += cents(line.totalCents)
      const waivedValue = line.waived
        ? Math.abs(line.quantity * line.unitPriceCents * (line.payout ? -1 : 1))
        : 0
      if (line.waived) {
        waivedUnits += line.quantity
        waivedTotal += waivedValue
        product.waivedUnits += line.quantity
        product.waivedValue += waivedValue
      }
      productSales.set(line.productId, product)
      const cat = categorySales.get(category) ?? { name: category, units: 0, total: 0 }
      cat.units += qty
      cat.total += line.totalCents
      categorySales.set(category, cat)
      const group = ['beverages', 'candy', 'chips', 'snacks'].includes(normalize(category))
        ? 'Snacks'
        : legacyGroups.find((name) => normalize(name) === normalize(category))
      if (group) legacyCategoryTotals[group] += qty
      orderItems.push([
        sale.id,
        time(sale.createdAt),
        sale.registerId,
        line.productId,
        line.name,
        category,
        line.membership ? 'Membership' : line.rental ? 'Rental' : line.payout ? 'Payout' : 'Retail',
        line.quantity,
        line.unitPriceCents / 100,
        line.subtotalCents / 100,
        line.taxCents / 100,
        line.totalCents / 100,
        line.waived === true ? 'Yes' : 'No',
        waivedValue / 100,
      ])
    }
    const recipient = (id) =>
      sale.members?.find((m) => m.id === id) ?? (sale.member?.id === id ? sale.member : null)
    for (const rental of sale.rentals ?? []) {
      const member = recipient(rental.memberId ?? sale.member?.id)
      rentalRows.push([
        sale.id,
        time(sale.createdAt),
        rental.id || '',
        rental.productId,
        sale.lines.find((l) => l.productId === rental.productId)?.name || rental.productId,
        member?.name || 'Not recorded',
        member?.number ?? '',
        rental.assignedRoom,
        rental.renewalVisitId ? 'Renewal' : 'New rental',
        rental.renewalVisitId || '',
      ])
    }
    for (const membership of sale.memberships ?? []) {
      const member = recipient(membership.memberId)
      membershipRows.push([
        sale.id,
        time(sale.createdAt),
        membership.productId,
        sale.lines.find((l) => l.productId === membership.productId)?.name || membership.productId,
        member?.name || 'Not recorded',
        member?.number ?? '',
      ])
    }
  }
  return {
    total: sum(sales, 'totalCents'),
    subtotal: sum(sales, 'subtotalCents'),
    tax: sum(sales, 'taxCents'),
    payments,
    cashReceived,
    changeGiven,
    cashPaidOut,
    waivedTotal,
    waivedUnits,
    products: [...productSales.values()],
    categories: [...categorySales.values()],
    cashiers: [...cashiers.values()],
    legacyCategoryTotals,
    orderItems,
    paymentRows,
    rentalRows,
    membershipRows,
    notes: [...notes],
  }
}
