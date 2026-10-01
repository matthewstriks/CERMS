import { useEffect, useRef, useState } from 'react'
import {
  prepareProductImage,
  type PreparedProductImage,
} from '../../../../data/firebase-product-images'
import type { CatalogClient } from '../../../../data/firebase-catalog'
export default function ProductImageEditor({
  client,
  productId,
  imagePath,
  onChange,
  onPreparing,
}: {
  client: CatalogClient
  productId: string
  imagePath?: string | null
  onChange: (image: PreparedProductImage | null) => void
  onPreparing: (busy: boolean) => void
}) {
  const [preview, setPreview] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [hasImage, setHasImage] = useState(!!imagePath)
  const revision = useRef(0),
    input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const run = ++revision.current
    if (imagePath) {
      setLoading(true)
      void client
        .getImage(productId, imagePath)
        .then((value) => {
          if (run === revision.current) setPreview(value)
        })
        .catch((failure) => {
          if (run === revision.current) setError(failure.message)
        })
        .finally(() => {
          if (run === revision.current) setLoading(false)
        })
    }
    return () => {
      revision.current++
    }
  }, [client, productId, imagePath])
  return (
    <section className="catalog-image-editor" aria-label="Product image configuration">
      <div className="catalog-image-preview">
        {preview ? (
          <img src={preview} alt="Product image preview" />
        ) : (
          <span>{loading ? 'Loading image…' : 'No image'}</span>
        )}
      </div>
      <div>
        <label>
          Product image
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const run = ++revision.current
              setError('')
              setLoading(true)
              onPreparing(true)
              try {
                const image = await prepareProductImage(file)
                if (run === revision.current) {
                  setPreview(image.preview)
                  setHasImage(true)
                  onChange(image)
                }
              } catch (failure) {
                if (run === revision.current)
                  setError(
                    failure instanceof Error ? failure.message : 'Unable to read this image.',
                  )
              } finally {
                if (run === revision.current) {
                  setLoading(false)
                  onPreparing(false)
                }
                if (input.current) input.current.value = ''
              }
            }}
          />
        </label>
        <p>JPEG, PNG or WebP · Up to 5 MB and 16 megapixels. Uploaded when you save the product.</p>
        {hasImage && (
          <button
            type="button"
            onClick={() => {
              revision.current++
              setPreview('')
              setError('')
              setLoading(false)
              onPreparing(false)
              setHasImage(false)
              if (input.current) input.current.value = ''
              onChange(null)
            }}
          >
            Remove image
          </button>
        )}
        {loading && <p role="status">Preparing image…</p>}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
