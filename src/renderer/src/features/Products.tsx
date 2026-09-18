import { useEffect, useMemo, useRef, useState } from 'react'
import { useMembershipSession } from '../lib/membership-session'
import { money } from '../lib/data'
import { Badge } from '../components/ui'
import { createCatalog } from '../../../data/firebase-catalog'
import { canManageCatalog, type CatalogKind } from '../../../shared/catalog-policy'
import type { CatalogCategory, CatalogProduct, CatalogRecord } from '../../../domain/catalog'
import CatalogEditor from './products/CatalogEditor'
import './products/Products.css'
export default function Products() {
  const { reader } = useMembershipSession()
  const allowed = !!reader && canManageCatalog(reader.uid, reader.club)
  const client = useMemo(
    () => (reader && allowed ? createCatalog(reader) : null),
    [reader, allowed],
  )
  const [categories, setCategories] = useState<CatalogRecord<CatalogCategory>[]>([])
  const [products, setProducts] = useState<CatalogRecord<CatalogProduct>[]>([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('all')
  const [tab, setTab] = useState<CatalogKind>('products')
  const [editor, setEditor] = useState<{
    kind: CatalogKind
    existing?: CatalogRecord<CatalogProduct | CatalogCategory>
  } | null>(null)
  const active = useRef(true),
    pending = useRef(false)
  async function load(reset = true) {
    if (!client || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const [cats, page] = await Promise.all([
        reset ? client.categories() : Promise.resolve(null),
        client.products(reset),
      ])
      if (active.current) {
        if (cats) setCategories(cats)
        setProducts((previous) =>
          reset
            ? page.rows
            : [...previous, ...page.rows.filter((r) => !previous.some((p) => p.id === r.id))],
        )
        setMore(page.more)
        setLoaded(true)
      }
    } catch (failure) {
      if (active.current)
        setError(failure instanceof Error ? failure.message : 'Unable to load the catalog.')
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  useEffect(() => {
    active.current = true
    void load()
    return () => {
      active.current = false
    }
  }, [client])
  if (!allowed || !client)
    return (
      <section className="panel">
        <h2>Business admin access required</h2>
        <p>
          Product management is currently restricted to the owner while business permissions are
          being configured.
        </p>
      </section>
    )
  const names = new Map(categories.map((c) => [c.id, c.data.name]))
  const query = search.trim().toLowerCase()
  const rows = products.filter(
    ({ data: p }) =>
      (!category || p.cat === category) &&
      (status === 'all' || p.active === (status === 'active')) &&
      [p.name, p.desc, p.barcode, names.get(p.cat) ?? ''].some((v) =>
        v.toLowerCase().includes(query),
      ),
  )
  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Catalog sections">
          <button
            className={tab === 'products' ? 'selected' : ''}
            onClick={() => setTab('products')}
          >
            Products
          </button>
          <button
            className={tab === 'categories' ? 'selected' : ''}
            onClick={() => setTab('categories')}
          >
            Categories
          </button>
        </div>
        <Badge>Business admin · {reader!.club}</Badge>
        <button disabled={busy || !!editor} onClick={() => void load()}>
          Refresh catalog
        </button>
        <button
          className="primary"
          disabled={!loaded || busy || (tab === 'products' && !categories.length)}
          onClick={() => setEditor({ kind: tab })}
        >
          Create {tab === 'products' ? 'product' : 'category'}
        </button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Loading catalog…</p>}
      {loaded && tab === 'products' && (
        <>
          {!categories.length && (
            <div className="notice">
              Create a category first to organize your products.{' '}
              <button onClick={() => setEditor({ kind: 'categories' })}>Create category</button>
            </div>
          )}
          <div className="catalog-filters">
            <label>
              Search {more ? 'loaded ' : ''}products
              <input
                type="search"
                placeholder="Name, barcode, description or category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                aria-label="Category"
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
            </label>
            <label>
              Status
              <select
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All products</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name / category</th>
                  <th>Price</th>
                  <th>Inventory / par</th>
                  <th>Warning</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, version, data: p }) => (
                  <tr key={id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small className="catalog-secondary">
                        {names.get(p.cat) ?? 'Unknown category'}
                        {p.barcode && ` · ${p.barcode}`}
                      </small>
                    </td>
                    <td>
                      {p.askforprice
                        ? 'Ask at checkout'
                        : `${p.payout ? '−' : ''}${money(p.priceCents / 100)}`}
                    </td>
                    <td>
                      {p.inventory === null
                        ? 'Unlimited'
                        : `${p.inventory} / ${p.inventoryPar ?? '—'}`}
                    </td>
                    <td>
                      {p.invWarning ?? '—'}
                      {p.inventory !== null &&
                        p.invWarning !== null &&
                        p.inventory <= p.invWarning && <Badge tone="amber">Low stock</Badge>}
                    </td>
                    <td>{p.desc || '—'}</td>
                    <td>
                      <Badge tone={p.active ? 'green' : 'amber'}>
                        {p.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setEditor({ kind: 'products', existing: { id, version, data: p } })
                        }
                        aria-label={`Edit product ${p.name}`}
                      >
                        Edit product
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="empty">
                {products.length ? 'No loaded products match your filters.' : 'No products yet.'}
              </p>
            )}
          </div>
          <p className="page-note">
            {products.length} products loaded.
            {more
              ? ' Filters apply to loaded products. Load more to include the rest of the catalog.'
              : ''}
          </p>
          {more && (
            <button disabled={busy} onClick={() => void load(false)}>
              Load more products
            </button>
          )}
        </>
      )}
      {loaded && tab === 'categories' && (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Color</th>
                <th>Category</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span
                      className="category-swatch"
                      style={{ backgroundColor: c.data.color }}
                      aria-label={c.data.color}
                    />
                  </td>
                  <td>{c.data.name}</td>
                  <td>{c.data.desc || '—'}</td>
                  <td>
                    <button
                      onClick={() => setEditor({ kind: 'categories', existing: c })}
                      aria-label={`Edit category ${c.data.name}`}
                    >
                      Edit category
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!categories.length && <p className="empty">No categories yet.</p>}
        </div>
      )}
      {editor && (
        <CatalogEditor
          kind={editor.kind}
          existing={editor.existing}
          categories={categories}
          client={client}
          onClose={() => setEditor(null)}
          onSaved={(record) => {
            const replace = <T,>(rows: CatalogRecord<T>[], item: CatalogRecord<T>) =>
              [...rows.filter((r) => r.id !== item.id), item].sort((a, b) =>
                (a.data as CatalogCategory).name.localeCompare((b.data as CatalogCategory).name),
              )
            if (editor.kind === 'products')
              setProducts((rows) => replace(rows, record as CatalogRecord<CatalogProduct>))
            else setCategories((rows) => replace(rows, record as CatalogRecord<CatalogCategory>))
            setNotice(`${editor.kind === 'products' ? 'Product' : 'Category'} saved.`)
            setEditor(null)
          }}
        />
      )}
    </>
  )
}
