import ProductImageEditor from './ProductImageEditor'
import type { PreparedProductImage } from '../../../../data/firebase-product-images'
import { useEffect, useId, useRef, useState } from 'react'
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

const optionHelp = {
  active:
    'Makes the product available in the checkout catalog. Turn off to hide it from sales without deleting it.',
  favorite: 'Shows the product in checkout Favorites for quick access.',
  taxable: 'Adds sales tax using the business’s configured tax rate at checkout.',
  core: 'Protects the product so only staff with permission to manage core products can edit or remove it. Separate staff permissions are planned; catalog management is currently owner-only.',
  rental:
    'Treats the purchase as a rental/check-in, with a room or locker selection and an expiry based on the rental length and unit below.',
  membership:
    'Uses the length and unit below to grant or renew a membership. Adds time to a valid membership, or starts from now if it has expired.',
  restricted: 'Limits the product’s checkout visibility to the staff user IDs entered below.',
  payout:
    'Treats the amount as money paid out from the register or card terminal. Enter a positive price; checkout will use a negative amount.',
  askforprice:
    'Prompts staff to enter the amount when adding the product to an order. The saved product price must be 0.',
} as const

function ProductOption({
  option,
  label,
  checked,
  onChange,
}: {
  option: keyof typeof optionHelp
  label: string
  checked: boolean
  onChange(checked: boolean): void
}) {
  const tooltipId = useId()
  const helpButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    function dismissOnClick(event: MouseEvent) {
      if (!helpButton.current?.contains(event.target as Node)) setOpen(false)
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('click', dismissOnClick, true)
    document.addEventListener('keydown', dismissOnEscape, true)
    return () => {
      document.removeEventListener('click', dismissOnClick, true)
      document.removeEventListener('keydown', dismissOnEscape, true)
    }
  }, [open])
  return (
    <div className="catalog-option">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      <button
        ref={helpButton}
        type="button"
        className="catalog-option-help"
        aria-label={`About ${label.toLowerCase()}`}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      <span id={tooltipId} role="tooltip" className="catalog-option-tooltip" hidden={!open}>
        {optionHelp[option]}
      </span>
    </div>
  )
}

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
  const [imagePreparing, setImagePreparing] = useState(false)
  const [selectedImage, setSelectedImage] = useState<PreparedProductImage | null>(null)
  const uploadedImage = useRef<{ image: PreparedProductImage; path: string } | null>(null)
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
          if (pending.current || imagePreparing) return
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
            if (kind === 'products' && selectedImage) {
              if (uploadedImage.current?.image !== selectedImage)
                uploadedImage.current = {
                  image: selectedImage,
                  path: await client.uploadImage(id.current, selectedImage),
                }
              ;(data as CatalogProduct).imagePath = uploadedImage.current.path
            }
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
              <ProductImageEditor
                client={client}
                productId={id.current}
                onPreparing={setImagePreparing}
                imagePath={(existing?.data as CatalogProduct | undefined)?.imagePath}
                onChange={(image) => {
                  setSelectedImage(image)
                  uploadedImage.current = null
                  if (!image) field('imagePath', null)
                }}
              />
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
              <p className="muted">
                Click an option’s ? for details. Checkout behavior follows CERMS 4 and is planned
                for CERMS 5; these settings currently save to the catalog.
              </p>
              <div className="catalog-options">
                {Object.entries(toggles).map(([key, label]) => (
                  <ProductOption
                    key={key}
                    option={key as keyof typeof toggles}
                    label={label}
                    checked={product[key as keyof typeof toggles]}
                    onChange={(checked) => field(key as keyof typeof toggles, checked)}
                  />
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
            <button className="primary" type="submit" disabled={imagePreparing}>
              {busy ? 'Saving…' : existing ? 'Save changes' : title}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
