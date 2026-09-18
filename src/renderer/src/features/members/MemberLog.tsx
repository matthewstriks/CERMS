import { useEffect, useMemo, useRef, useState } from 'react'
import type { Member } from '../../../../domain/legacy'
import type { MembershipReader } from '../../../../data/membership-contracts'
import { createMemberLog, type MemberLogEntry } from '../../../../data/firebase-member-log'
import { canCreateDevMember } from '../../../../shared/dev-member-policy'

export default function MemberLog({
  member,
  reader,
}: {
  member: Member
  reader: MembershipReader | null
}) {
  const logger = useMemo(
    () =>
      reader && canCreateDevMember(reader.uid, reader.club)
        ? createMemberLog(reader, member.id)
        : null,
    [reader, member.id],
  )
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<MemberLogEntry[]>([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewError, setViewError] = useState('')
  const [revision, setRevision] = useState(0)
  const view = useRef<{ id: string; promise: Promise<void> } | null>(null)
  const active = useRef(true)
  const loading = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    if (!logger) return
    let current = true
    // Reuse one event ID and promise across effect replay and retry.
    if (!view.current) {
      const id = crypto.randomUUID()
      view.current = { id, promise: logger.viewed(id) }
    }
    void view.current.promise
      .then(() => {
        if (current) {
          setViewError('')
          setRevision((r) => r + 1)
        }
      })
      .catch(() => {
        if (current) setViewError('This view has not been confirmed in the member log.')
      })
    return () => {
      current = false
    }
  }, [logger])
  async function load(reset: boolean) {
    if (!logger || loading.current) return
    loading.current = true
    setBusy(true)
    setError('')
    try {
      await view.current?.promise.catch(() => undefined)
      const page = await logger.list(reset)
      if (active.current) {
        setEntries((previous) =>
          reset
            ? page.entries
            : [...previous, ...page.entries.filter((e) => !previous.some((p) => p.id === e.id))],
        )
        setMore(page.more)
      }
    } catch {
      if (active.current)
        setError('Unable to load activity. Check your connection and logging permissions.')
    } finally {
      loading.current = false
      if (active.current) setBusy(false)
    }
  }
  useEffect(() => {
    if (open) void load(true)
  }, [open, revision, logger])
  async function retryView() {
    if (!logger || !view.current || busy) return
    setBusy(true)
    try {
      view.current.promise = logger.viewed(view.current.id)
      await view.current.promise
      if (active.current) {
        setViewError('')
        setRevision((r) => r + 1)
      }
    } catch {
      /* Keep the visible retry message. */
    } finally {
      if (active.current) setBusy(false)
    }
  }
  return (
    <details className="member-log" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Member activity log{viewError ? ' · View not recorded' : ''}</summary>
      {!logger && <p className="muted">View logging is currently available in Dev System only.</p>}
      {viewError && (
        <p role="alert">
          {viewError}{' '}
          <button disabled={busy} onClick={() => void retryView()}>
            Retry recording view
          </button>
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{' '}
          <button disabled={busy} onClick={() => void load(true)}>
            Retry loading log
          </button>
        </p>
      )}
      {logger && (
        <button disabled={busy} onClick={() => void load(true)}>
          Refresh log
        </button>
      )}
      {busy && <p role="status">Loading activity…</p>}
      <ol className="member-log-events">
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.type === 'member.viewed' ? 'Member viewed by' : entry.type}</strong>{' '}
            {entry.actorName}
            <small>Staff ID: {entry.actorUid}</small>
            <time
              dateTime={
                entry.occurredAt === null ? undefined : new Date(entry.occurredAt).toISOString()
              }
            >
              {entry.occurredAt === null
                ? 'Time not recorded'
                : new Date(entry.occurredAt).toLocaleString()}
            </time>
          </li>
        ))}
        <li>
          <strong>Member created</strong>
          <small>
            {member.createdBy ? `Staff ID: ${member.createdBy}` : 'Creator not recorded'}
          </small>
          <time
            dateTime={
              member.createdAt === null ? undefined : new Date(member.createdAt).toISOString()
            }
          >
            {member.createdAt === null
              ? 'Time not recorded'
              : new Date(member.createdAt).toLocaleString()}
          </time>
          <small>From the member’s creation record.</small>
        </li>
      </ol>
      {more && (
        <button disabled={busy} onClick={() => void load(false)}>
          Load older activity
        </button>
      )}
    </details>
  )
}
