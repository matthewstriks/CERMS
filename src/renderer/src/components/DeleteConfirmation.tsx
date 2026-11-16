import { useEffect, useRef, useState } from 'react'

export default function DeleteConfirmation({
  title,
  name,
  description,
  onDelete,
  onClose,
  onDeleted,
}: {
  title: string
  name: string
  description: string
  onDelete(): Promise<void>
  onClose(): void
  onDeleted(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      data-notification-sound="delete-confirmation"
      ref={dialog}
      className="member-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{title}</h2>
      <p>
        Permanently delete <strong>{name}</strong>?
      </p>
      <p>{description}</p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          disabled={busy}
          className="danger"
          onClick={async () => {
            if (pending.current) return
            pending.current = true
            setBusy(true)
            setError('')
            try {
              await onDelete()
              onDeleted()
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : 'Deletion failed.')
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </dialog>
  )
}
