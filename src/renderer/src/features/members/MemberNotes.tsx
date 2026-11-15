import { useEffect, useMemo, useRef, useState } from 'react'
import type { MembershipReader } from '../../../../data/membership-contracts'
import {
  createMemberNotes,
  type MemberNotesState,
  type MemberNote,
} from '../../../../data/firebase-member-notes'
import { hasStaffPermission } from '../../../../domain/staff-permissions'
import './MemberNotes.css'
export function NoteEntries({
  notes,
  onRemove,
}: {
  notes: MemberNote[]
  onRemove?(id: string): void
}) {
  return (
    <div className="member-note-log">
      {notes.length ? (
        notes.map((n) => (
          <article
            key={n.id}
            className={`member-note ${n.kind === 'dna' ? 'member-note-dna' : ''}`}
          >
            <div className="member-note-meta">
              <strong>
                {n.kind === 'dna'
                  ? 'DNA · Do not admit'
                  : n.kind === 'dna-cleared'
                    ? 'DNA cleared'
                    : n.kind === 'legacy'
                      ? 'Existing note'
                      : 'Staff note'}
              </strong>
              {n.actorName && <span>{n.actorName}</span>}
              {n.createdAt !== null && (
                <time dateTime={new Date(n.createdAt).toISOString()}>
                  {new Date(n.createdAt).toLocaleString()}
                </time>
              )}
            </div>
            <p>{n.text}</p>
            {onRemove && (
              <button type="button" onClick={() => onRemove(n.id)}>
                Remove note
              </button>
            )}
          </article>
        ))
      ) : (
        <p className="muted">No notes recorded.</p>
      )}
    </div>
  )
}
export default function MemberNotes({
  reader,
  memberId,
  onChanged,
}: {
  reader: MembershipReader
  memberId: string
  onChanged?(dna: boolean): void
}) {
  const client = useMemo(() => createMemberNotes(reader, memberId), [reader, memberId])
  const [state, setState] = useState<MemberNotesState | null>(null)
  const [text, setText] = useState(''),
    [reason, setReason] = useState('')
  const [dna, setDna] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    id: string
    action: 'add' | 'dna'
    text: string
    enabled: boolean
    expectedDna: boolean
  } | null>(null)
  const saving = useRef(false)
  async function load() {
    const result = await client.list()
    setState(result)
    setDna(result.dna)
    onChanged?.(result.dna)
  }
  useEffect(() => {
    let current = true
    setState(null)
    setError('')
    void client
      .list()
      .then((result) => {
        if (current) {
          setState(result)
          setDna(result.dna)
          onChanged?.(result.dna)
        }
      })
      .catch((e) => {
        if (current) setError(e.message)
      })
    return () => {
      current = false
    }
  }, [client])
  async function mutate(action: 'add' | 'dna' | 'remove') {
    if (saving.current || !state) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'remove') {
        if (!removing) return
        await client.remove(removing)
        setRemoving(null)
      } else {
        const request = pending ?? {
          id: crypto.randomUUID(),
          action,
          text: action === 'add' ? text : reason,
          enabled: dna,
          expectedDna: state.dna,
        }
        setPending(request)
        if (request.action === 'add') await client.add(request.id, request.text)
        else await client.dna(request.id, request.enabled, request.text, request.expectedDna)
        setPending(null)
        if (request.action === 'add') setText('')
        else setReason('')
      }
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'definitive' in e && e.definitive) setPending(null)
      setError(e instanceof Error ? e.message : 'Member note request was not confirmed.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const canDna = hasStaffPermission(reader.uid, 'editMembers', reader.permissions)
  const canRemove = hasStaffPermission(reader.uid, 'removeMemberNotes', reader.permissions)
  return (
    <section aria-label="Member notes" className="member-notes-section">
      <h3>Member notes</h3>
      <button
        type="button"
        disabled={busy || !!pending}
        onClick={() => void load().catch((e) => setError(e.message))}
      >
        Refresh member notes
      </button>
      {state?.dna && <p className="member-note-dna">DNA · Do not admit</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!state ? (
        <button type="button" onClick={() => void load().catch((e) => setError(e.message))}>
          Reload notes
        </button>
      ) : (
        <>
          <NoteEntries
            notes={state.notes}
            onRemove={canRemove && !busy && !pending ? setRemoving : undefined}
          />
          {removing && (
            <div className="notice">
              <p>Remove this member note? This does not clear DNA status.</p>
              <button disabled={busy} onClick={() => setRemoving(null)}>
                Keep note
              </button>
              <button className="danger" disabled={busy} onClick={() => void mutate('remove')}>
                Confirm remove note
              </button>
            </div>
          )}
          <fieldset disabled={busy || !!pending}>
            <label>
              Add member note
              <textarea
                aria-label="Add member note"
                maxLength={10000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button className="primary" disabled={!text.trim()} onClick={() => void mutate('add')}>
              Save note
            </button>
          </fieldset>
          {canDna && (
            <fieldset disabled={busy || !!pending}>
              <legend>Admission status</legend>
              <label>
                <input type="checkbox" checked={dna} onChange={(e) => setDna(e.target.checked)} />{' '}
                Do not admit (DNA)
              </label>
              {dna !== state.dna && (
                <>
                  <label>
                    {dna ? 'DNA reason (required)' : 'Reason for clearing DNA (optional)'}
                    <textarea
                      aria-label="DNA reason"
                      required={dna}
                      maxLength={10000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button disabled={dna && !reason.trim()} onClick={() => void mutate('dna')}>
                    Save DNA status
                  </button>
                </>
              )}
            </fieldset>
          )}
          {pending && (
            <div className="notice">
              <p>Save was not confirmed. Retry the same note before making another change.</p>
              <button disabled={busy} onClick={() => void mutate(pending.action)}>
                Retry note save
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
