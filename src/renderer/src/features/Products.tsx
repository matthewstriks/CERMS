import { useState } from 'react'
import { Package, Search } from 'lucide-react'
import { useQuery, useRepository, money } from '../lib/data'
import { Badge, QueryState } from '../components/ui'
export default function Products() {
  const repository = useRepository()
  const [search, setSearch] = useState('')
  const { data, loading, error } = useQuery(() => repository.listProducts(), [repository])
  const products = data?.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search products"
            placeholder="Search your catalog…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Badge>Sample catalog</Badge>
      </div>
      <QueryState loading={loading} error={error} />
      <div className="product-grid">
        {products?.map((product) => (
          <article className="panel product-card" key={product.id}>
            <div className="product-heading">
              <span className="product-icon">
                <Package size={25} />
              </span>
              <Badge>{product.kind}</Badge>
            </div>
            <h2>{product.name}</h2>
            <div className="product-price">{money(product.price)}</div>
            <div className="product-footer">
              <span>
                {product.inventory === null
                  ? 'Inventory not tracked'
                  : `${product.inventory} in stock`}
              </span>
              <Badge tone="green">Active</Badge>
            </div>
          </article>
        ))}
      </div>
      {products?.length === 0 && <div className="empty">No products match your search.</div>}
      <p className="page-note">
        Sample prices only. Catalog editing and inventory adjustments will be added with sales.
      </p>
    </>
  )
}
