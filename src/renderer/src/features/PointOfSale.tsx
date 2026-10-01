import { isPosRequest, posEndpoints } from '../../../shared/pos-policy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ShoppingCart, Plus, Trash2 } from 'lucide-react'
import { useMembershipSession } from '../lib/membership-session'
import { createCatalog } from '../../../data/firebase-catalog'
import { createRegisters } from '../../../data/firebase-registers'
import { createPos } from '../../../data/firebase-pos'
import { hasStaffPermission, ownerUid } from '../../../domain/staff-permissions'
import {
  parsePrice,
  validProduct,
  type CatalogProduct,
  type CatalogCategory,
  type CatalogRecord,
} from '../../../domain/catalog'
import {
  cartTotals,
  paymentMethods,
  type CartLine,
  type PaymentMethod,
  type SaleRequest,
  type SaleReceipt,
  type PosSettings as Settings,
  type RegisterTotals,
} from '../../../domain/pos'
import type { RegisterRecord } from '../../../domain/registers'
import { money } from '../lib/data'
import ReceiptDialog from './pos/ReceiptDialog'
import PosSettings from './pos/PosSettings'
import SalesHistory from './pos/SalesHistory'
import './pos/Pos.css'
type Tender = { method: PaymentMethod; amount: string; received: string; reference: string }
function readDraft(key: string): {
  cart: CartLine[]
  customerName: string
  note: string
  pending: SaleRequest | null
} {
  const empty = { cart: [], customerName: '', note: '', pending: null }
  try {
    const d = JSON.parse(localStorage.getItem(key) || 'null')
    if (
      !d ||
      d.schemaVersion !== 1 ||
      !Array.isArray(d.cart) ||
      d.cart.length > 100 ||
      !d.cart.every(
        (l: CartLine) =>
          l &&
          validProduct(l.product?.data) &&
          Number.isInteger(l.quantity) &&
          l.quantity > 0 &&
          l.quantity <= 1000 &&
          Number.isSafeInteger(l.unitPriceCents) &&
          l.unitPriceCents >= 0,
      ) ||
      typeof d.customerName !== 'string' ||
      typeof d.note !== 'string' ||
      (d.pending && !isPosRequest(posEndpoints.completeSale, JSON.stringify({ data: d.pending })))
    )
      return empty
    return d
  } catch {
    return empty
  }
}
export default function PointOfSale({ historyOnly = false }: { historyOnly?: boolean }) {
  const { reader } = useMembershipSession()
  const clients = useMemo(
    () =>
      reader
        ? {
            catalog: createCatalog(reader),
            registers: createRegisters(reader),
            pos: createPos(reader),
          }
        : null,
    [reader],
  )
  const key = `cerms.pos.${reader?.uid}.${reader?.club}`
  const initialDraft = useMemo(() => readDraft(key), [key])
  const [cart, setCart] = useState<CartLine[]>(initialDraft.cart),
    [products, setProducts] = useState<CatalogRecord<CatalogProduct>[]>([]),
    [categories, setCategories] = useState<CatalogRecord<CatalogCategory>[]>([]),
    [register, setRegister] = useState<RegisterRecord | null>(null),
    [registerTotals, setRegisterTotals] = useState<RegisterTotals | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [tab, setTab] = useState(historyOnly ? 'history' : 'sale'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [payments, setPayments] = useState<Tender[]>([]),
    [paying, setPaying] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [customerName, setCustomerName] = useState(initialDraft.customerName),
    [note, setNote] = useState(initialDraft.note),
    [pending, setPending] = useState<SaleRequest | null>(initialDraft.pending),
    [receipt, setReceipt] = useState<SaleReceipt | null>(null)
  const saving = useRef(false),
    searchInput = useRef<HTMLInputElement>(null),
    paymentDialog = useRef<HTMLDialogElement>(null)
  const canSell = !!reader && hasStaffPermission(reader.uid, 'processSales', reader.permissions)
  useEffect(() => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ schemaVersion: 1, cart, customerName, note, pending }),
      )
    } catch {
      setError('Unable to save the local draft. Keep this window open until checkout is confirmed.')
    }
  }, [cart, customerName, note, pending, key])
  async function refresh() {
    if (!clients) return
    setBusy(true)
    setError('')
    try {
      const [s, r] = await Promise.all([clients.pos.settings(), clients.registers.own()])
      setSettings(s)
      setRegister(r)
      setRegisterTotals(r ? await clients.pos.totals(r.id, r.openingTotalCents) : null)
      if (canSell) {
        const cats = await clients.catalog.categories()
        setCategories(cats)
        let page = await clients.catalog.products(true),
          all = page.rows
        while (page.more) {
          page = await clients.catalog.products()
          all.push(...page.rows)
          if (all.length > 10000) throw new Error('Catalog exceeds 10,000 products.')
        }
        setProducts(all)
        if (!pending)
          setCart((rows) =>
            rows.map((l) => {
              const latest = all.find((p) => p.id === l.product.id)
              return latest
                ? {
                    ...l,
                    product: latest,
                    unitPriceCents: latest.data.askforprice
                      ? l.unitPriceCents
                      : latest.data.priceCents,
                  }
                : l
            }),
          )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load point of sale.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [clients, canSell])
  useEffect(() => {
    if (paying) paymentDialog.current?.showModal()
    else paymentDialog.current?.close()
  }, [paying])
  const totals = cartTotals(cart, settings?.taxRateBps ?? null),
    locked = busy || !!pending
  const visible = products.filter(
    (p) =>
      p.data.active &&
      (!p.data.restricted || p.data.restrictedUsers.includes(reader?.uid ?? '')) &&
      (!category || p.data.cat === category) &&
      (!search || `${p.data.name} ${p.data.barcode}`.toLowerCase().includes(search.toLowerCase())),
  )
  function add(p: CatalogRecord<CatalogProduct>) {
    if (locked) return
    setCart((rows) => {
      const exists = rows.find((l) => l.product.id === p.id)
      if (exists)
        return rows.map((l) =>
          l === exists ? { ...l, quantity: Math.min(1000, l.quantity + 1) } : l,
        )
      if (rows.length >= 100) {
        setError('Use at most 100 products per sale.')
        return rows
      }
      return [...rows, { product: p, quantity: 1, unitPriceCents: p.data.priceCents }]
    })
    setNotice('')
    searchInput.current?.focus()
  }
  function scan() {
    const matches = products.filter(
      (p) =>
        p.data.active &&
        p.data.barcode === search.trim() &&
        (!p.data.restricted || p.data.restrictedUsers.includes(reader?.uid ?? '')),
    )
    if (matches.length === 1) {
      add(matches[0]!)
      setSearch('')
    } else if (matches.length > 1)
      setError('More than one product has this barcode. Select the correct product.')
    else if (visible.length === 1) add(visible[0]!)
    else setError('No unique matching barcode. Search or choose a product.')
  }
  let allocated = 0,
    cashChange = 0,
    paymentError = ''
  try {
    if (payments.filter((p) => p.method === 'cash').length > 1)
      throw new Error('Use one cash portion and split the rest across other methods.')
    for (const p of payments) {
      const amount = parsePrice(p.amount)
      if (amount <= 0) throw new Error('Each payment portion must be greater than zero.')
      allocated += amount
      if (p.method === 'cash') {
        const received = parsePrice(p.received)
        if (received < amount) throw new Error('Cash received is less than the cash portion.')
        if (totals.totalCents < 0 && received !== amount)
          throw new Error('Cash paid out must equal the cash payment portion.')
        cashChange += totals.totalCents < 0 ? 0 : received - amount
      }
    }
  } catch (e) {
    paymentError = e instanceof Error ? e.message : 'Check payment amounts.'
  }
  async function submit(request: SaleRequest) {
    if (!clients || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ schemaVersion: 1, cart, customerName, note, pending: request }),
      )
      setPending(request)
      const saved = await clients.pos.complete(request)
      if (!saved)
        throw new Error('Sale saved but receipt could not be loaded. Retry to retrieve it.')
      setReceipt(saved)
      setCart([])
      setCustomerName('')
      setNote('')
      setPayments([])
      setPending(null)
      setPaying(false)
      localStorage.removeItem(key)
      setNotice('Sale saved. Register totals and inventory have been updated.')
      await refresh()
    } catch (e) {
      if (e && typeof e === 'object' && 'definitive' in e && e.definitive) {
        setPending(null)
        setConfirmed(false)
      }
      setError(e instanceof Error ? e.message : 'Save not confirmed. Retry the same request.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  if (!reader || !clients) return null
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          <button className={tab === 'sale' ? 'selected' : ''} onClick={() => setTab('sale')}>
            New sale
          </button>
          <button className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}>
            Sales & payments
          </button>
          {reader.uid === ownerUid && (
            <button
              className={tab === 'settings' ? 'selected' : ''}
              onClick={() => setTab('settings')}
            >
              Tax & receipts
            </button>
          )}
        </div>
        <button disabled={busy || !!pending} onClick={() => void refresh()}>
          Refresh POS
        </button>
      </div>
      {error && !paying && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <section className="panel pos-pending">
          <strong>Confirm the previous sale before continuing</strong>
          <p>
            The saved request will be retried with the same receipt ID, preventing a duplicate sale.
          </p>
          <button className="primary" disabled={busy} onClick={() => void submit(pending)}>
            Retry / retrieve saved receipt
          </button>
        </section>
      )}
      {tab === 'settings' && settings && (
        <PosSettings
          key={JSON.stringify(settings)}
          settings={settings}
          client={clients.pos}
          onSaved={() => {
            setNotice('Tax and receipt settings saved.')
            void refresh()
          }}
        />
      )}
      {tab === 'history' && <SalesHistory client={clients.pos} />}
      {tab === 'sale' &&
        (!canSell ? (
          <section className="panel">
            <h2>POS permission required</h2>
            <p>
              The owner can enable “Use point of sale” in Users & permissions. You can view existing
              receipts in Sales & payments.
            </p>
          </section>
        ) : (
          <>
            <section className="pos-register-strip">
              <span>
                {register ? (
                  <>
                    <strong>Your register is open</strong> · Expected cash{' '}
                    {money((registerTotals?.expectedCashCents ?? register.openingTotalCents) / 100)}{' '}
                    · Card {money((registerTotals?.netByMethod.card ?? 0) / 100)}
                  </>
                ) : (
                  <>
                    Open your register before checkout. <a href="#registers">Go to Registers</a>
                  </>
                )}
              </span>
              <span>
                Tax:{' '}
                {settings?.taxRateBps == null ? 'Not configured' : `${settings.taxRateBps / 100}%`}
              </span>
            </section>
            <div className="pos-layout">
              <section className="panel pos-catalog">
                <div className="pos-catalog-tools">
                  <label className="pos-search">
                    <Search size={17} />
                    <input
                      ref={searchInput}
                      aria-label="Search or scan products"
                      placeholder="Search products or scan a barcode…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          scan()
                        }
                      }}
                    />
                  </label>
                  <select
                    aria-label="Product category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.data.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pos-product-grid">
                  {visible.map((p) => (
                    <button
                      className="pos-product"
                      key={p.id}
                      disabled={locked || (p.data.inventory === 0 && !p.data.payout)}
                      onClick={() => add(p)}
                    >
                      <span>{p.data.name}</span>
                      <strong>
                        {p.data.askforprice
                          ? 'Enter price'
                          : `${p.data.payout ? '−' : ''}${money(p.data.priceCents / 100)}`}
                      </strong>
                      <small>
                        {categories.find((c) => c.id === p.data.cat)?.data.name}
                        {p.data.inventory !== null ? ` · ${p.data.inventory} in stock` : ''}
                      </small>
                      <small>
                        {p.data.membership ? 'Membership ' : ''}
                        {p.data.rental ? 'Rental ' : ''}
                        {p.data.payout ? 'Payout ' : ''}
                        {p.data.taxable ? 'Taxable' : ''}
                      </small>
                    </button>
                  ))}
                </div>
                {busy && !products.length ? (
                  <p role="status">Loading products…</p>
                ) : (
                  !visible.length && <p className="empty">No matching active products.</p>
                )}
              </section>
              <section className="panel pos-cart">
                <div className="pos-cart-heading">
                  <h2>
                    <ShoppingCart size={19} /> Current sale
                  </h2>
                  <button
                    disabled={locked || !cart.length}
                    onClick={() => {
                      if (window.confirm('Clear this unsaved cart?')) {
                        setCart([])
                        setPayments([])
                      }
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="pos-cart-lines">
                  {cart.map((l) => (
                    <div className="pos-cart-line" key={l.product.id}>
                      <div>
                        <strong>{l.product.data.name}</strong>
                        <small>
                          {money(l.unitPriceCents / 100)} each
                          {l.product.data.payout ? ' · Payout' : ''}
                        </small>
                      </div>
                      <div className="pos-line-controls">
                        <label>
                          Qty
                          <input
                            aria-label={`Quantity for ${l.product.data.name}`}
                            type="number"
                            min={1}
                            max={1000}
                            value={l.quantity}
                            disabled={locked}
                            onChange={(e) =>
                              setCart((rows) =>
                                rows.map((r) =>
                                  r === l
                                    ? {
                                        ...r,
                                        quantity: Math.min(
                                          1000,
                                          Math.max(1, Number(e.target.value) || 1),
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                        {l.product.data.askforprice && (
                          <label>
                            Price
                            <input
                              aria-label={`Price for ${l.product.data.name}`}
                              type="text"
                              inputMode="decimal"
                              value={l.priceInput ?? String(l.unitPriceCents / 100)}
                              disabled={locked}
                              onChange={(e) => {
                                const priceInput = e.target.value
                                let unitPriceCents = l.unitPriceCents
                                try {
                                  unitPriceCents = parsePrice(priceInput)
                                } catch {
                                  /* Preserve partial input until valid. */
                                }
                                setCart((rows) =>
                                  rows.map((r) =>
                                    r === l ? { ...r, priceInput, unitPriceCents } : r,
                                  ),
                                )
                              }}
                            />
                          </label>
                        )}
                        <strong>
                          {money(
                            (l.unitPriceCents * l.quantity * (l.product.data.payout ? -1 : 1)) /
                              100,
                          )}
                        </strong>
                        <button
                          disabled={locked}
                          aria-label={`Remove ${l.product.data.name}`}
                          onClick={() => setCart((rows) => rows.filter((r) => r !== l))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!cart.length && <p className="empty">Scan or choose a product to start.</p>}
                <label>
                  Customer name (optional)
                  <input
                    maxLength={200}
                    value={customerName}
                    disabled={locked}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </label>
                <label>
                  Receipt note (optional)
                  <input
                    maxLength={1000}
                    value={note}
                    disabled={locked}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <dl className="pos-totals">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(totals.subtotalCents / 100)}</dd>
                  </div>
                  <div>
                    <dt>Tax</dt>
                    <dd>{money(totals.taxCents / 100)}</dd>
                  </div>
                  <div className="pos-grand-total">
                    <dt>{totals.totalCents < 0 ? 'Payout total' : 'Total'}</dt>
                    <dd>{money(totals.totalCents / 100)}</dd>
                  </div>
                </dl>
                {cart.some((l) => l.product.data.membership || l.product.data.rental) && (
                  <p className="muted">
                    This sale records payment. Member creation, renewals and rental assignments are
                    handled separately.
                  </p>
                )}
                {settings?.taxRateBps == null && cart.some((l) => l.product.data.taxable) && (
                  <p className="inline-error">
                    The owner must configure sales tax before checkout.
                  </p>
                )}
                <button
                  className="primary pos-pay-button"
                  disabled={
                    locked ||
                    !register ||
                    !settings ||
                    !cart.length ||
                    cart.some(
                      (l) =>
                        !Number.isInteger(l.quantity) ||
                        (l.priceInput !== undefined &&
                          !/^\d{1,7}(\.\d{1,2})?$/.test(l.priceInput.trim())),
                    ) ||
                    (settings.taxRateBps === null && cart.some((l) => l.product.data.taxable))
                  }
                  onClick={() => {
                    setPayments(
                      totals.totalCents === 0
                        ? []
                        : [
                            {
                              method: 'cash',
                              amount: (Math.abs(totals.totalCents) / 100).toFixed(2),
                              received: (Math.abs(totals.totalCents) / 100).toFixed(2),
                              reference: '',
                            },
                          ],
                    )
                    setConfirmed(false)
                    setError('')
                    setPaying(true)
                  }}
                >
                  {totals.totalCents < 0 ? 'Record payout' : 'Take payment'}
                </button>
              </section>
            </div>
          </>
        ))}
      <dialog
        ref={paymentDialog}
        className="member-dialog pos-payment-dialog"
        aria-label="Take payment"
        onCancel={(e) => {
          e.preventDefault()
          if (!locked) setPaying(false)
        }}
      >
        <h2>{totals.totalCents < 0 ? 'Record payout' : 'Take payment'}</h2>
        <p className="pos-payment-total">{money(Math.abs(totals.totalCents) / 100)}</p>
        <p>Record payments taken outside CERMS. Do not enter card numbers or security codes.</p>
        <fieldset disabled={locked}>
          {payments.map((p, i) => (
            <div className="pos-tender" key={i}>
              <label>
                Method
                <select
                  aria-label={`Payment method ${i + 1}`}
                  value={p.method}
                  onChange={(e) => {
                    const method = e.target.value as PaymentMethod
                    setPayments((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, method, reference: '' } : r)),
                    )
                    setConfirmed(false)
                  }}
                >
                  {Object.entries(paymentMethods).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment amount
                <input
                  aria-label={`Payment amount ${i + 1}`}
                  inputMode="decimal"
                  value={p.amount}
                  onChange={(e) => {
                    setPayments((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)),
                    )
                    setConfirmed(false)
                  }}
                />
              </label>
              {p.method === 'cash' ? (
                <label>
                  {totals.totalCents < 0 ? 'Cash paid out' : 'Cash received'}
                  <input
                    aria-label="Cash received"
                    inputMode="decimal"
                    value={p.received}
                    onChange={(e) => {
                      setPayments((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, received: e.target.value } : r)),
                      )
                      setConfirmed(false)
                    }}
                  />
                </label>
              ) : (
                <label>
                  Reference (optional)
                  <input
                    aria-label={`Payment reference ${i + 1}`}
                    maxLength={120}
                    placeholder="Terminal transaction / check reference"
                    value={p.reference}
                    onChange={(e) =>
                      setPayments((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, reference: e.target.value } : r)),
                      )
                    }
                  />
                </label>
              )}
              <button
                aria-label={`Remove payment ${i + 1}`}
                onClick={() => {
                  setPayments((rows) => rows.filter((_, j) => j !== i))
                  setConfirmed(false)
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            disabled={payments.length >= 12}
            onClick={() => {
              const remaining = Math.max(0, Math.abs(totals.totalCents) - allocated)
              setPayments((rows) => [
                ...rows,
                {
                  method: rows.some((r) => r.method === 'cash') ? 'card' : 'cash',
                  amount: (remaining / 100).toFixed(2),
                  received: (remaining / 100).toFixed(2),
                  reference: '',
                },
              ])
              setConfirmed(false)
            }}
          >
            <Plus size={16} /> Add payment method
          </button>
          <dl className="pos-totals">
            <div>
              <dt>Remaining balance</dt>
              <dd>{money((Math.abs(totals.totalCents) - allocated) / 100)}</dd>
            </div>
            <div className="pos-grand-total">
              <dt>Change to give</dt>
              <dd>{money(cashChange / 100)}</dd>
            </div>
          </dl>
          {paymentError && (
            <p role="alert" className="inline-error">
              {paymentError}
            </p>
          )}
          <label className="pos-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm all payment portions{' '}
            {totals.totalCents < 0 ? 'have been paid out' : 'have been received'}
            {cashChange > 0 ? ' and the displayed change has been given' : ''}.
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button disabled={locked} onClick={() => setPaying(false)}>
            Back to cart
          </button>
          {pending ? (
            <button disabled={busy} className="primary" onClick={() => void submit(pending)}>
              Retry same sale
            </button>
          ) : (
            <button
              className="primary"
              disabled={
                busy || !confirmed || !!paymentError || allocated !== Math.abs(totals.totalCents)
              }
              onClick={() => {
                if (!register) return
                try {
                  const request: SaleRequest = {
                    business: reader.club,
                    requestId: crypto.randomUUID(),
                    registerId: register.id,
                    taxRateBps: settings?.taxRateBps ?? 0,
                    customerName: customerName.trim(),
                    note: note.trim(),
                    lines: cart.map((l) => ({
                      productId: l.product.id,
                      version: l.product.version,
                      quantity: l.quantity,
                      unitPriceCents: l.unitPriceCents,
                    })),
                    payments: payments.map((p) => ({
                      method: p.method,
                      amountCents: parsePrice(p.amount),
                      receivedCents:
                        p.method === 'cash' ? parsePrice(p.received) : parsePrice(p.amount),
                      reference: p.reference.trim(),
                    })),
                  }
                  void submit(request)
                } catch (e) {
                  setError(String(e))
                }
              }}
            >
              Complete sale
            </button>
          )}
        </div>
      </dialog>
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}
