import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  uid: 'c7D7AH07kgXmjn8tSiOgzHscLZ12',
  club: 'dev',
  data: new Map<string, any>(),
  read: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDoc: async (path: string) => ({
    exists: () => path.startsWith('users/'),
    data: () => ({ access: mock.club }),
  }),
}))
vi.mock('../src/data/firebase-membership', () => ({
  getFirebaseServices: () => ({
    db: {},
    auth: { currentUser: { uid: mock.uid, getIdToken: async () => 'synthetic' } },
  }),
}))
vi.mock('../src/data/firebase-versioned-document', () => ({
  documentBase: 'projects/cerms-7af24/databases/cerms/documents',
  readVersionedDocument: mock.read,
}))
vi.mock('../src/data/firebase-catalog', () => ({ createCatalog: vi.fn() }))
vi.mock('../src/data/catalog-memberships', () => ({
  catalogMembershipOptions: vi.fn(),
  catalogMembershipOption: vi.fn(),
}))
import { createMemberManagement } from '../src/data/firebase-member-management'
import { encodeMemberFields } from '../src/shared/member-management-policy'
import { memberHash } from '../src/domain/dev-member'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const id = '30000000-0000-4000-8000-000000000001'
const path = `members/${id}`
const client = () => createMemberManagement({ uid: owner, club: 'dev' })
beforeEach(async () => {
  mock.uid = owner
  mock.club = 'dev'
  mock.data.clear()
  const key = await memberHash(['dev', 'TX', 'FAKE-ID', '1990-01-02'])
  mock.data.set(path, {
    name: path,
    updateTime: '2026-01-01T00:00:00Z',
    fields: encodeMemberFields({
      access: 'dev',
      schemaVersion: 2,
      identityKey: key,
      fname: 'Synthetic',
      mname: '',
      lname: 'Guest',
      suffix: '',
      dob: '1990-01-02',
      idnum: 'FAKE-ID',
      idstate: 'TX',
      email: '',
      phone: '',
      membership_type: 'Legacy',
      id_number: 123456789,
      id_expiration: 2000000000,
      dna: false,
      tag: false,
      checkedIn: false,
    }),
  })
  mock.data.set(`system/dev/memberIdentities/${key}`, {
    updateTime: '2026-01-01T00:00:00Z',
    fields: encodeMemberFields({ memberId: id, access: 'dev' }),
  })
  mock.read
    .mockReset()
    .mockImplementation(async (path: string) => structuredClone(mock.data.get(path) ?? null))
  mock.fetch.mockReset().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', mock.fetch)
})
it('edits with a version precondition and preserves expiration and unedited fields', async () => {
  const original = await client().load(id)
  await client().save(original, { ...original.draft, firstName: 'Changed' })
  const writes = JSON.parse(mock.fetch.mock.calls[0]![1].body).writes
  expect(writes).toHaveLength(1)
  expect(writes[0].currentDocument.updateTime).toBe(original.snapshot.updateTime)
  expect(writes[0].update.fields.id_expiration.integerValue).toBe('2000000000')
  expect(writes[0].updateMask.fieldPaths).not.toContain('notes')
  expect(writes[0].updateMask.fieldPaths).not.toContain('access')
})
it('moves a managed identity atomically and rejects an occupied reservation', async () => {
  const original = await client().load(id)
  const draft = { ...original.draft, governmentId: 'NEW-ID' }
  const key = await memberHash(['dev', 'TX', 'NEW-ID', '1990-01-02'])
  mock.data.set(`system/dev/memberIdentities/${key}`, {
    fields: encodeMemberFields({ memberId: 'other' }),
  })
  await expect(client().save(original, draft)).rejects.toThrow('already uses')
  expect(mock.fetch).not.toHaveBeenCalled()
  mock.data.delete(`system/dev/memberIdentities/${key}`)
  await client().save(original, draft)
  const writes = JSON.parse(mock.fetch.mock.calls[0]![1].body).writes
  expect(writes).toHaveLength(3)
  expect(writes[1].delete).toContain('/memberIdentities/')
  expect(writes[2].update.name).toContain(key)
})
it('rejects concurrent edits and deletes before sending mutations', async () => {
  const original = await client().load(id)
  mock.data.get(path).updateTime = '2026-01-02T00:00:00Z'
  await expect(client().save(original, { ...original.draft, firstName: 'Stale' })).rejects.toThrow(
    'changed since',
  )
  await expect(client().remove(original)).rejects.toThrow('changed')
  expect(mock.fetch).not.toHaveBeenCalled()
})
it('blocks checked-in deletion and releases only the identity when deleting', async () => {
  mock.data.get(path).fields.checkedIn = { booleanValue: true }
  await expect(client().remove(await client().load(id))).rejects.toThrow('checked in')
  expect(mock.fetch).not.toHaveBeenCalled()
  mock.data.get(path).fields.checkedIn = { booleanValue: false }
  await client().remove(await client().load(id))
  const body = mock.fetch.mock.calls[0]![1].body
  expect(JSON.parse(body).writes).toHaveLength(2)
  expect(body).not.toContain('memberNumbers')
})
it('rejects staff, switched business access, and foreign records', async () => {
  mock.uid = 'staff'
  await expect(client().load(id)).rejects.toThrow('permission')
  mock.uid = owner
  mock.club = 'other'
  await expect(client().load(id)).rejects.toThrow('access changed')
  mock.club = 'dev'
  mock.data.get(path).fields.access = { stringValue: 'other' }
  await expect(client().load(id)).rejects.toThrow('different business')
  expect(mock.fetch).not.toHaveBeenCalled()
})
it('confirms an uncertain edit response against the saved values', async () => {
  const original = await client().load(id)
  mock.fetch.mockImplementation(async (_url: string, options: any) => {
    const fields = JSON.parse(options.body).writes[0].update.fields
    Object.assign(mock.data.get(path).fields, fields)
    mock.data.get(path).updateTime = '2026-01-02T00:00:00Z'
    throw new Error('lost response')
  })
  await client().save(original, { ...original.draft, firstName: 'Saved' })
  await client().save(original, { ...original.draft, firstName: 'Saved' })
  expect(mock.fetch).toHaveBeenCalledTimes(1)
})
