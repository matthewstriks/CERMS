import { useEffect, useState } from 'react'
import type { PosClient } from '../../../../data/firebase-pos'
import { paymentMethods, type SaleReceipt, type PaymentMethod } from '../../../../domain/pos'
import { money } from '../../lib/data'
import ReceiptDialog from './ReceiptDialog'
export default function SalesHistory({ client }: { client: PosClient }) {
  const [rows, setRows] = useState<SaleReceipt[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [method, setMethod] = useState(''),
    [day, setDay] = useState(''),
    [receipt, setReceipt] = useState<SaleReceipt | null>(null)
  async function load(reset = true) {
    setBusy(true)
    setError('')
    try {
      const page = await client.history(reset)
      setRows((p) =>
        reset ? page.rows : [...p, ...page.rows.filter((r) => !p.some((x) => x.id === r.id))],
      )
      setMore(page.more)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load sales.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [client])
  const filtered = rows.filter(
    (r) =>
      (!method || r.payments.some((p) => p.method === method)) &&
      (!day || new Date(r.createdAt).toLocaleDateString('en-CA') === day) &&
      (!search ||
        `${r.receiptNumber} ${r.cashierName} ${r.customerName} ${r.registerId} ${r.payments.map((p) => p.reference).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  )
  const card = filtered.reduce(
    (s, r) =>
      s +
      r.payments
        .filter((p) => p.method === 'card')
        .reduce((s, p) => s + p.amountCents * (p.direction === 'out' ? -1 : 1), 0),
    0,
  )
  return (
    <section className="panel pos-history">
      <h2>Sales & payments</h2>
      <div className="toolbar">
        <input
          aria-label="Search receipts"
          placeholder="Receipt, register, customer, cashier or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter payment method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">All payment methods</option>
          {Object.entries(paymentMethods).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="Receipt date"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <button disabled={busy} onClick={() => void load()}>
          Refresh sales
        </button>
      </div>
      <p>
        {filtered.length} matching loaded receipts · Net card payments {money(card / 100)}. Load
        older receipts to extend this view.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date / receipt</th>
              <th>Cashier / customer</th>
              <th>Total</th>
              <th>Payments</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  {new Date(r.createdAt).toLocaleString()}
                  <small className="pos-block">{r.receiptNumber}</small>
                </td>
                <td>
                  {r.cashierName}
                  <small className="pos-block">{r.customerName || 'Walk-in'}</small>
                </td>
                <td>{money(r.totalCents / 100)}</td>
                <td>
                  {r.payments.map((p, i) => (
                    <small className="pos-block" key={i}>
                      {paymentMethods[p.method as PaymentMethod]}: {money(p.amountCents / 100)}{' '}
                      {p.direction === 'out' ? 'out' : ''}
                      {p.reference && ` · ${p.reference}`}
                    </small>
                  ))}
                </td>
                <td>
                  <button onClick={() => setReceipt(r)}>View / print</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && !busy && <p>No completed sales yet.</p>}
      {busy && <p role="status">Loading sales…</p>}
      {more && (
        <button disabled={busy} onClick={() => void load(false)}>
          Load older receipts
        </button>
      )}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </section>
  )
}
