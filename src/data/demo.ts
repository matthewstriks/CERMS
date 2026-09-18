import {
  activityFromLegacy,
  memberFromLegacy,
  productFromLegacy,
  membershipStatus,
} from '../domain/legacy'
import type { LegacyDocument } from '../domain/legacy'
import type { ClubRepository } from './contracts'

const access = 'demo-club'
/** Entirely synthetic fixtures shaped like the old database. No production configuration is imported. */
export function createDemoRepository(now = Date.now()): ClubRepository {
  const names = [
    'Alex Morgan',
    'Jordan Ellis',
    'Taylor Brooks',
    'Casey Rivera',
    'Jamie Parker',
    'Riley Chen',
    'Drew Bennett',
    'Sam Wallace',
  ]
  const rawMembers = names.map((name, index): LegacyDocument => ({
    access,
    name,
    id_number: 1041 + index,
    membership_type: index % 3 === 0 ? 'Monthly' : 'Annual',
    id_expiration: Math.floor(now / 1000) + (index === 4 ? -86400 : (index + 2) * 86400),
    dna: index === 6,
    tag: index === 2,
    waiver_status: index !== 3,
    notes: index === 2 ? ['Sample note: prefers a locker near the entrance.'] : [],
  }))
  const members = rawMembers.map((doc, index) =>
    memberFromLegacy(`demo-member-${index + 1}`, doc, access),
  )
  const activity = members.slice(0, 4).map((member, index) =>
    activityFromLegacy(
      `demo-visit-${index + 1}`,
      {
        access,
        memberID: member.id,
        active: true,
        waitlist: index === 3,
        currIn: index !== 3,
        timeIn: { seconds: Math.floor(now / 1000) - (index + 1) * 1800, nanoseconds: 0 },
        lockerRoomStatus: [
          true,
          index === 3 ? '' : String(12 + index * 7),
          index % 2 === 0 ? 'Locker' : 'Room',
          'demo-staff',
          Math.floor(now / 1000) - 3600,
          Math.floor(now / 1000) + (index === 1 ? -600 : 3600 * (index + 1)),
        ],
      },
      access,
    ),
  )
  const products = [
    { name: 'Annual membership', price: 75, membership: true, inventory: false },
    { name: 'Monthly membership', price: 20, membership: true, inventory: false },
    { name: 'Locker rental', price: 18, rental: true, inventory: false },
    { name: 'Room rental', price: 35, rental: true, inventory: false },
    { name: 'Bottled water', price: 3, inventory: 48 },
    { name: 'Towel', price: 5, inventory: 24 },
  ].map((doc, index) =>
    productFromLegacy(
      `demo-product-${index}`,
      { ...doc, access, active: true, cat: 'demo-category' },
      access,
    ),
  )
  return {
    mode: 'demo',
    clubName: 'Demo club',
    async listMembers({ search = '', status = 'all', offset = 0, limit = 25 }) {
      const needle = search.trim().toLocaleLowerCase()
      const filtered = members.filter((member) => {
        const state = membershipStatus(member, now)
        return (
          `${member.name} ${member.number}`.toLocaleLowerCase().includes(needle) &&
          (status === 'all' || (status === 'dna' ? member.dna : state.toLowerCase() === status))
        )
      })
      const start = Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0))
      const size = Math.max(1, Math.min(50, Math.floor(Number.isFinite(limit) ? limit : 25)))
      return {
        items: filtered.slice(start, start + size),
        total: filtered.length,
        nextOffset: start + size < filtered.length ? start + size : null,
      }
    },
    async getMember(id) {
      return members.find((member) => member.id === id) ?? null
    },
    async listActivity() {
      return activity
    },
    async listProducts() {
      return products
    },
  }
}
