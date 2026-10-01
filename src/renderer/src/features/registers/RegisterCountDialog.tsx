import RegisterLedger from '../pos/RegisterLedger'
import { useEffect, useRef, useState } from 'react'
import {
  cashTotal,
  denominations,
  emptyCashCounts,
  type CashCounts,
  type RegisterRecord,
} from '../../../../domain/registers'
import { registerError, type RegisterClient } from '../../../../data/firebase-registers'
import { money } from '../../lib/data'

export default function RegisterCountDialog({
  mode,
  record,
  client,
  onClose,
  onSaved,
}: {
  mode: 'open' | 'close' | 'view'
  record?: RegisterRecord
  client: RegisterClient
  onClose(): void
  onSaved(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const requestId = useRef(crypto.randomUUID())
  const pending = useRef(false)
  const [counts, setCounts] = useState<CashCounts>(emptyCashCounts)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const title =
    mode === 'open' ? 'Open register' : mode === 'close' ? 'Close register' : 'Register counts'
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  let total: number | null = null
  try {
    total = cashTotal(counts)
  } catch {
    /* Keep invalid input visible for correction. */
  }
  const time = (value: number | null) =>
    value === null ? 'Still open' : new Date(value).toLocaleString()
  return (
    <dialog
      ref={dialog}
      className="member-dialog register-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{title}</h2>
      {record && (
        <p>
          {record.ownerName || record.ownerUid} · Opened {time(record.openedAt)}
        </p>
      )}
      {mode === 'view' && record ? (
        <>
          <p>{record.status === 'closed' ? `Closed ${time(record.closedAt)}` : 'Currently open'}</p>
          {record.status === 'closed' && (
            <p>Closed by: {record.closedByName || record.closedByUid || 'Not recorded'}</p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Denomination</th>
                  <th>Opening count</th>
                  <th>Closing count</th>
                </tr>
              </thead>
              <tbody>
                {denominations.map(({ key, label }) => (
                  <tr key={key}>
                    <th>{label}</th>
                    <td>{record.openingCounts[key]}</td>
                    <td>{record.closingCounts?.[key] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Cash total</th>
                  <td>{money(record.openingTotalCents / 100)}</td>
                  <td>
                    {record.closingTotalCents === null
                      ? '—'
                      : money(record.closingTotalCents / 100)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {record.closingTotalCents !== null && (
            <p>
              Cash change:{' '}
              <strong>{money((record.closingTotalCents - record.openingTotalCents) / 100)}</strong>
            </p>
          )}
          <RegisterLedger record={record} />
          {record.closeNote && <p className="register-note">Closing note: {record.closeNote}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending.current) return
            pending.current = true
            setBusy(true)
            setError('')
            try {
              if (mode === 'open') await client.open(requestId.current, counts)
              else if (record) await client.close(record.id, counts, note.trim())
              else throw new Error('No register selected.')
              onSaved()
            } catch (failure) {
              setError(registerError(failure))
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          <p>Enter the number of bills and coins in the drawer. Blank counts mean zero.</p>
          <fieldset disabled={busy}>
            <legend>{mode === 'open' ? 'Opening cash count' : 'Ending cash count'}</legend>
            <div className="register-denominations">
              {denominations.map(({ key, label, cents }) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    aria-label={label}
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    inputMode="numeric"
                    placeholder="0"
                    value={counts[key] === 0 ? '' : Number.isNaN(counts[key]) ? '' : counts[key]}
                    onChange={(event) =>
                      setCounts((previous) => ({
                        ...previous,
                        [key]: event.target.value === '' ? 0 : event.target.valueAsNumber,
                      }))
                    }
                  />
                  <small>
                    {Number.isSafeInteger(counts[key]) && counts[key] >= 0
                      ? money((counts[key] * cents) / 100)
                      : 'Invalid count'}
                  </small>
                </label>
              ))}
            </div>
            <div className="register-total" role="status">
              {mode === 'open' ? 'Opening total' : 'Ending total'}{' '}
              <strong>{total === null ? 'Check counts' : money(total / 100)}</strong>
            </div>
            {mode === 'close' && record && (
              <>
                <p>
                  Opening total: {money(record.openingTotalCents / 100)} · Cash change:{' '}
                  {total === null ? '—' : money((total - record.openingTotalCents) / 100)}
                </p>
                <RegisterLedger record={record} counted={total} />
                <label className="register-closing-note">
                  Closing note (optional)
                  <textarea
                    maxLength={2000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
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
              <button className="primary" type="submit" disabled={total === null}>
                {busy
                  ? 'Saving…'
                  : mode === 'open'
                    ? 'Open register'
                    : 'Save ending count and close'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </dialog>
  )
}
