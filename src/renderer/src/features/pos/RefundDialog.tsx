import { useEffect, useMemo, useRef, useState } from 'react'
import type { PosClient } from '../../../../data/firebase-pos'
import { createRegisters } from '../../../../data/firebase-registers'
import { parsePrice } from '../../../../domain/catalog'
import { paymentMethods, type SaleReceipt } from '../../../../domain/pos'
import {
  refundLineAmounts,
  refundMethods,
  type RefundQuote,
  type RefundRequest,
} from '../../../../shared/refund-policy'
import { useMembershipSession } from '../../lib/membership-session'
import { money } from '../../lib/data'
export default function RefundDialog({
  receipt,
  client,
  pendingKey,
  onClose,
  onSaved,
}: {
  receipt: SaleReceipt
  client: PosClient
  pendingKey: string
  onClose(): void
  onSaved(receipt: SaleReceipt): void
}) {
  const { reader } = useMembershipSession(),
    ref = useRef<HTMLDialogElement>(null),
    saving = useRef(false)
  const [quote, setQuote] = useState<RefundQuote | null>(null),
    [registerId, setRegisterId] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false)
  const [lines, setLines] = useState(
    receipt.lines.map((_, index) => ({ index, quantity: 0, restock: false, cancelService: false })),
  )
  const [payments, setPayments] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<RefundRequest | null>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(pendingKey) || 'null')
      return d?.saleId === receipt.id ? d : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    return () => node?.close()
  }, [])
  useEffect(() => {
    let active = true
    if (reader)
      void Promise.all([client.refundQuote(receipt.id), createRegisters(reader).own()])
        .then(([q, register]) => {
          if (active) {
            setQuote(q)
            setRegisterId(register?.id ?? '')
            if (!register && !pending)
              setError('Open your own register in Registers before issuing a refund.')
          }
        })
        .catch((e) => {
          if (active) setError(e.message)
        })
    return () => {
      active = false
    }
  }, [client, receipt.id, reader])
  const amounts = useMemo(() => {
    try {
      return lines.reduce(
        (sum, l) => {
          if (l.quantity <= 0) return sum
          const amount = refundLineAmounts(
            receipt.lines[l.index]!,
            quote?.returnedQuantities[l.index] ?? 0,
            l.quantity,
          )
          return {
            subtotalCents: sum.subtotalCents + amount.subtotalCents,
            taxCents: sum.taxCents + amount.taxCents,
            totalCents: sum.totalCents + amount.totalCents,
          }
        },
        { subtotalCents: 0, taxCents: 0, totalCents: 0 },
      )
    } catch {
      return null
    }
  }, [lines, quote, receipt])
  useEffect(() => {
    if (!quote || !amounts || pending) return
    let remaining = amounts.totalCents
    const result: Record<string, string> = {}
    for (const method of refundMethods) {
      const amount = Math.min(remaining, quote.remainingByMethod[method])
      result[method] = (amount / 100).toFixed(2)
      remaining -= amount
    }
    setPayments(result)
  }, [quote, amounts?.totalCents, pending])
  const frozen = busy || !!pending
  return (
    <dialog
      ref={ref}
      className="member-dialog refund-dialog"
      aria-label="Return / refund"
      onCancel={(e) => {
        e.preventDefault()
        if (!saving.current) onClose()
      }}
    >
      <h2>Return / refund</h2>
      <p>
        {receipt.customerName || 'Walk-in'} · Original total {money(receipt.totalCents / 100)}
      </p>
      {pending ? (
        <p role="status">
          An earlier refund needs confirmation. Retry this same request; do not issue the payment
          again.
        </p>
      ) : (
        <p>
          Select returned items. Refunds are recorded here; card refunds must be completed on your
          terminal.
        </p>
      )}
      {!quote && !error && <p role="status">Loading remaining quantities…</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (saving.current || !quote || !reader) return
          saving.current = true
          setBusy(true)
          setError('')
          try {
            let request = pending
            if (!request) {
              if (!amounts) throw Error('Check return quantities.')
              request = {
                action: 'refund',
                business: reader.club,
                saleId: receipt.id,
                registerId,
                requestId: crypto.randomUUID(),
                expectedRevision: quote.revision,
                reason,
                confirmed: true,
                lines: lines.filter((l) => l.quantity > 0),
                payments: refundMethods
                  .map((method) => ({
                    method,
                    amountCents: parsePrice(payments[method] || '0'),
                    reference: '',
                  }))
                  .filter((p) => p.amountCents > 0),
              }
              localStorage.setItem(pendingKey, JSON.stringify(request))
              setPending(request)
            }
            const result = await client.refund(request),
              saved = await client.receipt(result.saleId)
            if (!saved)
              throw Error('Refund is saved but its receipt could not load. Retry to reopen it.')
            localStorage.removeItem(pendingKey)
            setPending(null)
            onSaved(saved)
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Refund was not confirmed.')
            if ((failure as { definitive?: boolean })?.definitive) {
              localStorage.removeItem(pendingKey)
              setPending(null)
            }
          } finally {
            saving.current = false
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={frozen || !quote}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Return quantity</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((l, index) => {
                  const row = lines[index]!,
                    remaining = l.quantity - (quote?.returnedQuantities[index] ?? 0)
                  return (
                    <tr key={index}>
                      <td>
                        {l.name}
                        <small className="pos-block">{remaining} remaining</small>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          step={1}
                          aria-label={`Return quantity for ${l.name}`}
                          value={row.quantity}
                          onChange={(e) =>
                            setLines((rows) =>
                              rows.map((r, i) =>
                                i === index ? { ...r, quantity: Number(e.target.value) } : r,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        {quote?.restockable[index] && (
                          <label>
                            <input
                              type="checkbox"
                              checked={row.restock}
                              onChange={(e) =>
                                setLines((rows) =>
                                  rows.map((r, i) =>
                                    i === index ? { ...r, restock: e.target.checked } : r,
                                  ),
                                )
                              }
                            />
                            Restock returned items
                          </label>
                        )}
                        {(l.membership || l.rental) && (
                          <label>
                            <input
                              type="checkbox"
                              checked={row.cancelService}
                              onChange={(e) =>
                                setLines((rows) =>
                                  rows.map((r, i) =>
                                    i === index ? { ...r, cancelService: e.target.checked } : r,
                                  ),
                                )
                              }
                            />
                            {l.membership ? 'Undo membership purchase' : 'Cancel related rentals'}
                            <small className="pos-block">
                              Requires returning every remaining unit. Rental items must be
                              recovered.
                            </small>
                          </label>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p>
            Refund tax: {money((amounts?.taxCents ?? 0) / 100)} ·{' '}
            <strong>Total refund: {money((amounts?.totalCents ?? 0) / 100)}</strong>
          </p>
          <div className="refund-payments">
            {refundMethods
              .filter((m) => (quote?.remainingByMethod[m] ?? 0) > 0)
              .map((method) => (
                <label key={method}>
                  {paymentMethods[method]} refund
                  <input
                    type="number"
                    min="0"
                    max={(quote!.remainingByMethod[method] / 100).toFixed(2)}
                    step="0.01"
                    value={payments[method] ?? '0.00'}
                    onChange={(e) => setPayments((p) => ({ ...p, [method]: e.target.value }))}
                  />
                  <small>
                    Up to {money(quote!.remainingByMethod[method] / 100)} on the original payment
                    method.
                  </small>
                </label>
              ))}
          </div>
          <label>
            Reason
            <textarea
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm the refund payments and have recovered any returned or cancelled rental items.
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Close
          </button>
          <button
            className="danger"
            type="submit"
            disabled={
              busy ||
              !quote ||
              (!pending &&
                (!registerId || !confirmed || !lines.some((l) => l.quantity > 0) || !amounts))
            }
          >
            {busy ? 'Saving…' : pending ? 'Retry same refund' : 'Record refund'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
