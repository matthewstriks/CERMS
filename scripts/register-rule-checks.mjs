import assert from 'node:assert/strict'
import { registerOpen, registerClose } from './fixtures/registers.mjs'

export async function registerRuleChecks({ base, seed, check, call, fields, str }) {
  const uid = 'register-staff',
    other = 'register-other'
  await seed('users/' + uid, fields(uid))
  await seed('users/' + other, fields(other))
  await seed('users/register-foreign', { ...fields('register-foreign'), access: str('club-b') })
  let counter = 0
  const id = () => `20000000-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`
  const open = (registerId = id(), staff = uid, prior = false) =>
    registerOpen(base, 'club-a', staff, registerId, prior)
  const commit = (body, staff = uid) => ({ uid: staff, method: 'POST', body })
  const attempts = [
    ['missing companion claim', (p) => p.writes.pop()],
    ['forged staff owner', (p) => (p.writes[0].update.fields.ownerUid = str(other))],
    ['forged staff name', (p) => (p.writes[0].update.fields.ownerName = str('Someone else'))],
    [
      'incorrect opening total',
      (p) => (p.writes[0].update.fields.openingTotalCents.integerValue = '1'),
    ],
    [
      'negative count',
      (p) => (p.writes[0].update.fields.openingCounts.mapValue.fields.bill1.integerValue = '-1'),
    ],
    [
      'fractional count',
      (p) => (p.writes[0].update.fields.openingCounts.mapValue.fields.bill1 = { doubleValue: 0.5 }),
    ],
    [
      'oversized count',
      (p) => (p.writes[0].update.fields.openingCounts.mapValue.fields.bill1.integerValue = '10001'),
    ],
    [
      'missing denomination',
      (p) => delete p.writes[0].update.fields.openingCounts.mapValue.fields.bill2,
    ],
    [
      'extra denomination',
      (p) =>
        (p.writes[0].update.fields.openingCounts.mapValue.fields.extra = { integerValue: '0' }),
    ],
    ['extra register field', (p) => (p.writes[0].update.fields.extra = str('bad'))],
    [
      'non-server opened time',
      (p) => {
        delete p.writes[0].updateTransforms
        p.writes[0].update.fields.openedAt = { timestampValue: '2020-01-01T00:00:00Z' }
      },
    ],
    ['claim for different register', (p) => (p.writes[1].update.fields.registerId = str(id()))],
    ['extra claim field', (p) => (p.writes[1].update.fields.extra = str('bad'))],
  ]
  for (const [label, mutate] of attempts) {
    const body = open()
    mutate(body)
    await check('Register rejects ' + label, base + ':commit', commit(body), false)
  }
  await check(
    'Anonymous register creation denied',
    base + ':commit',
    { method: 'POST', body: open() },
    false,
  )
  await check(
    'Foreign business register creation denied',
    base + ':commit',
    commit(open(), 'register-foreign'),
    false,
  )
  await check(
    'Dangling register owner claim denied',
    base + ':commit',
    commit({ writes: [open().writes[1]] }),
    false,
  )
  const first = id()
  await check('Staff opens register with atomic claim', base + ':commit', commit(open(first)), true)
  const registerPath = `${base}/system/club-a/registers/${first}`
  await check('Business staff reads open registers', registerPath, { uid: other }, true)
  await check(
    'Foreign business cannot read register',
    registerPath,
    { uid: 'register-foreign' },
    false,
  )
  await check('Anonymous cannot read register', registerPath, {}, false)
  await check(
    'Second simultaneous register denied',
    base + ':commit',
    commit(open(id(), uid, true)),
    false,
  )
  await check(
    'Other staff cannot close register',
    base + ':commit',
    commit(registerClose(base, 'club-a', first), other),
    false,
  )
  for (const [label, mutate] of [
    [
      'opening count change',
      (p) => {
        p.writes[0].update.fields.openingTotalCents = { integerValue: '0' }
        p.writes[0].updateMask.fieldPaths.push('openingTotalCents')
      },
    ],
    [
      'owner reassignment',
      (p) => {
        p.writes[0].update.fields.ownerUid = str(other)
        p.writes[0].updateMask.fieldPaths.push('ownerUid')
      },
    ],
    [
      'wrong closing total',
      (p) => (p.writes[0].update.fields.closingTotalCents.integerValue = '0'),
    ],
    [
      'missing closing denomination',
      (p) => delete p.writes[0].update.fields.closingCounts.mapValue.fields.coin1,
    ],
    ['long closing note', (p) => (p.writes[0].update.fields.closeNote = str('x'.repeat(2001)))],
    [
      'removed required opening data',
      (p) => p.writes[0].updateMask.fieldPaths.push('openingCounts'),
    ],
    [
      'old closing time',
      (p) => {
        delete p.writes[0].updateTransforms
        p.writes[0].update.fields.closedAt = { timestampValue: '2020-01-01T00:00:00Z' }
        p.writes[0].updateMask.fieldPaths.push('closedAt')
      },
    ],
  ]) {
    const body = registerClose(base, 'club-a', first)
    mutate(body)
    await check('Register rejects ' + label, base + ':commit', commit(body), false)
  }
  await check(
    'Staff closes own register',
    base + ':commit',
    commit(registerClose(base, 'club-a', first)),
    true,
  )
  await check(
    'Closed counts immutable',
    base + ':commit',
    commit(registerClose(base, 'club-a', first)),
    false,
  )
  await check('Closed history readable in same business', registerPath, { uid: other }, true)
  await check('Register deletion denied', registerPath, { uid, method: 'DELETE' }, false)
  await check(
    'Claim deletion denied',
    `${base}/system/club-a/registerOwners/${uid}`,
    { uid, method: 'DELETE' },
    false,
  )
  await check(
    'Other staff claim read denied',
    `${base}/system/club-a/registerOwners/${uid}`,
    { uid: other },
    false,
  )
  const second = id()
  await check(
    'Staff opens again after close',
    base + ':commit',
    commit(open(second, uid, true)),
    true,
  )
  await check(
    'Another staff can open independently',
    base + ':commit',
    commit(open(id(), other), other),
    true,
  )
  const list = {
    structuredQuery: {
      from: [{ collectionId: 'registers' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: str('open') } },
      orderBy: [{ field: { fieldPath: 'openedAt' }, direction: 'DESCENDING' }],
      limit: 50,
    },
  }
  await check('Open register page query', base + '/system/club-a:runQuery', commit(list), true)
  list.structuredQuery.where.fieldFilter.value = str('closed')
  await check('Closed register page query', base + '/system/club-a:runQuery', commit(list), true)
  list.structuredQuery.limit = 51
  await check(
    'Unbounded register query denied',
    base + '/system/club-a:runQuery',
    commit(list),
    false,
  )
  await seed('users/' + uid, { ...fields(uid), access: str('club-b') })
  await check('Former business register access revoked', registerPath, { uid }, false)
  await check(
    'Former business register close revoked',
    base + ':commit',
    commit(registerClose(base, 'club-a', second)),
    false,
  )
  const manager = 'register-manager'
  await seed('users/' + manager, fields(manager))
  const permissions = {
    editMembers: false,
    deleteMembers: false,
    manageProducts: false,
    openRegisters: false,
    closeRegisters: false,
    closeOtherRegisters: true,
  }
  await seed('system/club-a/staffPermissions/' + manager, {
    permissions: {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(permissions).map(([k, v]) => [k, { booleanValue: v }]),
        ),
      },
    },
  })
  const managedClose = () => {
    const body = registerClose(base, 'club-a', second)
    Object.assign(body.writes[0].update.fields, {
      closedByUid: str(manager),
      closedByName: str('Synthetic Staff'),
    })
    body.writes[0].updateMask.fieldPaths.push('closedByUid', 'closedByName')
    return body
  }
  await check(
    'Manager close requires actor metadata',
    base + ':commit',
    commit(registerClose(base, 'club-a', second), manager),
    false,
  )
  const spoofed = managedClose()
  spoofed.writes[0].update.fields.closedByUid = str(other)
  await check(
    'Manager cannot forge closer identity',
    base + ':commit',
    commit(spoofed, manager),
    false,
  )
  const badName = managedClose()
  badName.writes[0].update.fields.closedByName = str('Someone else')
  await check('Manager cannot forge closer name', base + ':commit', commit(badName, manager), false)
  await check(
    'Other staff still cannot use manager close',
    base + ':commit',
    commit(managedClose(), other),
    false,
  )
  await seed('users/' + manager, { ...fields(manager), access: str('club-b') })
  await check(
    'Manager cannot close across businesses',
    base + ':commit',
    commit(managedClose(), manager),
    false,
  )
  await seed('users/' + manager, fields(manager))
  await check(
    'Manager closes another register without own-close permission',
    base + ':commit',
    commit(managedClose(), manager),
    true,
  )
  await check(
    'Manager cannot change closed counts',
    base + ':commit',
    commit(managedClose(), manager),
    false,
  )
  await seed('users/' + uid, fields(uid))
  await check(
    'Cashier can reopen after manager close',
    base + ':commit',
    commit(open(id(), uid, true)),
    true,
  )
  // Racing open requests for one new user cannot both succeed.
  const racer = 'register-racer'
  await seed('users/' + racer, fields(racer))
  const results = await Promise.all([
    call(base + ':commit', commit(open(id(), racer), racer)),
    call(base + ':commit', commit(open(id(), racer), racer)),
  ])
  assert.equal(
    results.filter((response) => response.ok).length,
    1,
    'Only one concurrent open can commit',
  )
}
