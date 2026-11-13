import { describe, expect, it, vi, beforeEach } from 'vitest'
import { devMemberRecord, normalizeMemberSearch, validateDevMember } from '../src/domain/dev-member'
import {
  devMemberCommit,
  isDevMemberCommit,
  devCreatorUid,
  type DevMemberFields,
} from '../src/shared/dev-member-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { emptyMemberDraft } from '../src/domain/member-creation'
import { productDefaults } from '../src/domain/catalog'
const membership = { id: 'fixture-plan', name: 'Fixture Monthly', durationSeconds: 30 * 86400 }
const catalogProduct = () => ({
  ...productDefaults(),
  name: membership.name,
  cat: 'memberships',
  membership: true,
  membershipLengthRaw: 30,
  membershipLengthType: 'day' as const,
})
const draft = () => ({
  ...emptyMemberDraft(),
  firstName: 'José',
  lastName: 'O’NEIL',
  birthDate: '1990-01-02',
  governmentId: '00123',
  governmentIdType: 'TX',
  membershipProductId: membership.id,
})
function payload() {
  const record = devMemberRecord(
    draft(),
    devCreatorUid,
    123456789,
    'a'.repeat(64),
    'b'.repeat(64),
    membership,
  )
  const fields: DevMemberFields = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'creation_time') continue
    fields[key] =
      typeof value === 'string'
        ? { stringValue: value }
        : typeof value === 'number'
          ? { integerValue: String(value) }
          : typeof value === 'boolean'
            ? { booleanValue: value }
            : { arrayValue: { values: [] } }
  }
  return devMemberCommit('11111111-1111-4111-8111-111111111111', fields, 'a'.repeat(64), 123456789)
}
describe('dev member write boundary', () => {
  it('preserves original names/leading zeros and builds bounded stable search fields', () => {
    expect(normalizeMemberSearch('  JOSÉ   Guest ')).toBe('jose guest')
    expect(
      devMemberRecord(
        draft(),
        devCreatorUid,
        123456789,
        'a'.repeat(64),
        'b'.repeat(64),
        membership,
      ),
    ).toMatchObject({
      access: 'dev',
      fname: 'José',
      searchFirst: 'jose',
      idnum: '00123',
      searchId: '00123',
      productId: 'fixture-plan',
      schemaVersion: 2,
    })
    expect(() => validateDevMember({ ...draft(), importExisting: true })).toThrow('Import')
    expect(() => validateDevMember({ ...draft(), governmentIdType: '' })).toThrow('issuing')
  })
  it('allows optional canonical phone and rejects malformed phone fields', () => {
    const p = payload()
    const fields = p.writes[0]!.update.fields as DevMemberFields
    fields.phone = { stringValue: '+12105550123' }
    expect(isDevMemberCommit(JSON.stringify(p))).toBe(true)
    for (const value of ['', '2105550123', '+00012345678', '+12105550123000000']) {
      fields.phone = { stringValue: value }
      expect(isDevMemberCommit(JSON.stringify(p))).toBe(false)
    }
    fields.phone = { integerValue: '12105550123' }
    expect(isDevMemberCommit(JSON.stringify(p))).toBe(false)
  })
  it('blocks desktop creation even for valid legacy create-only dev payloads', () => {
    const body = JSON.stringify(payload())
    expect(isDevMemberCommit(body)).toBe(true)
    expect(
      allowFirebaseRequest(
        'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
        'POST',
        body,
      ),
    ).toBe(false)
    for (const mutate of [
      (p: any) => {
        p.writes[1].update.name = p.writes[1].update.name.replace(
          '/system/dev/memberIdentities/',
          '/devMemberIdentities/',
        )
      },
      (p: any) => {
        p.writes[2].update.name = p.writes[2].update.name.replace(
          '/system/dev/memberNumbers/',
          '/devMemberNumbers/',
        )
      },
      (p: any) => {
        p.writes[1].update.name = p.writes[1].update.name.replace(
          '/system/dev/',
          '/system/TheZSATX/',
        )
      },
      (p: any) => {
        p.writes[0].currentDocument.exists = true
      },
      (p: any) => {
        p.writes[0].update.fields.access.stringValue = 'TheZSATX'
      },
      (p: any) => {
        p.writes[0].update.fields.createdBy.stringValue = 'staff'
      },
      (p: any) => {
        p.writes[0].update.name = p.writes[0].update.name.replace('/cerms/', '/(default)/')
      },
      (p: any) => {
        p.writes[1].update.fields.memberId.stringValue = 'other'
      },
      (p: any) => {
        p.writes[2].update.name += '0'
      },
      (p: any) => {
        p.writes.push(p.writes[0])
      },
      (p: any) => {
        p.writes[0].update.fields.extra = { stringValue: 'bad' }
      },
      (p: any) => {
        p.writes[0].updateTransforms[0].fieldPath = 'access'
      },
      (p: any) => {
        p.writes[1].delete = p.writes[1].update.name
      },
    ]) {
      const p = payload()
      mutate(p)
      expect(isDevMemberCommit(JSON.stringify(p))).toBe(false)
    }
  })
})
const mock = vi.hoisted(() => ({
  getDoc: vi.fn(),
  fetch: vi.fn(),
  products: vi.fn(),
  uid: 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
}))
vi.mock('../src/data/firebase-catalog', () => ({
  createCatalog: () => ({ products: mock.products }),
}))
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  getDoc: mock.getDoc,
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({
    db: {},
    auth: { currentUser: { uid: mock.uid, getIdToken: async () => 'synthetic-token' } },
  }),
}))
import { createDevMemberCreator } from '../src/data/firebase-dev-member-creator'
beforeEach(() => {
  mock.uid = devCreatorUid
  mock.getDoc.mockReset().mockImplementation(async (path: string) => ({
    id: path.split('/').at(-1),
    exists: () => path.startsWith('users/') || path === 'system/dev/products/fixture-plan',
    data: () =>
      path.startsWith('users/') ? { access: 'dev' } : { ...catalogProduct(), version: 1 },
  }))
  mock.fetch.mockReset().mockResolvedValue({ ok: true, status: 200 })
  mock.products.mockReset().mockResolvedValue({ rows: [], more: false })
  vi.stubGlobal('fetch', mock.fetch)
})
describe('dev creator with synthetic intercepted responses', () => {
  it('lists only catalog memberships with no placeholder fallback', async () => {
    const creator = createDevMemberCreator(devCreatorUid, 'dev')
    expect(await creator.options()).toEqual([])
    mock.products.mockResolvedValue({
      rows: [{ id: membership.id, version: 1, data: catalogProduct() }],
      more: false,
    })
    expect(await creator.options()).toEqual([{ ...membership, durationLabel: '30 days' }])
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('requires checkout and never sends a direct member write', async () => {
    await expect(
      createDevMemberCreator(devCreatorUid, 'dev').create(draft(), crypto.randomUUID()),
    ).rejects.toThrow('linked checkout')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('keeps new membership checkout limited to the Dev owner', () => {
    expect(() => createDevMemberCreator('staff', 'dev')).toThrow('owner')
    expect(() => createDevMemberCreator(devCreatorUid, 'club-a')).toThrow('owner')
  })
})
