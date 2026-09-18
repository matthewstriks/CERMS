const base = 'projects/cerms-7af24/databases/cerms/documents'
export const devCreatorUid = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
export const canCreateDevMember = (uid: string, club: string) =>
  uid === devCreatorUid && club === 'dev'
export const devMemberStringFields = [
  'access',
  'name',
  'fname',
  'lname',
  'mname',
  'suffix',
  'dob',
  'membership_type',
  'idnum',
  'idstate',
  'email',
  'createdBy',
  'productId',
  'identityKey',
  'fingerprint',
  'searchFirst',
  'searchLast',
  'searchName',
  'searchId',
  'searchEmail',
] as const
export type FirestoreField =
  | { stringValue: string }
  | { integerValue: string }
  | { booleanValue: boolean }
  | { arrayValue: { values?: { stringValue: string }[] } }
export type DevMemberFields = Record<string, FirestoreField>
function exact(value: unknown, keys: string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
export function devMemberCommit(
  id: string,
  fields: DevMemberFields,
  identity: string,
  number: number,
) {
  const claim = { access: { stringValue: 'dev' }, memberId: { stringValue: id } }
  return {
    writes: [
      {
        update: { name: `${base}/members/${id}`, fields },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'creation_time', setToServerValue: 'REQUEST_TIME' }],
      },
      {
        update: { name: `${base}/system/dev/memberIdentities/${identity}`, fields: claim },
        currentDocument: { exists: false },
      },
      {
        update: { name: `${base}/system/dev/memberNumbers/${number}`, fields: claim },
        currentDocument: { exists: false },
      },
    ],
  }
}
/** Exactly three create-only writes in dev. No updates, deletes, arbitrary transforms or other databases. */
export function isDevMemberCommit(body?: string): boolean {
  try {
    const payload = JSON.parse(body ?? '{}')
    if (
      !exact(payload, ['writes']) ||
      !Array.isArray(payload.writes) ||
      payload.writes.length !== 3
    )
      return false
    const [member] = payload.writes
    if (
      !exact(member, ['update', 'currentDocument', 'updateTransforms']) ||
      !exact(member.update, ['name', 'fields'])
    )
      return false
    const id = member.update.name?.slice(`${base}/members/`.length)
    if (!/^[a-f0-9-]{36}$/.test(id) || member.update.name !== `${base}/members/${id}`) return false
    const f = member.update.fields
    if (
      !exact(f, [
        ...devMemberStringFields,
        ...(Object.hasOwn(f, 'phone') ? ['phone'] : []),
        'dna',
        'checkedIn',
        'waiver_status',
        'id_number',
        'id_expiration',
        'schemaVersion',
        'notes',
      ])
    )
      return false
    if (
      Object.hasOwn(f, 'phone') &&
      (!exact(f.phone, ['stringValue']) ||
        typeof f.phone.stringValue !== 'string' ||
        !/^\+[1-9]\d{7,14}$/.test(f.phone.stringValue))
    )
      return false
    for (const key of devMemberStringFields)
      if (
        !exact(f[key], ['stringValue']) ||
        typeof f[key].stringValue !== 'string' ||
        f[key].stringValue.length > 500
      )
        return false
    if (
      f.access.stringValue !== 'dev' ||
      f.createdBy.stringValue !== devCreatorUid ||
      f.productId.stringValue !== 'dev-annual' ||
      f.membership_type.stringValue !== 'Development membership'
    )
      return false
    if (
      !f.fname.stringValue ||
      !f.lname.stringValue ||
      !f.idnum.stringValue ||
      !f.idstate.stringValue
    )
      return false
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(f.dob.stringValue) ||
      !/^[a-f0-9]{64}$/.test(f.identityKey.stringValue) ||
      !/^[a-f0-9]{64}$/.test(f.fingerprint.stringValue)
    )
      return false
    for (const key of ['dna', 'checkedIn', 'waiver_status'])
      if (!exact(f[key], ['booleanValue']) || f[key].booleanValue !== false) return false
    for (const key of ['id_number', 'id_expiration', 'schemaVersion'])
      if (
        !exact(f[key], ['integerValue']) ||
        typeof f[key].integerValue !== 'string' ||
        !/^\d+$/.test(f[key].integerValue) ||
        !Number.isSafeInteger(Number(f[key].integerValue))
      )
        return false
    if (!/^[1-9]\d{8}$/.test(f.id_number.integerValue) || f.schemaVersion.integerValue !== '2')
      return false
    if (
      !exact(f.notes, ['arrayValue']) ||
      !exact(f.notes.arrayValue, ['values']) ||
      !Array.isArray(f.notes.arrayValue.values) ||
      f.notes.arrayValue.values.length > 1 ||
      f.notes.arrayValue.values.some(
        (v: unknown) =>
          !exact(v, ['stringValue']) ||
          typeof (v as { stringValue: unknown }).stringValue !== 'string' ||
          (v as { stringValue: string }).stringValue.length > 10200,
      )
    )
      return false
    const expected = devMemberCommit(
      id,
      f,
      f.identityKey.stringValue,
      Number(f.id_number.integerValue),
    )
    // Compare structures without depending on JSON property order.
    for (let i = 0; i < 3; i++) {
      const actual = payload.writes[i],
        want = expected.writes[i]!
      if (
        !exact(
          actual,
          i === 0
            ? ['update', 'currentDocument', 'updateTransforms']
            : ['update', 'currentDocument'],
        ) ||
        !exact(actual.currentDocument, ['exists']) ||
        actual.currentDocument.exists !== false ||
        !exact(actual.update, ['name', 'fields']) ||
        actual.update.name !== want.update.name
      )
        return false
      if (
        i > 0 &&
        (!exact(actual.update.fields, ['access', 'memberId']) ||
          !exact(actual.update.fields.access, ['stringValue']) ||
          actual.update.fields.access.stringValue !== 'dev' ||
          !exact(actual.update.fields.memberId, ['stringValue']) ||
          actual.update.fields.memberId.stringValue !== id)
      )
        return false
    }
    return (
      Array.isArray(member.updateTransforms) &&
      member.updateTransforms.length === 1 &&
      exact(member.updateTransforms[0], ['fieldPath', 'setToServerValue']) &&
      member.updateTransforms[0].fieldPath === 'creation_time' &&
      member.updateTransforms[0].setToServerValue === 'REQUEST_TIME'
    )
  } catch {
    return false
  }
}
