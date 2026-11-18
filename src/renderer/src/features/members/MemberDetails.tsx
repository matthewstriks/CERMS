import MemberFiles from './MemberFiles'
import MemberNotes from './MemberNotes'
import MemberLog from './MemberLog'
import { phoneLabel } from '../../../../domain/phone'
import { dobLabel } from '../../lib/data'
import { useEffect, useRef, useState } from 'react'
import { X, UserRound } from 'lucide-react'
import type { Member } from '../../../../domain/legacy'
import { membershipStatus } from '../../../../domain/legacy'
import { useMembershipSession } from '../../lib/membership-session'
import { dateLabel, money } from '../../lib/data'
import { Badge } from '../../components/ui'
import type { MembershipHistory } from '../../../../data/membership-contracts'

function dateTime(value: number | null): string {
  return value === null ? 'Not recorded' : new Date(value).toLocaleString()
}
export default function MemberDetails({
  member,
  onClose,
  onEdit,
  onDelete,
}: {
  member: Member
  onClose(): void
  onEdit?(): void
  onDelete?(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { reader } = useMembershipSession()
  const [dnaStatus, setDnaStatus] = useState(member.dna)
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [history, setHistory] = useState<MembershipHistory | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  useEffect(() => {
    if (tab !== 'history' || !reader) return
    let active = true
    setHistory(null)
    setError('')
    setLoading(true)
    reader
      .history(member.id)
      .then((result) => {
        if (active) setHistory(result)
      })
      .catch(async (failure: unknown) => {
        const { membershipError } = await import('../../../../data/firebase-membership')
        if (active) setError(membershipError(failure))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [member.id, reader, tab])
  const status = membershipStatus({ ...member, dna: dnaStatus }, Date.now())
  const fields = [
    ['Date of birth', dobLabel(member.dob)],
    ['Membership number', member.number],
    ['Email', member.email],
    ['Phone number', phoneLabel(member.phone)],
    ['Membership type', member.membership],
    ['Membership expires', dateLabel(member.expiresAt)],
    ['Government / state ID', member.governmentId],
    ['ID state', member.governmentIdState],
    ['Created', dateTime(member.createdAt)],
    ['Waiver status', member.waiver ? 'On file' : 'Not on file'],
  ]
  return (
    <dialog
      ref={dialog}
      className="member-dialog member-details-dialog"
      aria-labelledby="member-details-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-heading">
        <Badge>{reader ? 'Member record' : 'Read only'}</Badge>
        <button className="icon-button" aria-label="Close member details" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="profile-icon">
        <UserRound size={30} />
      </div>
      <h2 id="member-details-title">{member.name}</h2>
      <div className="member-flags">
        <Badge tone={dnaStatus ? 'red' : status === 'Active' ? 'green' : 'amber'}>{status}</Badge>
        {member.tagged && <Badge tone="amber">Read notes · tagged member</Badge>}
      </div>
      <div className="tabs" role="group" aria-label="Member information">
        <button
          aria-pressed={tab === 'details'}
          className={tab === 'details' ? 'selected' : ''}
          onClick={() => setTab('details')}
        >
          Member details
        </button>
        <button
          aria-pressed={tab === 'history'}
          className={tab === 'history' ? 'selected' : ''}
          onClick={() => setTab('history')}
        >
          Member history
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div hidden={tab !== 'details'}>
        <dl className="details">
          {fields.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value || 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
        {reader ? (
          <MemberNotes
            key={`${reader.uid}:${reader.club}:${member.id}`}
            reader={reader}
            memberId={member.id}
            onChanged={setDnaStatus}
          />
        ) : (
          <>
            <h3>Member notes</h3>
            {member.notes.map((note, i) => (
              <p className="note" key={i}>
                {note}
              </p>
            ))}
          </>
        )}
        <MemberLog
          key={`${reader?.uid}:${reader?.club}:${member.id}`}
          member={member}
          reader={reader}
        />
        <MemberFiles
          key={`${reader?.uid}:${reader?.club}:${member.id}`}
          member={member}
          reader={reader}
        />
      </div>
      {tab === 'history' && (
        <>
          {!reader && (
            <p className="notice">
              Member history is available after signing in to the existing Firebase account.
            </p>
          )}
          {loading && <p role="status">Loading member history…</p>}
          {history && (
            <>
              <h3>Visit history</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Time in</th>
                      <th>Time out</th>
                      <th>Rental / location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.visits.map((visit) => (
                      <tr key={visit.id}>
                        <td>{dateTime(visit.enteredAt)}</td>
                        <td>{dateTime(visit.leftAt)}</td>
                        <td>
                          {visit.rental} {visit.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!history.visits.length && <p>No visits recorded.</p>}
              <h3>Order history</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date / time</th>
                      <th>Card</th>
                      <th>Gift card</th>
                      <th>Cash</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.orders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.id}</td>
                        <td>{dateTime(order.placedAt)}</td>
                        <td>{money(order.card)}</td>
                        <td>{money(order.giftCard)}</td>
                        <td>{money(order.cash)}</td>
                        <td>{money(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!history.orders.length && <p>No orders recorded.</p>}
              <p className="page-note">
                History is ordered by record ID.{' '}
                {history.visitsLimited || history.ordersLimited
                  ? 'Showing the first 50 records per section; additional history is available in CERMS 4.'
                  : 'All matching records are shown.'}
              </p>
            </>
          )}
        </>
      )}
      <div className="dialog-actions">
        {onEdit && <button onClick={onEdit}>Edit member</button>}
        {onDelete && (
          <button className="danger" onClick={onDelete}>
            Delete member
          </button>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}
