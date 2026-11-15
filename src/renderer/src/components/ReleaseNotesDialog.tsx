import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { releaseNotesBlocks } from '../../../shared/release-notes'
export default function ReleaseNotesDialog({
  version,
  notes,
  onClose,
}: {
  version: string
  notes?: string
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="member-dialog release-notes-dialog"
      aria-label="What's new"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="dialog-heading">
        <h2>What's new in CERMS {version}</h2>
        <button className="icon-button" aria-label="Close release notes" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="release-notes-body">
        {notes ? (
          releaseNotesBlocks(notes).map((b, i) => {
            switch (b.type) {
              case 'heading':
                return <h3 key={i}>{b.text}</h3>
              case 'paragraph':
                return <p key={i}>{b.text}</p>
              case 'code':
                return (
                  <pre key={i}>
                    <code>{b.text}</code>
                  </pre>
                )
              case 'list':
                return (
                  <ul key={i}>
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                )
              case 'ordered':
                return (
                  <ol key={i}>
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ol>
                )
            }
          })
        ) : (
          <p>No release notes were provided for this version.</p>
        )}
      </div>
      <div className="dialog-actions">
        <button onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}
