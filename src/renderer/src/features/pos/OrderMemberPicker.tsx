import { membershipStatus } from '../../../../domain/legacy'
import { useEffect, useRef, useState } from 'react'
import type {
  MembershipReader,
  MembershipPage,
  MemberSearchField,
} from '../../../../data/membership-contracts'
import type { OrderMember } from '../../../../domain/pos'
export default function OrderMemberPicker({
  reader,
  onSelect,
  onClose,
}: {
  reader: MembershipReader
  onSelect(member: OrderMember, expired?: boolean): void
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true)
  const [search, setSearch] = useState('')
  const [field, setField] = useState<MemberSearchField>('name')
  const [page, setPage] = useState<MembershipPage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState({ search: '', field: 'name' as MemberSearchField })
  async function load(next = false) {
    setBusy(true)
    setError('')
    const lookup = next ? query : { search: search.trim(), field }
    try {
      const result = await reader.list({
        ...lookup,
        dnaOnly: false,
        ...(next && page?.nextCursor ? { cursor: page.nextCursor } : {}),
      })
      if (!mounted.current) return
      setQuery(lookup)
      setPage((previous) =>
        next && previous
          ? {
              ...result,
              members: [
                ...previous.members,
                ...result.members.filter((m) => !previous.members.some((p) => p.id === m.id)),
              ],
            }
          : result,
      )
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Unable to find members.')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  useEffect(() => {
    mounted.current = true
    dialog.current?.showModal()
    void load()
    return () => {
      mounted.current = false
      dialog.current?.close()
    }
  }, [reader])
  return (
    <dialog
      ref={dialog}
      className="member-dialog"
      aria-label="Choose existing member"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="dialog-heading">
        <h2>Choose existing member</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) void load()
        }}
      >
        <select
          aria-label="Member search field"
          value={field}
          disabled={busy}
          onChange={(e) => setField(e.target.value as MemberSearchField)}
        >
          <option value="name">Name</option>
          <option value="number">Membership number</option>
          <option value="id">Government ID</option>
        </select>
        <input
          autoFocus
          aria-label="Find member"
          placeholder="Search members…"
          value={search}
          disabled={busy}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          Search
        </button>
      </form>
      {busy && <p role="status">Finding members…</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="order-member-results">
        {page?.members.map((m) => (
          <button
            key={m.id}
            disabled={busy}
            onClick={() =>
              onSelect({ id: m.id, name: m.name }, membershipStatus(m, Date.now()) === 'Expired')
            }
          >
            <strong>{m.name}</strong>
            <span>
              #{m.number} · {m.membership}
              {m.dna ? ' · Do not admit' : ''}
            </span>
          </button>
        ))}
      </div>
      {page && !page.members.length && <p>No matching members.</p>}
      {page?.nextCursor && (
        <button disabled={busy} onClick={() => void load(true)}>
          Load more members
        </button>
      )}
    </dialog>
  )
}
