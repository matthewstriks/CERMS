import { useEffect, useMemo, useRef, useState } from 'react'
import { createDiscounts } from '../../../../data/firebase-discounts'
import { createCatalog } from '../../../../data/firebase-catalog'
import {
  discountCode,
  type DiscountRecord,
  type DiscountRule,
} from '../../../../shared/discount-policy'
import {
  parsePrice,
  type CatalogCategory,
  type CatalogProduct,
  type CatalogRecord,
} from '../../../../domain/catalog'
import { useMembershipSession } from '../../lib/membership-session'
import { money } from '../../lib/data'
const fresh = (): DiscountRule => ({
  code: '',
  name: '',
  description: '',
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
  maxUses: null,
  maxUsesPerMember: null,
})
const localTime = (n: number | null) => {
  if (n === null) return ''
  const d = new Date(n),
    pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export default function DiscountManager() {
  const { reader } = useMembershipSession(),
    client = useMemo(() => (reader ? createDiscounts(reader) : null), [reader]),
    catalog = useMemo(() => (reader ? createCatalog(reader) : null), [reader])
  const [rows, setRows] = useState<DiscountRecord[]>([]),
    [products, setProducts] = useState<CatalogRecord<CatalogProduct>[]>([]),
    [categories, setCategories] = useState<CatalogRecord<CatalogCategory>[]>([]),
    [moreProducts, setMoreProducts] = useState(false),
    [more, setMore] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<{ record: DiscountRecord | null } | null>(null)
  async function load(reset = true) {
    if (!client || !catalog) return
    setBusy(true)
    setError('')
    try {
      const page = await client.list(reset ? undefined : (cursor ?? undefined))
      setRows((v) => (reset ? page.rows : [...v, ...page.rows]))
      setMore(page.more)
      setCursor(page.cursor)
      if (reset) {
        const [p, c] = await Promise.all([catalog.products(true), catalog.categories()])
        setProducts(p.rows)
        setMoreProducts(p.more)
        setCategories(c)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load codes.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [client, catalog])
  if (!client || !catalog) return null
  return (
    <section className="panel discount-manager">
      <h2>Discount codes</h2>
      <div className="toolbar">
        <button disabled={busy} className="primary" onClick={() => setEditing({ record: null })}>
          Create discount code
        </button>
        <button disabled={busy} onClick={() => void load()}>
          Refresh codes
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading codes…</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Status</th>
              <th>Uses</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rule.code}>
                <td>
                  <strong>{row.rule.code}</strong>
                  <small className="pos-block">{row.rule.name}</small>
                </td>
                <td>
                  {row.rule.kind === 'percent'
                    ? `${row.rule.value / 100}%`
                    : money(row.rule.value / 100)}
                </td>
                <td>{row.archived ? 'Archived' : row.rule.active ? 'Active' : 'Inactive'}</td>
                <td>
                  {row.usedCount}
                  {row.rule.maxUses !== null ? ` / ${row.rule.maxUses}` : ''}
                </td>
                <td>
                  <button disabled={busy} onClick={() => setEditing({ record: row })}>
                    {row.archived ? 'Edit / restore' : 'Edit code'}
                  </button>
                  {!row.archived && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !confirm(
                            `Archive ${row.rule.code}? Existing receipts and use counts will stay saved.`,
                          )
                        )
                          return
                        setBusy(true)
                        try {
                          await client.archive(row.rule.code, row.version)
                          setNotice('Discount code archived.')
                          await load()
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Could not archive code.')
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Archive code
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button disabled={busy} onClick={() => void load(false)}>
          Load more codes
        </button>
      )}
      {editing && (
        <DiscountEditor
          record={editing.record}
          products={products}
          categories={categories}
          moreProducts={moreProducts}
          loadProducts={async () => {
            const p = await catalog.products(false)
            setProducts((v) => [...v, ...p.rows])
            setMoreProducts(p.more)
          }}
          onClose={() => setEditing(null)}
          save={async (rule) => {
            await client.save(rule, editing.record?.version ?? 0)
            setEditing(null)
            setNotice('Discount code saved.')
            await load()
          }}
        />
      )}
    </section>
  )
}
function DiscountEditor({
  record,
  products,
  categories,
  moreProducts,
  loadProducts,
  onClose,
  save,
}: {
  record: DiscountRecord | null
  products: CatalogRecord<CatalogProduct>[]
  categories: CatalogRecord<CatalogCategory>[]
  moreProducts: boolean
  loadProducts(): Promise<void>
  onClose(): void
  save(rule: DiscountRule): Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null),
    pending = useRef(false)
  const [rule, setRule] = useState<DiscountRule>(() => record?.rule ?? fresh()),
    [value, setValue] = useState(((record?.rule.value ?? 1000) / 100).toFixed(2)),
    [minimum, setMinimum] = useState(((record?.rule.minimumCents ?? 0) / 100).toFixed(2)),
    [cap, setCap] = useState(
      record?.rule.maxDiscountCents == null ? '' : (record.rule.maxDiscountCents / 100).toFixed(2),
    ),
    [uses, setUses] = useState(record?.rule.maxUses?.toString() ?? ''),
    [memberUses, setMemberUses] = useState(record?.rule.maxUsesPerMember?.toString() ?? ''),
    [starts, setStarts] = useState(localTime(record?.rule.startsAt ?? null)),
    [ends, setEnds] = useState(localTime(record?.rule.endsAt ?? null)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="member-dialog discount-editor"
      aria-label={record ? 'Edit discount code' : 'Create discount code'}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{record ? 'Edit discount code' : 'Create discount code'}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (pending.current) return
          pending.current = true
          setBusy(true)
          setError('')
          try {
            await save({
              ...rule,
              code: discountCode(rule.code),
              value: parsePrice(value),
              minimumCents: parsePrice(minimum),
              maxDiscountCents: cap ? parsePrice(cap) : null,
              maxUses: uses ? Number(uses) : null,
              maxUsesPerMember: memberUses ? Number(memberUses) : null,
              startsAt: starts ? new Date(starts).getTime() : null,
              endsAt: ends ? new Date(ends).getTime() : null,
            })
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Code could not be saved.')
          } finally {
            pending.current = false
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="discount-grid">
            <label>
              Code
              <input
                required
                maxLength={32}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,31}"
                disabled={!!record}
                value={rule.code}
                onChange={(e) => setRule({ ...rule, code: e.target.value })}
              />
            </label>
            <label>
              Name
              <input
                required
                maxLength={120}
                value={rule.name}
                onChange={(e) => setRule({ ...rule, name: e.target.value })}
              />
            </label>
            <label>
              Discount type
              <select
                aria-label="Discount type"
                value={rule.kind}
                onChange={(e) => setRule({ ...rule, kind: e.target.value as DiscountRule['kind'] })}
              >
                <option value="percent">Percentage off</option>
                <option value="amount">Dollar amount off</option>
              </select>
            </label>
            <label>
              {rule.kind === 'percent' ? 'Percent off' : 'Dollars off'}
              <input
                required
                type="number"
                min="0.01"
                max={rule.kind === 'percent' ? '100' : '9999999.99'}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label>
              Minimum eligible spend
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
            </label>
            <label>
              Maximum savings (optional)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            </label>
            <label>
              Starts (local time)
              <input
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
              />
            </label>
            <label>
              Ends (local time)
              <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </label>
            <label>
              Total-use limit (optional)
              <input
                type="number"
                min="1"
                step="1"
                value={uses}
                onChange={(e) => setUses(e.target.value)}
              />
            </label>
            <label>
              Uses per member (optional)
              <input
                type="number"
                min="1"
                step="1"
                value={memberUses}
                onChange={(e) => setMemberUses(e.target.value)}
              />
              <small>Requires linking an existing member at checkout.</small>
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={rule.active}
              onChange={(e) => setRule({ ...rule, active: e.target.checked })}
            />
            Active
          </label>
          <h3>Eligible items</h3>
          <p>
            Leave selections empty for all items. Selected products or categories qualify; item
            types further limit them. Payouts and waived items never qualify.
          </p>
          <div className="discount-grid">
            <label>
              Products
              <select
                aria-label="Eligible products"
                multiple
                size={6}
                value={rule.productIds}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    productIds: Array.from(e.target.selectedOptions, (o) => o.value),
                  })
                }
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.data.name}
                  </option>
                ))}
                {rule.productIds
                  .filter((id) => !products.some((p) => p.id === id))
                  .map((id) => (
                    <option key={id} value={id}>
                      Saved product: {id}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Categories
              <select
                aria-label="Eligible categories"
                multiple
                size={6}
                value={rule.categoryIds}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    categoryIds: Array.from(e.target.selectedOptions, (o) => o.value),
                  })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.data.name}
                  </option>
                ))}
                {rule.categoryIds
                  .filter((id) => !categories.some((c) => c.id === id))
                  .map((id) => (
                    <option key={id} value={id}>
                      Saved category: {id}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {moreProducts && (
            <button
              type="button"
              onClick={() => void loadProducts().catch((e) => setError(e.message))}
            >
              Load more products
            </button>
          )}
          <div className="button-row">
            {(['retail', 'membership', 'rental'] as const).map((kind) => (
              <label key={kind}>
                <input
                  type="checkbox"
                  checked={rule.productKinds.includes(kind)}
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      productKinds: e.target.checked
                        ? [...rule.productKinds, kind]
                        : rule.productKinds.filter((k) => k !== kind),
                    })
                  }
                />
                {kind === 'retail' ? 'Retail' : kind === 'membership' ? 'Memberships' : 'Rentals'}
              </label>
            ))}
          </div>
          <label>
            Notes
            <textarea
              maxLength={500}
              value={rule.description}
              onChange={(e) => setRule({ ...rule, description: e.target.value })}
            />
          </label>
          <p>
            One code per order. Dollar savings are capped at the eligible subtotal. Refunds do not
            reset code use counts.
          </p>
          {record && (
            <p>
              Recorded uses: {record.usedCount}. Saving preserves this count and restores an
              archived code.
            </p>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save discount code'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
