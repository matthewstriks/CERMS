import { useEffect, useRef, useState } from 'react'
import { createPos } from '../../../../data/firebase-pos'
import type { MembershipReader } from '../../../../data/membership-contracts'
import { money } from '../../lib/data'
import { isPosRequest, posEndpoints } from '../../../../shared/pos-policy'

interface PendingDrop {
  requestId: string
  registerId: string
  business: string
  amountCents: number
  note: string
}

export default function CashDropDialog({
  reader,
  registerId,
  onClose,
  onSaved,
}: {
  reader: Pick<MembershipReader, 'uid' | 'club'>
  registerId: string
  onClose(): void
  onSaved(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const requestId = useRef(crypto.randomUUID())
  const key = `cerms.cash-drop.v1.${reader.uid}.${reader.club}.${registerId}`
  const [pending, setPending] = useState<PendingDrop | null>(() => {
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null') as PendingDrop | null
      return data?.business === reader.club &&
        data.registerId === registerId &&
        isPosRequest(posEndpoints.cashDrop, JSON.stringify({ data }))
        ? data
        : null
    } catch {
      return null
    }
  })
  const [amount, setAmount] = useState(() =>
    pending ? (pending.amountCents / 100).toFixed(2) : '',
  )
  const [note, setNote] = useState(() => pending?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  const cents = /^\d+(?:\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : 0
  return (
    <dialog
      ref={dialog}
      className="member-dialog register-dialog"
      aria-label="Cash drop"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <h2>Cash drop</h2>
      <p>Remove cash from this register during the shift. It will not be expected at closeout.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          if (!Number.isSafeInteger(cents) || cents <= 0) {
            setError('Enter a positive cash amount.')
            return
          }
          setBusy(true)
          setError('')
          try {
            const request = pending ?? {
              requestId: requestId.current,
              registerId,
              business: reader.club,
              amountCents: cents,
              note: note.trim(),
            }
            // Persist before submission: navigation/restart must retrieve the same result.
            localStorage.setItem(key, JSON.stringify(request))
            setPending(request)
            await createPos(reader).cashDrop(request)
            localStorage.removeItem(key)
            onSaved()
          } catch (failure) {
            if (
              failure &&
              typeof failure === 'object' &&
              'definitive' in failure &&
              failure.definitive === true
            ) {
              localStorage.removeItem(key)
              setPending(null)
            }
            setError(failure instanceof Error ? failure.message : 'Cash drop was not confirmed.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Amount
            <input
              aria-label="Cash drop amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              readOnly={!!pending}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <p className="register-total">
            Drop total: <strong>{money(cents / 100)}</strong>
          </p>
          <label className="register-closing-note">
            Note (optional)
            <textarea
              maxLength={500}
              value={note}
              readOnly={!!pending}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
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
              {busy ? 'Saving…' : pending ? 'Retry same cash drop' : 'Record cash drop'}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
