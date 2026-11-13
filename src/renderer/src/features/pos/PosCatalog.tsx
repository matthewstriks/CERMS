import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import type { CatalogProduct, CatalogCategory, CatalogRecord } from '../../../../domain/catalog'
import type { CatalogClient } from '../../../../data/firebase-catalog'
import { money } from '../../lib/data'
type Product = CatalogRecord<CatalogProduct>
type LoadImage = (product: Product) => Promise<string>
function ProductTile({
  product,
  disabled,
  onAdd,
  loadImage,
}: {
  product: Product
  disabled: boolean
  onAdd(product: Product): void
  loadImage: LoadImage
}) {
  const node = useRef<HTMLButtonElement>(null)
  const [source, setSource] = useState('')
  useEffect(() => {
    let active = true,
      started = false
    setSource('')
    if (!product.data.imagePath) return
    function load() {
      if (started) return
      started = true
      void loadImage(product)
        .then((value) => {
          if (active) setSource(value)
        })
        .catch(() => {
          // An unavailable image leaves a usable text tile.
        })
    }
    if (!node.current || typeof IntersectionObserver === 'undefined') load()
    else {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            load()
            observer.disconnect()
          }
        },
        { rootMargin: '100px' },
      )
      observer.observe(node.current)
      return () => {
        active = false
        observer.disconnect()
      }
    }
    return () => {
      active = false
    }
  }, [product.id, product.data.imagePath, loadImage])
  const p = product.data
  const price = p.askforprice ? 'Enter price' : `${p.payout ? '−' : ''}${money(p.priceCents / 100)}`
  return (
    <button
      ref={node}
      className={`pos-product${source ? ' pos-product-image' : ''}`}
      aria-label={p.name}
      title={`${p.name} · ${price}`}
      disabled={disabled || (p.inventory === 0 && !p.payout)}
      onClick={() => onAdd(product)}
    >
      {source ? <img src={source} alt="" onError={() => setSource('')} /> : <span>{p.name}</span>}
      <strong>{price}</strong>
      {!source && (
        <small>
          {p.inventory !== null ? `${p.inventory} in stock · ` : ''}
          {p.membership ? 'Membership ' : ''}
          {p.rental ? 'Rental ' : ''}
          {p.payout ? 'Payout ' : ''}
          {p.taxable ? 'Taxable' : ''}
        </small>
      )}
    </button>
  )
}
function CategorySection({
  name,
  color,
  rows,
  search,
  category,
  disabled,
  onAdd,
  loadImage,
}: {
  name: string
  color?: string
  rows: Product[]
  search: string
  category: string
  disabled: boolean
  onAdd(product: Product): void
  loadImage: LoadImage
}) {
  const [open, setOpen] = useState(() => !!(search.trim() || category))
  useEffect(() => {
    setOpen(!!(search.trim() || category))
  }, [search, category])
  return (
    <details className="pos-category" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <ChevronDown size={18} aria-hidden="true" />
        {color && <span className="pos-category-color" style={{ backgroundColor: color }} />}
        <strong>{name}</strong>
        <span className="pos-category-count">{rows.length}</span>
      </summary>
      {open && (
        <div className="pos-product-grid">
          {rows.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              disabled={disabled}
              onAdd={onAdd}
              loadImage={loadImage}
            />
          ))}
        </div>
      )}
    </details>
  )
}
export default function PosCatalog({
  client,
  rows,
  favorites,
  categories,
  search,
  category,
  disabled,
  onAdd,
}: {
  client: CatalogClient
  rows: Product[]
  favorites: Product[]
  categories: CatalogRecord<CatalogCategory>[]
  search: string
  category: string
  disabled: boolean
  onAdd(product: Product): void
}) {
  // Cache is scoped to this signed-in business/client and shared by Favorites/category tiles.
  const loadImage = useMemo<LoadImage>(() => {
    const cache = new Map<string, Promise<string>>()
    return (product) => {
      const key = `${product.id}:${product.data.imagePath}`
      let value = cache.get(key)
      if (!value) {
        value = client.getImage(product.id, product.data.imagePath!).catch((error) => {
          cache.delete(key)
          throw error
        })
        cache.set(key, value)
        if (cache.size > 64) cache.delete(cache.keys().next().value!)
      }
      return value
    }
  }, [client])
  const groups = useMemo(() => {
    const grouped = new Map<string, Product[]>()
    for (const row of rows) {
      const values = grouped.get(row.data.cat) ?? []
      values.push(row)
      grouped.set(row.data.cat, values)
    }
    return [...grouped]
      .map(([id, products]) => ({
        id,
        rows: products,
        data: categories.find((c) => c.id === id)?.data,
      }))
      .sort((a, b) =>
        (a.data?.name ?? 'Uncategorized').localeCompare(b.data?.name ?? 'Uncategorized'),
      )
  }, [rows, categories])
  return (
    <>
      <section className="pos-favorites" aria-label="Favorites">
        <h2>
          <Star size={18} aria-hidden="true" />
          Favorites
        </h2>
        {favorites.length ? (
          <div className="pos-product-grid">
            {favorites.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                disabled={disabled}
                onAdd={onAdd}
                loadImage={loadImage}
              />
            ))}
          </div>
        ) : (
          <p className="muted">Mark products as Favorite in Products to show them here.</p>
        )}
      </section>
      <div className="pos-category-list">
        {groups.map((group) => (
          <CategorySection
            key={group.id}
            name={group.data?.name ?? 'Uncategorized'}
            color={group.data?.color}
            rows={group.rows}
            search={search}
            category={category}
            disabled={disabled}
            onAdd={onAdd}
            loadImage={loadImage}
          />
        ))}
      </div>
    </>
  )
}
