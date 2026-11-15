import { catalogFields, membershipProduct } from './fixtures/catalog.mjs'

export async function memberManagementRuleChecks({ base, seed, check, call, fields, str, owner }) {
  await seed('users/' + owner, { ...fields(owner), access: str('club-a') })
  const original = {
    access: 'club-a',
    name: 'Synthetic Guest',
    fname: 'Synthetic',
    lname: 'Guest',
    mname: '',
    suffix: '',
    dob: '1990-01-02',
    idnum: 'FAKE-EDIT',
    idstate: 'TX',
    email: '',
    membership_type: 'Legacy membership',
    id_expiration: 2000000000,
    id_number: 654321,
    checkedIn: false,
    dna: false,
    waiver_status: true,
    notes: ['Keep this note'],
    creation_time: 'historic-value',
    extraLegacyField: 'preserve',
  }
  await seed('members/editable', catalogFields(original))
  const changed = {
    fname: 'Edited',
    lname: 'Guest',
    mname: 'Middle',
    suffix: 'JR.',
    name: 'Edited Guest',
    dob: '1990-01-02',
    idnum: 'FAKE-EDIT',
    idstate: 'TX',
    email: 'test@example.test',
    phone: '+12105550123',
    membership_type: 'Legacy membership',
    id_expiration: 2000000000,
    dna: false,
    tag: true,
    searchFirst: 'edited',
    searchLast: 'guest',
    searchName: 'edited guest',
    searchId: 'FAKE-EDIT',
    searchEmail: 'test@example.test',
    updatedBy: owner,
  }
  const edit = (id = 'editable', data = changed) => ({
    writes: [
      {
        update: { name: `${base}/members/${id}`, fields: catalogFields(data) },
        updateMask: { fieldPaths: Object.keys(data) },
        currentDocument: { exists: true },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  })
  const commit = (body, uid = owner) => ({ uid, method: 'POST', body })
  for (const uid of [undefined, 'staff'])
    await check(
      'Member edit unauthorized identity',
      base + ':commit',
      { uid, method: 'POST', body: edit() },
      false,
    )
  for (const [key, v] of Object.entries({
    access: 'club-b',
    id_number: 123,
    waiver_status: false,
    checkedIn: true,
    notes: [],
    dna: true,
    notesRevision: 1,
    creation_time: 'changed',
    extraLegacyField: 'changed',
    updatedBy: 'staff',
  })) {
    await check(
      'Member edit protected field ' + key,
      base + ':commit',
      commit(edit('editable', { ...changed, [key]: v })),
      false,
    )
  }
  for (const [key, v] of Object.entries({
    fname: '',
    dob: '2020-01-01',
    id_expiration: -1,
    phone: '123',
    tag: 'true',
    membership_type: 'Forged membership',
  }))
    await check(
      'Member invalid edit ' + key,
      base + ':commit',
      commit(edit('editable', { ...changed, [key]: v })),
      false,
    )
  const removeRequired = edit()
  removeRequired.writes[0].updateMask.fieldPaths.push('access')
  await check(
    'Member cannot remove business field',
    base + ':commit',
    commit(removeRequired),
    false,
  )
  await check('Owner edits existing member', base + ':commit', commit(edit()), true)
  const read = await (await call(base + '/members/editable', { uid: owner })).json()
  if (
    read.fields.extraLegacyField.stringValue !== 'preserve' ||
    read.fields.notes.arrayValue.values[0].stringValue !== 'Keep this note'
  )
    throw new Error('Edit did not preserve legacy fields/notes')
  await seed('system/club-a/products/edit-plan', catalogFields(membershipProduct()))
  await check(
    'Owner changes member to catalog product',
    base + ':commit',
    commit(
      edit('editable', { ...changed, productId: 'edit-plan', membership_type: 'Fixture Monthly' }),
    ),
    true,
  )
  await seed('users/' + owner, { ...fields(owner), access: str('club-b') })
  await check('Foreign business member edit denied', base + ':commit', commit(edit()), false)
  await check(
    'Foreign business member delete denied',
    base + '/members/editable',
    { uid: owner, method: 'DELETE' },
    false,
  )
  await seed('users/' + owner, { ...fields(owner), access: str('club-a') })
  await check(
    'Staff member deletion denied',
    base + '/members/editable',
    { uid: 'staff', method: 'DELETE' },
    false,
  )
  await seed('members/checked-in', catalogFields({ ...original, checkedIn: true }))
  await check(
    'Checked-in member deletion denied',
    base + '/members/checked-in',
    { uid: owner, method: 'DELETE' },
    false,
  )
  await check(
    'Owner deletes legacy member record',
    base + '/members/editable',
    { uid: owner, method: 'DELETE' },
    true,
  )
  await check(
    'Retail product deletion allowed',
    base + '/system/club-a/products/product',
    { uid: owner, method: 'DELETE' },
    true,
  )
  await check(
    'Staff membership product deletion denied',
    base + '/system/club-a/products/edit-plan',
    { uid: 'staff', method: 'DELETE' },
    false,
  )
  await check(
    'Owner deletes membership product',
    base + '/system/club-a/products/edit-plan',
    { uid: owner, method: 'DELETE' },
    true,
  )
  // Managed Dev identity edits must move both reservations in one commit.
  await seed('users/' + owner, { ...fields(owner), access: str('dev') })
  const id = '30000000-0000-4000-8000-000000000001',
    oldKey = 'd'.repeat(64),
    newKey = 'e'.repeat(64)
  await seed(
    'members/' + id,
    catalogFields({
      ...original,
      access: 'dev',
      schemaVersion: 2,
      identityKey: oldKey,
      searchId: 'FAKE-EDIT',
      id_number: 987654321,
      createdBy: owner,
      productId: 'fixture-plan',
    }),
  )
  await seed('system/dev/memberIdentities/' + oldKey, { access: str('dev'), memberId: str(id) })
  await seed('system/dev/memberNumbers/987654321', { access: str('dev'), memberId: str(id) })
  await check('Managed member regular edit', base + ':commit', commit(edit(id, changed)), true)
  const move = edit(id, { ...changed, idnum: 'NEW-ID', searchId: 'NEW-ID', identityKey: newKey })
  await check(
    'Managed identity edit without reservations denied',
    base + ':commit',
    commit(move),
    false,
  )
  move.writes.push({ delete: base + '/system/dev/memberIdentities/' + oldKey })
  move.writes.push({
    update: {
      name: base + '/system/dev/memberIdentities/' + newKey,
      fields: { access: str('dev'), memberId: str(id) },
    },
    currentDocument: { exists: false },
  })
  await check('Managed identity moves atomically', base + ':commit', commit(move), true)
  await check(
    'Standalone identity deletion denied',
    base + '/system/dev/memberIdentities/' + newKey,
    { uid: owner, method: 'DELETE' },
    false,
  )
  await check(
    'Managed delete without releasing identity denied',
    base + '/members/' + id,
    { uid: owner, method: 'DELETE' },
    false,
  )
  await check(
    'Managed member and identity deletion',
    base + ':commit',
    commit({
      writes: [
        { delete: base + '/members/' + id },
        { delete: base + '/system/dev/memberIdentities/' + newKey },
      ],
    }),
    true,
  )
  await check(
    'Retired number remains reserved',
    base + '/system/dev/memberNumbers/987654321',
    { uid: owner },
    true,
  )
  await check(
    'Retired number cannot be deleted',
    base + '/system/dev/memberNumbers/987654321',
    { uid: owner, method: 'DELETE' },
    false,
  )
}
