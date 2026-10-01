import { useEffect, useRef, useState } from 'react'
import { receiptText, type SaleReceipt } from '../../../../domain/pos'
export default function ReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: SaleReceipt
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([]),
    [printer, setPrinter] = useState(() => localStorage.getItem('cerms.receiptPrinter') || ''),
    [width, setWidth] = useState<58 | 80>(() =>
      localStorage.getItem('cerms.receiptWidth') === '58' ? 58 : 80,
    ),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    void window.desktop
      .receiptPrinters()
      .then(setPrinters)
      .catch((e) => setError(String(e)))
    return () => dialog.current?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="member-dialog pos-receipt-dialog"
      aria-label="Sale receipt"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <h2>Sale receipt</h2>
      <pre className="pos-receipt">{receiptText(receipt)}</pre>
      <div className="pos-print-controls">
        <label>
          Receipt printer
          <select
            aria-label="Receipt printer"
            value={printer}
            onChange={(e) => {
              setPrinter(e.target.value)
              localStorage.setItem('cerms.receiptPrinter', e.target.value)
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
            onChange={(e) => {
              setWidth(Number(e.target.value) as 58 | 80)
              localStorage.setItem('cerms.receiptWidth', e.target.value)
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
      {notice && <p role="status">{notice}</p>}
      <div className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Done
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            setNotice('')
            try {
              await window.desktop.printReceipt({ text: receiptText(receipt), printer, width })
              setNotice('Receipt sent to the printer.')
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Printing failed. The sale is saved and can be reprinted.',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Printing…' : 'Print receipt'}
        </button>
      </div>
    </dialog>
  )
}
