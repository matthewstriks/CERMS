import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MemberQuery } from '../../../data/contracts'
import type { Member } from '../../../domain/legacy'
import { membershipStatus } from '../../../domain/legacy'
import { useQuery, useRepository, dateLabel } from '../lib/data'
import { Badge, QueryState } from '../components/ui'

import MemberDetails from './members/MemberDetails'

export default function DemoMembers() {
  const repository = useRepository()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MemberQuery['status']>('all')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Member | null>(null)
  const { data, loading, error } = useQuery(
    () => repository.listMembers({ search, status, offset, limit: 5 }),
    [repository, search, status, offset],
  )
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search members"
            placeholder="Search by name or member number…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
          />
        </label>
        <label className="filter-label">
          Status
          <select
            aria-label="Membership status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as MemberQuery['status'])
              setOffset(0)
            }}
          >
            <option value="all">All members</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="dna">Do not admit</option>
          </select>
        </label>
      </div>
      <section className="panel">
        <QueryState loading={loading} error={error} />
        {data && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Member no.</th>
                    <th>DOB</th>
                    <th>Membership</th>
                    <th>Expiration</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((member) => {
                    const state = membershipStatus(member, Date.now())
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="person">
                            <span className="avatar">
                              {member.name
                                .split(' ')
                                .map((part) => part[0])
                                .join('')}
                            </span>
                            <div>
                              <strong>{member.name}</strong>
                              {member.tagged && <small>Tagged member</small>}
                            </div>
                          </div>
                        </td>
                        <td>#{member.number}</td>
                        <td>{member.dob || 'Not recorded'}</td>
                        <td>{member.membership}</td>
                        <td>{dateLabel(member.expiresAt)}</td>
                        <td>
                          <Badge
                            tone={
                              state === 'Active'
                                ? 'green'
                                : state === 'Do not admit'
                                  ? 'red'
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
            {!data.items.length && (
              <div className="empty">
                <Search size={25} />
                <h3>No members found</h3>
                <p>Try another name, number, or status.</p>
              </div>
            )}
            <div className="table-footer">
              <span>
                {data.total
                  ? `${offset + 1}–${Math.min(offset + 5, data.total)} of ${data.total}`
                  : '0'}{' '}
                sample members
              </span>
              <div>
                <button
                  aria-label="Previous page"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 5))}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  aria-label="Next page"
                  disabled={data.nextOffset === null}
                  onClick={() => setOffset(data.nextOffset ?? offset)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <p className="page-note">
        Sample records only. This view does not read or write your live member database.
      </p>
      {selected && <MemberDetails member={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
