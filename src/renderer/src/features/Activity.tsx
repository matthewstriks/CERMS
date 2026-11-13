import { hasStaffPermission } from '../../../domain/staff-permissions'
import { createPos } from '../../../data/firebase-pos'
import { createCatalog } from '../../../data/firebase-catalog'
import type { CatalogProduct, CatalogRecord } from '../../../domain/catalog'
import { startMemberOrder } from '../lib/order-start'
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
                <th>Rental / Assigned Room/Number</th>
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
        Start rental check-in from Members. Visits and assigned rooms/numbers appear after
        successful checkout.
      </p>
      {detail && (
        <VisitDetails key={detail.id} visit={detail} now={now} onClose={() => setSelected(null)} />
      )}
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
  const { reader } = useMembershipSession()
  const canEdit =
    !!reader &&
    hasStaffPermission(reader.uid, 'processSales', reader.permissions) &&
    visit.rentalEnabled
  const [room, setRoom] = useState(visit.location)
  const [notes, setNotes] = useState(visit.notes)
  const [inside, setInside] = useState(visit.inside)
  const [waiting, setWaiting] = useState(visit.waiting)
  const [revision, setRevision] = useState(visit.editRevision)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [products, setProducts] = useState<CatalogRecord<CatalogProduct>[]>([])
  const [productId, setProductId] = useState('')
  useEffect(() => {
    if (!reader || !canEdit) return
    let active = true
    const catalog = createCatalog(reader)
    void (async () => {
      let page = await catalog.products(true),
        all = page.rows
      while (page.more) {
        page = await catalog.products()
        all.push(...page.rows)
        if (all.length > 10000) throw new Error('Catalog exceeds 10,000 products.')
      }
      if (active) {
        const rentals = all.filter(
          (p) =>
            p.data.active &&
            p.data.rental &&
            !p.data.payout &&
            (!p.data.restricted || p.data.restrictedUsers.includes(reader.uid)),
        )
        setProducts(rentals)
        setProductId(rentals.find((p) => p.data.name === visit.rental)?.id ?? rentals[0]?.id ?? '')
      }
    })().catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Could not load renewal products.')
    })
    return () => {
      active = false
    }
  }, [reader, canEdit, visit.rental])
  const dirty =
    room !== visit.location ||
    notes !== visit.notes ||
    inside !== visit.inside ||
    waiting !== visit.waiting
  async function save() {
    if (!reader || busy) return
    setBusy(true)
    setError('')
    setSaved('')
    try {
      await createPos(reader).updateRental({
        visitId: visit.id,
        expectedRevision: revision,
        assignedRoom: room,
        notes,
        inside,
        waiting,
      })
      setRevision(revision + 1)
      setSaved('Rental details saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rental could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  function renew() {
    if (!reader) return
    const product = products.find((p) => p.id === productId)
    if (!product) return
    try {
      const started = startMemberOrder(reader, {
        member: { id: visit.memberId, name: visit.memberName },
        cart: [
          {
            product,
            quantity: 1,
            unitPriceCents: product.data.priceCents,
            rentals: [
              {
                id: crypto.randomUUID(),
                assignedRoom: visit.location,
                memberId: visit.memberId,
                renewalVisitId: visit.id,
              },
            ],
          },
        ],
      })
      if (started) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start renewal.')
    }
  }
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="member-dialog rental-dialog"
      aria-labelledby="visit-title"
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onClose()
      }}
    >
      <div className="dialog-heading">
        <Badge>{canEdit ? 'Manage rental' : 'Read only'}</Badge>
        <button aria-label="Close visit details" disabled={busy} onClick={onClose}>
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
      {canEdit ? (
        <>
          <fieldset disabled={busy}>
            <legend>Edit active rental</legend>
            <label>
              Assigned Room/Number
              <input
                value={room}
                maxLength={120}
                onChange={(e) => {
                  setRoom(e.target.value)
                  setSaved('')
                }}
              />
            </label>
            <label>
              Visit notes
              <textarea
                aria-label="Visit notes"
                value={notes}
                maxLength={1000}
                onChange={(e) => {
                  setNotes(e.target.value)
                  setSaved('')
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={inside}
                onChange={(e) => {
                  setInside(e.target.checked)
                  setSaved('')
                }}
              />{' '}
              Inside (off = outside)
            </label>
            <label>
              <input
                type="checkbox"
                checked={waiting}
                onChange={(e) => {
                  setWaiting(e.target.checked)
                  setSaved('')
                }}
              />{' '}
              On waitlist
            </label>
            <button className="primary" disabled={!room.trim()} onClick={() => void save()}>
              Save rental changes
            </button>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Renew rental</legend>
            <label>
              Rental product
              <select
                aria-label="Rental product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.data.name} · {p.data.rentalLengthRaw} {p.data.rentalLengthType} · $
                    {(p.data.priceCents / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Time is added only after successful checkout. Active rentals keep their remaining
              time; overdue rentals restart from checkout time.
            </p>
            {dirty && <p>Save your changes or reopen the visit before renewing.</p>}
            <button disabled={!productId || dirty} onClick={renew}>
              Renew in order
            </button>
          </fieldset>
          {saved && <p role="status">{saved}</p>}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <h3>Visit notes</h3>
          <p className="visit-notes">{visit.notes || 'No notes recorded.'}</p>
        </>
      )}
      <div className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}
