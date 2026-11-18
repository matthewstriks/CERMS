import { useEffect, useRef, useState } from 'react'
import type { MemberDuplicate, MemberIdentity } from '../../../../domain/member-duplicates'
import type { Member } from '../../../../domain/legacy'
import { dobLabel } from '../../lib/data'
import './MemberDuplicateDialog.css'

export type DuplicateDecision = Member | 'new' | null
export default function MemberDuplicateDialog({
  input,
  matches,
  onDecide,
}: {
  input: MemberIdentity
  matches: MemberDuplicate[]
  onDecide(decision: DuplicateDecision): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [differentPerson, setDifferentPerson] = useState(false)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="member-dialog member-duplicate-dialog"
      aria-labelledby="duplicate-member-title"
      onCancel={(event) => {
        event.preventDefault()
        onDecide(null)
      }}
    >
      <div className="dialog-heading">
        <h2 id="duplicate-member-title">Member may already exist</h2>
        <button type="button" onClick={() => onDecide(null)}>
          Back to form
        </button>
      </div>
      <p>Review the matches. Use an existing member to continue with this membership.</p>
      <p className="duplicate-entered-details">
        <strong>Entered:</strong>{' '}
        {[input.firstName, input.middleName, input.lastName].filter(Boolean).join(' ')}
        {' · '}DOB {dobLabel(input.birthDate)}
        {' · '}
        {input.governmentIdType} {input.governmentId}
      </p>
      <ul className="duplicate-member-list">
        {matches.map(({ member, reasons }) => (
          <li key={member.id}>
            <h3>
              {member.name} <small>#{member.number}</small>
            </h3>
            <p className="duplicate-reasons">Matched: {reasons.join(', ')}</p>
            <dl>
              <dt>Date of birth</dt>
              <dd>{dobLabel(member.dob)}</dd>
              <dt>ID state / type</dt>
              <dd>{member.governmentIdState || 'Not recorded'}</dd>
              <dt>ID number</dt>
              <dd>{member.governmentId || 'Not recorded'}</dd>
              <dt>Membership</dt>
              <dd>{member.membership}</dd>
              <dt>Expiration</dt>
              <dd>
                {member.expiresAt === null
                  ? 'Not recorded'
                  : new Date(member.expiresAt).toLocaleDateString()}
              </dd>
            </dl>
            {member.dna && <p className="inline-error">Do not admit</p>}
            {member.tagged && <p>Flagged member</p>}
            <button type="button" className="primary" onClick={() => onDecide(member)}>
              Use existing member {member.name}
            </button>
          </li>
        ))}
      </ul>
      <label className="duplicate-confirmation">
        <input
          type="checkbox"
          checked={differentPerson}
          onChange={(event) => setDifferentPerson(event.target.checked)}
        />
        I checked the matches. This is a different person.
      </label>
      <div className="dialog-actions">
        <button type="button" onClick={() => onDecide(null)}>
          Back to form
        </button>
        <button type="button" disabled={!differentPerson} onClick={() => onDecide('new')}>
          Continue as new member
        </button>
      </div>
    </dialog>
  )
}
