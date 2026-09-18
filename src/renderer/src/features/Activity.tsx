import { useEffect, useRef, useState } from 'react'
import { Clock3, Search, X } from 'lucide-react'
import { Badge } from '../components/ui'
import { useMembershipSession } from '../lib/membership-session'
import RentalAlerts from '../components/RentalAlerts'
import { rentalTime, rentalUrgency } from '../../../domain/admissions'
import type { AdmissionRow, AdmissionsState } from '../../../domain/admissions'

const dateTime = (value: number | null) =>
  value === null ? 'Not recorded' : new Date(value).toLocaleString()
export default function Activity({ showRentalAlerts = false }: { showRentalAlerts?: boolean }) {
  const { reader } = useMembershipSession()
  const [state, setState] = useState<AdmissionsState>({ rows: [], status: 'connecting' })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!reader) return
    let active = true
    let unsubscribe: (() => void) | undefined
    setState({ rows: [], status: 'connecting' })
    setSelected(null)
    void import('../../../data/firebase-admissions')
      .then((client) => {
        if (active)
          unsubscribe = client.subscribeAdmissions(
            { uid: reader.uid, club: reader.club },
            (next) => {
              if (active) setState(next)
            },
          )
      })
      .catch(() => {
        if (active)
          setState({
            rows: [],
            status: 'error',
            error: 'Admissions could not be loaded. Please try again.',
          })
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [reader, revision])
  const expired = (visit: AdmissionRow) => rentalUrgency(visit, now) === 'expired'
  const endingSoon = (visit: AdmissionRow) => rentalUrgency(visit, now) === 'soon'
  const groups = [
    { id: 'all', label: 'All active visits', matches: (_visit: AdmissionRow) => true },
    { id: 'inside', label: 'Inside', matches: (visit: AdmissionRow) => visit.inside },
    { id: 'outside', label: 'Outside', matches: (visit: AdmissionRow) => !visit.inside },
    { id: 'waitlist', label: 'Waitlist', matches: (visit: AdmissionRow) => visit.waiting },
    { id: 'expired', label: 'Expired rentals', matches: expired },
    { id: 'soon', label: 'Ending soon', matches: endingSoon },
  ]
  const text = search.trim().toLocaleLowerCase()
  const rows = state.rows.filter(
    (visit) =>
      (groups.find((group) => group.id === filter)?.matches(visit) ?? true) &&
      (!text ||
        [visit.memberName, visit.memberNumber, visit.rental, visit.location].some((value) =>
          value.toLocaleLowerCase().includes(text),
        )),
  )
  const detail = state.rows.find((visit) => visit.id === selected)
  const live = state.status === 'live'
  return (
    <>
      <div className="admissions-status" role="status">
        <Badge tone={live ? 'green' : 'amber'}>
          {live
            ? 'Live updates'
            : state.status === 'error'
              ? 'Updates unavailable'
              : state.status === 'connecting'
                ? 'Connecting…'
                : 'Reconnecting…'}
        </Badge>
        {!live && state.status !== 'error' && (
          <span>
            {state.rows.length
              ? 'Showing last received records while updates reconnect.'
              : 'Waiting for current records.'}
          </span>
        )}
      </div>
      {state.error && (
        <div className="inline-error" role="alert">
          {state.error} <button onClick={() => setRevision((value) => value + 1)}>Try again</button>
        </div>
      )}
      {showRentalAlerts && (
        <RentalAlerts
          state={state}
          now={now}
          onFilter={(value) => {
            setSearch('')
            setFilter(value)
          }}
        />
      )}
      <div className="tabs" role="group" aria-label="Visit filter">
        {groups.map((group) => (
          <button
            key={group.id}
            aria-pressed={filter === group.id}
            className={filter === group.id ? 'selected' : ''}
            onClick={() => setFilter(group.id)}
          >
            {group.label}{' '}
            <span className="visit-count">
              {state.status === 'connecting' || state.status === 'error'
                ? '—'
                : state.rows.filter(group.matches).length}
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search admissions"
            placeholder="Search member, membership number, or rental…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Rental / location</th>
                <th>Arrival</th>
                <th>Time remaining</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((visit) => (
                <tr
                  key={visit.id}
                  className={
                    expired(visit)
                      ? 'admission-expired'
                      : endingSoon(visit)
                        ? 'admission-ending-soon'
                        : ''
                  }
                >
                  <td>
                    <strong>{visit.memberName}</strong>
                    <small className="admission-member-meta">
                      {visit.memberNumber && `#${visit.memberNumber}`}
                      {visit.membershipType && ` · ${visit.membershipType}`}
                    </small>
                    {visit.dna && <Badge tone="red">Do not admit</Badge>}
                    {visit.tagged && <Badge tone="amber">Read member notes</Badge>}
                  </td>
                  <td>
                    {visit.rentalEnabled
                      ? `${visit.rental} · ${visit.location}`
                      : 'No rental assigned'}
                  </td>
                  <td>{dateTime(visit.enteredAt)}</td>
                  <td>
                    <span className={`time ${expired(visit) ? 'overdue' : ''}`}>
                      <Clock3 size={14} />
                      {rentalTime(visit, now)}
                    </span>
                    {endingSoon(visit) && <span className="rental-soon-label">Ending soon</span>}
                  </td>
                  <td>
                    <Badge tone={visit.inside ? 'green' : 'neutral'}>
                      {visit.inside ? 'Inside' : 'Outside'}
                    </Badge>
                    {visit.waiting && <Badge tone="amber">Waitlist</Badge>}
                  </td>
                  <td>
                    <button
                      onClick={() => setSelected(visit.id)}
                      aria-label={`View visit for ${visit.memberName}`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && live && (
          <div className="empty">
            {state.rows.length ? 'No visits match this filter.' : 'No active visits.'}
          </div>
        )}
      </section>
      <p className="page-note">
        Check-in, checkout, renewal, rental editing, and waitlist changes are not implemented yet.
      </p>
      {detail && <VisitDetails visit={detail} now={now} onClose={() => setSelected(null)} />}
    </>
  )
}
function VisitDetails({
  visit,
  now,
  onClose,
}: {
  visit: AdmissionRow
  now: number
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog ref={dialog} className="member-dialog" aria-labelledby="visit-title" onCancel={onClose}>
      <div className="dialog-heading">
        <Badge>Read only</Badge>
        <button aria-label="Close visit details" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 id="visit-title">{visit.memberName}</h2>
      <dl className="details">
        {[
          ['Membership number', visit.memberNumber || 'Not recorded'],
          ['Membership type', visit.membershipType || 'Not recorded'],
          ['Arrival', dateTime(visit.enteredAt)],
          ['Location status', visit.inside ? 'Inside' : 'Outside'],
          ['Waitlist', visit.waiting ? 'On waitlist' : 'Not on waitlist'],
          [
            'Rental',
            visit.rentalEnabled ? `${visit.rental} · ${visit.location}` : 'No rental assigned',
          ],
          ['Rental started', visit.rentalEnabled ? dateTime(visit.rentalStartedAt) : '—'],
          ['Rental expires', visit.rentalEnabled ? dateTime(visit.expiresAt) : '—'],
          ['Time remaining', rentalTime(visit, now)],
        ].map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Visit notes</h3>
      <p className="visit-notes">{visit.notes || 'No notes recorded.'}</p>
      <div className="dialog-actions">
        <button onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}
