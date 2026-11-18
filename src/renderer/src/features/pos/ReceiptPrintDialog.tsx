import { useEffect, useRef, useState } from 'react'
import { validReceiptEmail } from '../../../../domain/receipt-email'

export default function ReceiptPrintDialog({
  title,
  text,
  onClose,
  printLabel = 'Print receipt',
  successMessage = 'Receipt sent to the printer.',
  failureMessage = 'The saved record can be reprinted.',
  loadError = '',
  onRetry,
  emailDelivery,
}: {
  title: string
  text: string | null
  onClose(): void
  printLabel?: string
  successMessage?: string
  failureMessage?: string
  loadError?: string
  onRetry?(): void
  emailDelivery?: {
    address: string | null
    loading: boolean
    error: string
    retry(): void
    send(address: string): Promise<void>
  }
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef(false)
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([])
  const [printer, setPrinter] = useState(() => localStorage.getItem('cerms.receiptPrinter') || '')
  const [width, setWidth] = useState<58 | 80>(() =>
    localStorage.getItem('cerms.receiptWidth') === '58' ? 58 : 80,
  )
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [delivery, setDelivery] = useState<'print' | 'email' | 'both' | 'none'>('print')
  const [confirmingEmail, setConfirmingEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [emailCompleted, setEmailCompleted] = useState(false)
  const [printed, setPrinted] = useState(false)
  const wantsEmail = !!emailDelivery && (delivery === 'email' || delivery === 'both')
  const wantsPrint = !emailDelivery || delivery === 'print' || delivery === 'both'
  const deliveryComplete = confirmingEmail && emailCompleted && (delivery !== 'both' || printed)
  useEffect(() => {
    const node = dialog.current
    let active = true
    node?.showModal()
    void window.desktop
      .receiptPrinters()
      .then((value) => {
        if (active) setPrinters(value)
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
      node?.close()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className={`member-dialog pos-receipt-dialog${emailDelivery ? ' receipt-delivery-dialog' : ''}`}
      aria-label={confirmingEmail ? 'Confirm receipt email' : title}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{confirmingEmail ? 'Confirm receipt email' : title}</h2>
      {confirmingEmail ? (
        <>
          <p>Confirm that the customer wants this receipt emailed to the address below.</p>
          <label className="receipt-email-field">
            Customer email
            <input
              aria-label="Customer email"
              type="email"
              maxLength={254}
              value={email}
              readOnly={emailCompleted}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <p className="muted">
            Changes apply to this receipt only. The customer record stays unchanged.
          </p>
        </>
      ) : text !== null ? (
        <pre className="pos-receipt">{text}</pre>
      ) : (
        !loadError && <p role="status">Loading saved closeout report…</p>
      )}
      {loadError && (
        <p role="alert" className="inline-error">
          {loadError}
        </p>
      )}
      {loadError && onRetry && (
        <button type="button" onClick={onRetry}>
          Retry loading report
        </button>
      )}
      {emailDelivery && !confirmingEmail && (
        <fieldset className="receipt-delivery-options" disabled={busy || emailCompleted || printed}>
          <legend>Receipt options</legend>
          {(
            [
              ['print', 'Print'],
              ['email', 'Email'],
              ['both', 'Email + print'],
              ['none', 'None'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="receipt-delivery"
                value={value}
                checked={delivery === value}
                disabled={
                  (value === 'email' || value === 'both') &&
                  (emailDelivery.loading || !!emailDelivery.error || !emailDelivery.address)
                }
                onChange={() => {
                  setDelivery(value)
                  setError('')
                  setNotice('')
                }}
              />
              {label}
            </label>
          ))}
          {emailDelivery.loading ? (
            <p role="status">Checking customer email…</p>
          ) : emailDelivery.error ? (
            <>
              <p role="alert">{emailDelivery.error} Printing is still available.</p>
              <button type="button" onClick={emailDelivery.retry}>
                Retry customer email
              </button>
            </>
          ) : !emailDelivery.address ? (
            <p className="muted">No email address is on file for this order’s linked customer.</p>
          ) : null}
        </fieldset>
      )}
      {wantsPrint && (
        <>
          <div className="pos-print-controls">
            <label>
              Receipt printer
              <select
                aria-label="Receipt printer"
                value={printer}
                disabled={busy}
                onChange={(event) => {
                  setPrinter(event.target.value)
                  localStorage.setItem('cerms.receiptPrinter', event.target.value)
                }}
              >
                <option value="">System print dialog</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Paper width
              <select
                aria-label="Paper width"
                value={width}
                disabled={busy}
                onChange={(event) => {
                  setWidth(Number(event.target.value) as 58 | 80)
                  localStorage.setItem('cerms.receiptWidth', event.target.value)
                }}
              >
                <option value="80">80 mm (Rongta RP326)</option>
                <option value="58">58 mm</option>
              </select>
            </label>
          </div>
          <p className="muted">
            Select the installed receipt-printer driver. Paper size and cutter settings come from
            that driver.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" data-notification-sound>
          {notice}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onClose}>
          Done
        </button>
        {confirmingEmail && !emailCompleted && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmingEmail(false)
              setError('')
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={
            busy ||
            text === null ||
            !!loadError ||
            deliveryComplete ||
            (wantsEmail &&
              !confirmingEmail &&
              (!emailDelivery?.address || emailDelivery.loading || !!emailDelivery.error))
          }
          onClick={async () => {
            if (pending.current || text === null || loadError) return
            if (emailDelivery && delivery === 'none') {
              onClose()
              return
            }
            if (wantsEmail && !confirmingEmail) {
              setEmail(emailDelivery!.address || '')
              setConfirmingEmail(true)
              setError('')
              return
            }
            const address = email.trim()
            if (wantsEmail && !emailCompleted && !validReceiptEmail(address)) {
              setError('Enter one valid customer email address.')
              return
            }
            pending.current = true
            setBusy(true)
            setError('')
            setNotice('')
            let sent = emailCompleted
            try {
              if (wantsEmail && !sent) {
                await emailDelivery!.send(address)
                setEmailCompleted(true)
                sent = true
              }
              if (wantsPrint && (!wantsEmail || !printed)) {
                await window.desktop.printReceipt({ text, printer, width })
                setPrinted(true)
              }
              setNotice(
                wantsEmail
                  ? delivery === 'both'
                    ? 'Receipt emailed and sent to the printer.'
                    : 'Receipt email sent.'
                  : successMessage,
              )
            } catch (error) {
              setError(
                `${sent ? 'Receipt email sent. ' : ''}${error instanceof Error ? error.message : 'Receipt delivery failed.'} ${failureMessage}`,
              )
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          {busy
            ? wantsEmail
              ? 'Delivering receipt…'
              : 'Printing…'
            : deliveryComplete
              ? 'Receipt delivered'
              : wantsEmail
                ? !confirmingEmail
                  ? 'Review email'
                  : emailCompleted
                    ? 'Retry printing'
                    : 'Confirm and send'
                : emailDelivery && delivery === 'none'
                  ? 'Finish without receipt'
                  : printLabel}
        </button>
      </div>
    </dialog>
  )
}
