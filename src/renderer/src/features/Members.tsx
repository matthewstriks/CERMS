import { useEffect, useState } from 'react'
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMembershipSession } from '../lib/membership-session'
import { dateLabel } from '../lib/data'
import { Badge } from '../components/ui'
import type { MembershipPage, MemberSearchField } from '../../../data/membership-contracts'
import type { Member } from '../../../domain/legacy'
import { membershipStatus } from '../../../domain/legacy'
import { searchDescription } from '../../../data/membership-search'
import MemberDetails from './members/MemberDetails'

function LiveMembers() {
  const session = useMembershipSession(),
    reader = session.reader!
  const [draft, setDraft] = useState(''),
    [field, setField] = useState<MemberSearchField>('name')
  const [search, setSearch] = useState({ text: '', field: 'name' as MemberSearchField })
  const [dnaOnly, setDnaOnly] = useState(false)
  const [pages, setPages] = useState<(string | undefined)[]>([undefined])
  const [page, setPage] = useState<MembershipPage | null>(null)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<Member | null>(null)
  const cursor = pages[pages.length - 1]
  useEffect(() => {
    let active = true
    setLoading(true)
    setPage(null)
    setError('')
    reader
      .list({ search: search.text, field: search.field, dnaOnly, cursor })
      .then((result) => {
        if (active) setPage(result)
      })
      .catch(async (failure: unknown) => {
        const { membershipError } = await import('../../../data/firebase-membership')
        if (active) setError(membershipError(failure))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reader, search, dnaOnly, cursor, revision])
  function refresh() {
    setPages([undefined])
    setSelected(null)
    setRevision((value) => value + 1)
  }
  return (
    <>
      <div className="membership-actions">
        <button disabled title="Not implemented yet" aria-describedby="membership-unavailable">
          Create membership
        </button>
        <button
          aria-pressed={dnaOnly}
          onClick={() => {
            setDnaOnly(!dnaOnly)
            setPages([undefined])
          }}
        >
          {dnaOnly ? 'Normal view' : 'View all DNA'}
        </button>
        <button disabled title="Not implemented yet" aria-describedby="membership-unavailable">
          Scan ID
        </button>
        <button onClick={refresh} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <p className="page-note" id="membership-unavailable">
        Membership creation and ID scanning are not implemented yet.
      </p>
      <form
        className="toolbar member-search-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch({ text: draft.trim(), field })
          setPages([undefined])
        }}
      >
        <label className="filter-label">
          Search by
          <select
            aria-label="Search field"
            value={field}
            onChange={(event) => setField(event.target.value as MemberSearchField)}
          >
            <option value="name">Name</option>
            <option value="dob">Date of birth</option>
            <option value="id">Government / state ID</option>
            <option value="number">Membership number</option>
            <option value="type">Membership type</option>
          </select>
        </label>
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search memberships"
            placeholder="Enter search and press Enter…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button className="primary" type="submit" disabled={loading}>
          Search
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft('')
            setSearch({ text: '', field: 'name' })
            setDnaOnly(false)
            setPages([undefined])
          }}
        >
          Reset
        </button>
      </form>
      <p className="page-note">
        {searchDescription(field)} Blank search shows recent members; the DNA view includes all
        do-not-admit records across pages.
      </p>
      <section className="panel">
        {loading && (
          <div className="empty" role="status">
            Reading memberships…
          </div>
        )}
        {error && (
          <div className="empty" role="alert">
            <p>{error}</p>
            <button onClick={refresh}>Try again</button>
          </div>
        )}
        {page && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name / member no.</th>
                    <th>DOB</th>
                    <th>Membership type</th>
                    <th>Membership expires</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {page.members.map((member) => {
                    const state = membershipStatus(member, Date.now())
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="person">
                            <span className="avatar">
                              {member.name
                                .split(' ')
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                            <div>
                              <strong>{member.name}</strong>
                              <small>
                                #{member.number}
                                {member.tagged ? ' · READ NOTES' : ''}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{member.dob || 'Not recorded'}</td>
                        <td>{member.membership}</td>
                        <td>{dateLabel(member.expiresAt)}</td>
                        <td>
                          <Badge
                            tone={
                              state === 'Do not admit'
                                ? 'red'
                                : state === 'Active'
                                  ? 'green'
                                  : 'amber'
                            }
                          >
                            {state}
                          </Badge>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            aria-label={`View ${member.name}`}
                            onClick={() => setSelected(member)}
                          >
                            View
                            <ChevronRight size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!page.members.length && (
              <div className="empty">
                <h3>No members found</h3>
                <p>Try another exact name, date, ID, or membership type.</p>
              </div>
            )}
            <div className="table-footer">
              <span>
                Page {pages.length} · {page.members.length} records
                {search.text
                  ? ` · ${search.field} search`
                  : dnaOnly
                    ? ' · Do not admit'
                    : ' · Most recently created first'}
              </span>
              <div>
                <button
                  aria-label="Previous page"
                  disabled={pages.length === 1}
                  onClick={() => setPages(pages.slice(0, -1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  aria-label="Next page"
                  disabled={!page.nextCursor}
                  onClick={() => setPages([...pages, page.nextCursor!])}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <p className="page-note">
        Editing, renewals, check-in, and deletion are not implemented yet.
      </p>
      {selected && <MemberDetails member={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
export default function Members() {
  const session = useMembershipSession()
  if (session.reader) return <LiveMembers key={session.reader.club} />
  return null
}
