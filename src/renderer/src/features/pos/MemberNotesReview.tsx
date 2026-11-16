import { useEffect, useRef, useState } from 'react'
import type { MemberNotesState } from '../../../../data/firebase-member-notes'
import { NoteEntries } from '../members/MemberNotes'
export default function MemberNotesReview({
  state,
  onConfirm,
  onCancel,
}: {
  state: MemberNotesState
  onConfirm(): void
  onCancel(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  return (
    <dialog
      data-notification-sound="required-member-notes"
      ref={dialog}
      className="member-dialog member-notes-review"
      aria-label="Read member notes"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      <h2>Read member notes</h2>
      <p>{state.name}</p>
      {state.dna && (
        <p className="member-note-dna">
          DNA · Do not admit. Reading notes does not authorize admission.
        </p>
      )}
      <NoteEntries notes={state.notes} />
      <p>Review all notes before continuing this order.</p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        I have read these member notes
      </label>
      <div className="dialog-actions">
        <button onClick={onCancel}>Cancel order action</button>
        <button className="primary" disabled={!confirmed} onClick={onConfirm}>
          Confirm read
        </button>
      </div>
    </dialog>
  )
}
