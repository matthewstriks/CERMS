import { dobLabel } from '../../lib/data'
import type { MembershipPage } from '../../../../data/membership-contracts'
import type { Member } from '../../../../domain/legacy'
export default function MemberMatches({
  result,
  onView,
}: {
  result: MembershipPage
  onView(member: Member): void
}) {
  if (!result.members.length) return null
  return (
    <section className="scan-review" aria-label="Existing members">
      <h3>A member with this ID already exists</h3>
      <p>Check the name, date of birth, and issuing state, then open the existing member.</p>
      <ul className="scan-matches">
        {result.members.map((member) => (
          <li key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <p>
                #{member.number} · DOB {dobLabel(member.dob)} ·{' '}
                {member.governmentIdState || 'State not recorded'}
              </p>
            </div>
            <button type="button" onClick={() => onView(member)}>
              View member {member.name}
            </button>
          </li>
        ))}
      </ul>
      {result.nextCursor && (
        <p>More matches exist. Use the government / state ID search to browse all results.</p>
      )}
    </section>
  )
}
