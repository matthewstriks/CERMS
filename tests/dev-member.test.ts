import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  devMemberRecord,
  memberHash,
  normalizeMemberSearch,
  validateDevMember,
} from '../src/domain/dev-member'
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
  it('permits only the exact three create-only dev writes', () => {
    const body = JSON.stringify(payload())
    expect(isDevMemberCommit(body)).toBe(true)
    expect(
      allowFirebaseRequest(
        'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
        'POST',
        body,
      ),
    ).toBe(true)
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
  it('stores the selected catalog name and configured expiration', async () => {
    const now = Math.floor(Date.now() / 1000)
    await createDevMemberCreator(devCreatorUid, 'dev').create(draft(), crypto.randomUUID())
    const fields = JSON.parse(mock.fetch.mock.calls[0]![1].body).writes[0].update.fields
    expect(fields.productId.stringValue).toBe(membership.id)
    expect(fields.membership_type.stringValue).toBe(membership.name)
    expect(Number(fields.id_expiration.integerValue)).toBeGreaterThanOrEqual(
      now + membership.durationSeconds,
    )
    expect(Number(fields.id_expiration.integerValue)).toBeLessThanOrEqual(
      now + membership.durationSeconds + 2,
    )
  })
  it.each([
    { active: false },
    { membership: false },
    { restricted: true, restrictedUsers: ['someone-else'] },
  ])('rejects an unavailable membership at save time: %j', async (change) => {
    mock.getDoc.mockImplementation(async (path: string) => ({
      id: path.split('/').at(-1),
      exists: () => path.startsWith('users/') || path.includes('/products/'),
      data: () =>
        path.startsWith('users/')
          ? { access: 'dev' }
          : { ...catalogProduct(), ...change, version: 1 },
    }))
    await expect(
      createDevMemberCreator(devCreatorUid, 'dev').create(draft(), crypto.randomUUID()),
    ).rejects.toThrow('no longer an active membership')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('rejects changed name or duration after choices were shown', async () => {
    mock.products.mockResolvedValue({
      rows: [{ id: membership.id, version: 1, data: { ...catalogProduct(), name: 'Old name' } }],
      more: false,
    })
    const creator = createDevMemberCreator(devCreatorUid, 'dev')
    await creator.options()
    await expect(creator.create(draft(), crypto.randomUUID())).rejects.toThrow('product changed')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('rejects missing catalog products instead of falling back to development membership', async () => {
    await expect(
      createDevMemberCreator(devCreatorUid, 'dev').create(
        { ...draft(), membershipProductId: 'dev-annual' },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow('no longer exists')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('sends only a validated create commit after checking saved dev access', async () => {
    const creator = createDevMemberCreator(devCreatorUid, 'dev')
    const result = await creator.create(draft(), crypto.randomUUID())
    expect(result.name).toBe('José O’NEIL')
    expect(mock.fetch).toHaveBeenCalledTimes(1)
    expect(isDevMemberCommit(mock.fetch.mock.calls[0]![1].body)).toBe(true)
  })
  it('rejects other users/systems and access changes before sending a write', async () => {
    expect(() => createDevMemberCreator('staff', 'dev')).toThrow('owner')
    expect(() => createDevMemberCreator(devCreatorUid, 'TheZSATX')).toThrow('owner')
    mock.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ access: 'TheZSATX' }) })
    await expect(
      createDevMemberCreator(devCreatorUid, 'dev').create(draft(), crypto.randomUUID()),
    ).rejects.toThrow('system changed')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('returns a saved request without another write and rejects changed retry contents', async () => {
    const fingerprint = await memberHash(validateDevMember(draft()))
    const request = crypto.randomUUID()
    mock.getDoc.mockImplementation(async (path: string) => ({
      id: request,
      exists: () => true,
      data: () =>
        path.startsWith('users/')
          ? { access: 'dev' }
          : {
              access: 'dev',
              createdBy: devCreatorUid,
              fingerprint,
              id_number: 123456789,
              name: 'José O’NEIL',
            },
    }))
    const creator = createDevMemberCreator(devCreatorUid, 'dev')
    expect((await creator.create(draft(), request)).number).toBe(123456789)
    await expect(creator.create({ ...draft(), firstName: 'Changed' }, request)).rejects.toThrow(
      'different details',
    )
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('rejects duplicate identities without sending a write', async () => {
    mock.getDoc.mockImplementation(async (path: string) => ({
      exists: () => !path.startsWith('members/'),
      data: () => ({ access: 'dev' }),
    }))
    await expect(
      createDevMemberCreator(devCreatorUid, 'dev').create(draft(), crypto.randomUUID()),
    ).rejects.toThrow('already exists')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
})
