import { describe, expect, it } from 'vitest'
import {
  activityFromLegacy,
  finiteNumber,
  memberFromLegacy,
  membershipStatus,
  timestampToMillis,
  unixSecondsToMillis,
} from '../src/domain/legacy'
import { createDemoRepository } from '../src/data/demo'
import { isTrustedRenderer, rendererAsset } from '../src/main/security'

describe('legacy read compatibility', () => {
  it('preserves document ID separately from the membership number and leaves unknown fields intact', () => {
    const document = Object.freeze({
      access: 'club-a',
      id_number: 1001,
      fname: 'Sample',
      lname: 'Member',
      id_expiration: '1700000000',
      futureField: { retained: true },
    })
    const member = memberFromLegacy('firestore-id', document, 'club-a')
    expect(member).toMatchObject({
      id: 'firestore-id',
      number: '1001',
      name: 'Sample Member',
      expiresAt: 1700000000000,
    })
    expect(document.futureField).toEqual({ retained: true })
  })
  it('fails closed across club boundaries and for a missing club', () => {
    expect(() => memberFromLegacy('id', { access: 'club-b' }, 'club-a')).toThrow()
    expect(() => memberFromLegacy('id', { access: '' }, '')).toThrow()
    expect(() => memberFromLegacy('id', {}, 'club-a')).toThrow()
  })
  it('handles missing and malformed timestamps without inventing dates', () => {
    for (const value of [null, undefined, false, '', ' ', 'bad', Infinity])
      expect(unixSecondsToMillis(value)).toBeNull()
    expect(timestampToMillis({ seconds: 1700000000, nanoseconds: 123000000 })).toBe(1700000000123)
    expect(timestampToMillis({ seconds: 1, nanoseconds: -1 })).toBeNull()
    expect(timestampToMillis(1700000000)).toBeNull()
    expect(timestampToMillis(new Date('invalid'))).toBeNull()
    expect(finiteNumber(false)).toBeNull()
    expect(finiteNumber('0')).toBe(0)
  })
  it('maps legacy locker arrays and treats malformed fields as unknown', () => {
    const visit = activityFromLegacy(
      'v1',
      {
        access: 'a',
        memberID: 'm1',
        lockerRoomStatus: [true, '07', 'Locker', 'staff', 100, 200],
        timeIn: { seconds: 100 },
        active: true,
      },
      'a',
    )
    expect(visit).toMatchObject({
      memberId: 'm1',
      location: '07',
      rental: 'Locker',
      expiresAt: 200000,
      enteredAt: 100000,
    })
    expect(
      activityFromLegacy('v2', { access: 'a', lockerRoomStatus: false }, 'a').expiresAt,
    ).toBeNull()
  })
  it('prioritizes do-not-admit and preserves legacy string notes', () => {
    const member = memberFromLegacy(
      'm',
      { access: 'a', dna: true, notes: 'Old note', id_expiration: 200 },
      'a',
    )
    expect(membershipStatus(member, 1000)).toBe('Do not admit')
    expect(member.notes).toEqual(['Old note'])
    expect(membershipStatus({ ...member, dna: false }, 200000)).toBe('Expired')
    expect(membershipStatus({ ...member, dna: false, expiresAt: null }, 0)).toBe('Unknown')
  })
})
describe('demo repository', () => {
  const repository = createDemoRepository(1700000000000)
  it('supports bounded pagination and member search', async () => {
    const first = await repository.listMembers({ limit: 5 })
    const second = await repository.listMembers({ offset: first.nextOffset!, limit: 5 })
    expect(first.total).toBe(8)
    expect(first.items).toHaveLength(5)
    expect(second.items).toHaveLength(3)
    expect(second.nextOffset).toBeNull()
    expect(new Set([...first.items, ...second.items].map((member) => member.id)).size).toBe(8)
    expect((await repository.listMembers({ search: '1041' })).items[0]?.name).toBe('Alex Morgan')
    expect((await repository.listMembers({ search: 'missing' })).items).toEqual([])
  })
  it('filters status and handles missing records', async () => {
    expect((await repository.listMembers({ status: 'dna' })).total).toBe(1)
    expect((await repository.listMembers({ status: 'expired' })).total).toBe(1)
    expect(await repository.getMember('missing')).toBeNull()
  })
})
describe('desktop boundary', () => {
  it('only serves renderer assets inside the app directory', () => {
    expect(rendererAsset('/app/renderer', 'cerms://app/')).toBe('/app/renderer/index.html')
    expect(rendererAsset('/app/renderer', 'cerms://app/assets/main.js')).toBe(
      '/app/renderer/assets/main.js',
    )
    expect(rendererAsset('/app/renderer', 'cerms://app/..%2fsecret')).toBeNull()
    expect(rendererAsset('/app/renderer', 'cerms://evil/index.html')).toBeNull()
    expect(rendererAsset('/app/renderer', 'cerms://app/%ZZ')).toBeNull()
  })
  it('rejects foreign origins and malformed sender URLs', () => {
    expect(isTrustedRenderer('cerms://app/index.html#members')).toBe(true)
    expect(isTrustedRenderer('https://app/index.html')).toBe(false)
    expect(isTrustedRenderer('http://127.0.0.1:5173/#members', 'http://127.0.0.1:5173')).toBe(true)
    expect(isTrustedRenderer('http://127.0.0.1:5174', 'http://127.0.0.1:5173')).toBe(false)
    expect(isTrustedRenderer('not a url')).toBe(false)
  })
})
