import { useEffect, useRef, useState } from 'react'
import {
  durationUnits,
  parsePrice,
  productDefaults,
  validProduct,
  validCategory,
  type CatalogProduct,
  type CatalogCategory,
  type CatalogRecord,
} from '../../../../domain/catalog'
import type { CatalogClient } from '../../../../data/firebase-catalog'
import type { CatalogKind } from '../../../../shared/catalog-policy'
export default function CatalogEditor({
  kind,
  existing,
  categories,
  client,
  onSaved,
  onClose,
}: {
  kind: CatalogKind
  existing?: CatalogRecord<CatalogProduct | CatalogCategory>
  categories: CatalogRecord<CatalogCategory>[]
  client: CatalogClient
  onSaved(record: CatalogRecord<CatalogProduct | CatalogCategory>): void
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useRef(existing?.id ?? crypto.randomUUID())
  const [product, setProduct] = useState<CatalogProduct>(() =>
    existing && kind === 'products' ? (existing.data as CatalogProduct) : productDefaults(),
  )
  const [category, setCategory] = useState<CatalogCategory>(() =>
    existing && kind === 'categories'
      ? (existing.data as CatalogCategory)
      : { name: '', desc: '', color: '#dcebdd' },
  )
  const [price, setPrice] = useState((product.priceCents / 100).toFixed(2))
  const [users, setUsers] = useState(product.restrictedUsers.join('\n'))
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  const title = `${existing ? 'Edit' : 'Create'} ${kind === 'products' ? 'product' : 'category'}`
  function field<K extends keyof CatalogProduct>(key: K, value: CatalogProduct[K]) {
    setProduct((p) => ({ ...p, [key]: value }))
  }
  const toggles = {
    active: 'Product is active',
    favorite: 'Favorite',
    taxable: 'Taxable product',
    core: 'Core product',
    rental: 'Rental product',
    membership: 'Membership product',
    restricted: 'Restrict to selected staff',
    payout: 'Payout product',
    askforprice: 'Ask for payment amount',
  } as const
  return (
    <dialog
      ref={dialog}
      className="member-dialog catalog-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{title}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (pending.current) return
          setError('')
          try {
            const data =
              kind === 'categories'
                ? { ...category, name: category.name.trim(), desc: category.desc.trim() }
                : {
                    ...product,
                    name: product.name.trim(),
                    desc: product.desc.trim(),
                    barcode: product.barcode.trim(),
                    priceCents: parsePrice(price),
                    restrictedUsers: product.restricted
                      ? [...new Set(users.split(/[\s,]+/).filter(Boolean))]
                      : [],
                  }
            if (!(kind === 'categories' ? validCategory(data) : validProduct(data)))
              throw new Error(
                'Check required fields, inventory values, duration and staff IDs. Variable-price products must have a zero price.',
              )
            pending.current = true
            setBusy(true)
            const version = await client.save(kind, id.current, data, existing?.version ?? 0)
            onSaved({ id: id.current, version, data })
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to save this item.')
          } finally {
            pending.current = false
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy}>
          {kind === 'categories' ? (
            <div className="catalog-form-grid">
              <label>
                Category name
                <input
                  required
                  autoFocus
                  maxLength={200}
                  value={category.name}
                  onChange={(e) => setCategory({ ...category, name: e.target.value })}
                />
              </label>
              <label>
                Category color
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) => setCategory({ ...category, color: e.target.value })}
                />
              </label>
              <label className="full">
                Category description
                <textarea
                  maxLength={4000}
                  value={category.desc}
                  onChange={(e) => setCategory({ ...category, desc: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="catalog-form-grid">
                <label>
                  Product name
                  <input
                    required
                    autoFocus
                    maxLength={200}
                    value={product.name}
                    onChange={(e) => field('name', e.target.value)}
                  />
                </label>
                <label>
                  Product category
                  <select
                    required
                    value={product.cat}
                    onChange={(e) => field('cat', e.target.value)}
                  >
                    <option value="">Choose a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.data.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Barcode
                  <input
                    maxLength={200}
                    aria-label="Barcode"
                    value={product.barcode}
                    onChange={(e) => field('barcode', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault()
                    }}
                  />
                  <small>Click here and scan a product barcode.</small>
                </label>
                <label>
                  Price ($)
                  <input
                    required
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label className="full">
                  Product description
                  <textarea
                    maxLength={4000}
                    value={product.desc}
                    onChange={(e) => field('desc', e.target.value)}
                  />
                </label>
              </div>
              <h3>Inventory</h3>
              <div className="catalog-form-grid">
                {(['inventory', 'inventoryPar', 'invWarning'] as const).map((key, index) => (
                  <label key={key}>
                    {['Inventory amount', 'Inventory par', 'Inventory warning'][index]}
                    <input
                      type="number"
                      min={0}
                      max={1000000000}
                      step={1}
                      value={product[key] ?? ''}
                      onChange={(e) =>
                        field(key, e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="muted">
                Blank inventory means unlimited; zero means out of stock. Warning is a threshold;
                automated email alerts are not enabled yet.
              </p>
              <h3>Product options</h3>
              <div className="catalog-options">
                {Object.entries(toggles).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={product[key as keyof typeof toggles]}
                      onChange={(e) => field(key as keyof typeof toggles, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {(['rental', 'membership'] as const).map(
                (kind) =>
                  product[kind] && (
                    <div className="catalog-form-grid" key={kind}>
                      <label>
                        {kind === 'rental' ? 'Rental length' : 'Membership length'}
                        <input
                          required
                          type="number"
                          min={0.001}
                          max={1000}
                          step={0.001}
                          value={product[`${kind}LengthRaw`]}
                          onChange={(e) => field(`${kind}LengthRaw`, Number(e.target.value))}
                        />
                      </label>
                      <label>
                        {kind === 'rental' ? 'Rental unit' : 'Membership unit'}
                        <select
                          aria-label={kind === 'rental' ? 'Rental unit' : 'Membership unit'}
                          value={product[`${kind}LengthType`]}
                          onChange={(e) =>
                            field(`${kind}LengthType`, e.target.value as keyof typeof durationUnits)
                          }
                        >
                          {Object.keys(durationUnits).map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}(s)
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ),
              )}
              {(product.rental || product.membership) && (
                <p className="muted">Durations use the same fixed-time units as CERMS 4.</p>
              )}
              {product.restricted && (
                <label>
                  Allowed staff user IDs
                  <textarea required value={users} onChange={(e) => setUsers(e.target.value)} />
                  <small>
                    One user ID per line. Staff directory selection will be added with staff
                    administration.
                  </small>
                </label>
              )}
              {product.payout && (
                <p className="notice">
                  A payout represents money leaving the register. Enter a positive price.
                </p>
              )}
              {product.askforprice && (
                <p className="notice">Set price to 0 to request the amount at checkout.</p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit">
              {busy ? 'Saving…' : existing ? 'Save changes' : title}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
