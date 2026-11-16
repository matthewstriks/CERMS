import { useEffect, useRef, useState } from 'react'
import { createPos } from '../../../../data/firebase-pos'
import type { MembershipReader } from '../../../../data/membership-contracts'
import { money } from '../../lib/data'

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
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
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
            await createPos(reader).cashDrop({
              requestId: requestId.current,
              registerId,
              amountCents: cents,
              note: note.trim(),
            })
            onSaved()
          } catch (failure) {
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
              {busy ? 'Saving…' : 'Record cash drop'}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
