import { useEffect, useRef, useState } from 'react'

export default function ReceiptPrintDialog({
  title,
  text,
  onClose,
  printLabel = 'Print receipt',
  successMessage = 'Receipt sent to the printer.',
  failureMessage = 'The saved record can be reprinted.',
  loadError = '',
  onRetry,
}: {
  title: string
  text: string | null
  onClose(): void
  printLabel?: string
  successMessage?: string
  failureMessage?: string
  loadError?: string
  onRetry?(): void
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
      className="member-dialog pos-receipt-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{title}</h2>
      {text !== null ? (
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
        Select the installed receipt-printer driver. Paper size and cutter settings come from that
        driver.
      </p>
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
        <button
          type="button"
          className="primary"
          disabled={busy || text === null || !!loadError}
          onClick={async () => {
            if (pending.current || text === null || loadError) return
            pending.current = true
            setBusy(true)
            setError('')
            setNotice('')
            try {
              await window.desktop.printReceipt({ text, printer, width })
              setNotice(successMessage)
            } catch (error) {
              setError(
                `${error instanceof Error ? error.message : 'Printing failed.'} ${failureMessage}`,
              )
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          {busy ? 'Printing…' : printLabel}
        </button>
      </div>
    </dialog>
  )
}
