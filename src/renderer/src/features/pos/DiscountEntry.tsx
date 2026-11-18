import { useEffect, useMemo, useState } from 'react'
import { createDiscounts } from '../../../../data/firebase-discounts'
import { discountCode, type DiscountQuote } from '../../../../shared/discount-policy'
import { useMembershipSession } from '../../lib/membership-session'
import { money } from '../../lib/data'
export interface AppliedDiscount extends DiscountQuote {
  cartKey: string
}
export default function DiscountEntry({
  code,
  onCode,
  cartKey,
  onQuote,
  disabled,
}: {
  code: string
  onCode(code: string): void
  cartKey: string
  onQuote(quote: AppliedDiscount | null): void
  disabled: boolean
}) {
  const { reader } = useMembershipSession(),
    client = useMemo(() => (reader ? createDiscounts(reader) : null), [reader])
  const [input, setInput] = useState(code),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState<DiscountQuote | null>(null),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    onQuote(null)
    setQuote(null)
    setError('')
    if (!code || !client) {
      setBusy(false)
      return
    }
    setBusy(true)
    const timer = setTimeout(() => {
      const d = JSON.parse(cartKey)
      void client
        .quote(code, d.lines, d.memberId)
        .then((q) => {
          if (active) {
            setQuote(q)
            onQuote({ ...q, cartKey })
          }
        })
        .catch((e) => {
          if (active) setError(e.message)
        })
        .finally(() => {
          if (active) setBusy(false)
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [code, cartKey, client, reload, onQuote])
  return (
    <section className="pos-discount" aria-label="Discount code">
      <label htmlFor="pos-discount-code">Discount code</label>
      <div className="button-row">
        <input
          id="pos-discount-code"
          maxLength={32}
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCode(discountCode(input))
              setReload((v) => v + 1)
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || !input.trim()}
          onClick={() => {
            onCode(discountCode(input))
            setReload((v) => v + 1)
          }}
        >
          Apply code
        </button>
        {code && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onCode('')
              setInput('')
            }}
          >
            Remove code
          </button>
        )}
      </div>
      {busy && <p role="status">Checking discount…</p>}
      {quote && !busy && (
        <p role="status">
          {quote.code}: {money(quote.expectedDiscountCents / 100)} off
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
