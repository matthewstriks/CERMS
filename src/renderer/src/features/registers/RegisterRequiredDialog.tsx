import { useEffect, useRef } from 'react'

export default function RegisterRequiredDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      data-notification-sound
      ref={dialog}
      className="member-dialog"
      aria-label="Register required"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2>Register required</h2>
      <p>You don’t have an active register. An open register is required to complete this order.</p>
      <p>
        Ask an administrator to enable your Open registers permission. Your order details will be
        kept.
      </p>
      <div className="dialog-actions">
        <button onClick={onClose}>Back to order</button>
      </div>
    </dialog>
  )
}
