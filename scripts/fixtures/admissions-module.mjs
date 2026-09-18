// Served only by the desktop smoke test in place of its admissions data module.
// The real subscription state machine is covered separately in admissions.test.ts.
export function subscribeAdmissions(session, receive) {
  const previous = window.__admissionsFixture
  const owner = { club: session.club, active: true, stops: previous?.stops ?? 0 }
  window.__admissionsFixture = owner
  const base = {
    active: true,
    rentalEnabled: true,
    rentalStartedAt: Date.now() - 60000,
    enteredAt: Date.now() - 60000,
    expiresAt: Date.now() + 3600000,
    removedMember: false,
    memberStatus: 'ready',
    memberNumber: '101',
    membershipType: 'Annual',
    dna: false,
    tagged: false,
    notes: 'Original visit note',
    waiting: false,
    inside: true,
    rental: 'Locker',
    location: '12',
  }
  const prefix = session.club === 'fixture-club' ? 'Fixture' : 'Other'
  let state = {
    status: 'live',
    rows: [
      { ...base, id: 'v1', memberId: 'm1', memberName: `${prefix} Guest` },
      {
        ...base,
        id: 'v2',
        memberId: 'm2',
        memberName: `${prefix} Waiting`,
        memberNumber: '102',
        waiting: true,
        inside: false,
      },
    ],
  }
  owner.state = state
  const update = (event) => {
    state = event.detail
    owner.state = state
    receive(state)
  }
  window.addEventListener('admissions-fixture', update)
  receive(state)
  return () => {
    owner.active = false
    owner.stops++
    window.removeEventListener('admissions-fixture', update)
  }
}
