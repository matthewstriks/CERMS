import { useEffect, useRef, useState } from 'react'
import type { StaffContact } from '../../../../domain/messaging'
import type { MessagingClient } from '../../../../data/firebase-messaging'
export default function NewConversation({
  client,
  onStarted,
  onClose,
}: {
  client: MessagingClient
  onStarted(id: string): void
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    starting = useRef(false)
  const [staff, setStaff] = useState<StaffContact[]>([]),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void client
      .directory()
      .then((rows) => {
        if (active) {
          setStaff(rows)
          setSelected((selected) => selected.filter((id) => rows.some((s) => s.uid === id)))
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [client, revision])
  const needle = search.trim().toLocaleLowerCase(),
    matches = staff.filter((s) => `${s.name} ${s.uid}`.toLocaleLowerCase().includes(needle))
  async function start() {
    if (!selected.length || starting.current) return
    starting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await client.start(selected)
      onStarted(result.chatId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversation could not be started.')
    } finally {
      starting.current = false
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="member-dialog new-conversation"
      aria-label="New staff conversation"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <h2>New conversation</h2>
      <p>Choose staff in your business. Select several people for a group conversation.</p>
      <label>
        Search staff
        <input
          autoFocus
          type="search"
          aria-label="Search staff"
          placeholder="Name or staff ID"
          maxLength={200}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={busy || loading}
        />
      </label>
      {loading && <p role="status">Loading staff…</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {error && !loading && (
        <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
          Refresh staff
        </button>
      )}
      <div className="staff-choices">
        {matches.map((s) => (
          <label key={s.uid} className="staff-choice">
            <input
              type="checkbox"
              checked={selected.includes(s.uid)}
              disabled={busy || (!selected.includes(s.uid) && selected.length >= 9)}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked ? [...v, s.uid] : v.filter((id) => id !== s.uid),
                )
              }
            />
            <span>
              <strong>{s.name}</strong>
              <small>Staff ID: {s.uid}</small>
            </span>
          </label>
        ))}
      </div>
      {!loading && !error && !matches.length && (
        <p>
          {staff.length
            ? 'No staff match this search.'
            : 'No other staff are available in this business.'}
        </p>
      )}
      <p>{selected.length} of 9 recipients selected</p>
      <div className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy || loading || !selected.length}
          onClick={() => void start()}
        >
          {busy ? 'Opening…' : 'Open conversation'}
        </button>
      </div>
    </dialog>
  )
}
