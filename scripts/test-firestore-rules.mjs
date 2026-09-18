import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
const project = 'demo-cerms-rules'
const cache = join(homedir(), '.cache/firebase/emulators')
const jars = (await readdir(cache))
  .filter((n) => /^cloud-firestore-emulator-.*\.jar$/.test(n))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
assert.ok(jars.length, 'Cached Firestore emulator required')
const port = await new Promise((resolve, reject) => {
  const s = createServer()
  s.on('error', reject)
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port
    s.close(() => resolve(p))
  })
})
const dir = await mkdtemp(join(tmpdir(), 'cerms-rules-'))
const emulator = spawn(
  'java',
  [
    '-jar',
    join(cache, jars.at(-1)),
    '--host=127.0.0.1',
    `--port=${port}`,
    `--project_id=${project}`,
    '--single_project_mode',
    '--single_project_mode_error',
    `--rules=${resolve('firebase/cerms.rules')}`,
  ],
  { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
)
let logs = ''
for (const stream of [emulator.stdout, emulator.stderr])
  stream.on('data', (b) => (logs = (logs + b).slice(-12000)))
const exited = new Promise((r) => emulator.once('exit', r))
const origin = `http://127.0.0.1:${port}`
const base = `projects/${project}/databases/cerms/documents`
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const str = (stringValue) => ({ stringValue })
const jwt = (uid) => {
  const now = Math.floor(Date.now() / 1000)
  return (
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(
      JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: project,
        iss: `https://securetoken.google.com/${project}`,
        iat: now,
        exp: now + 3600,
        auth_time: now,
        firebase: { sign_in_provider: 'password' },
      }),
    ).toString('base64url') +
    '.'
  )
}
let checks = 0
async function call(path, { uid, method = 'GET', body, admin = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (admin) headers.Authorization = 'Bearer owner'
  else if (uid) headers.Authorization = 'Bearer ' + jwt(uid)
  return fetch(origin + '/v1/' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}
async function check(label, path, options, allowed) {
  const r = await call(path, options)
  const b = await r.text()
  const denied = r.status === 403 || b.includes('PERMISSION_DENIED')
  assert.equal(r.ok && !denied, allowed, `${label}: ${r.status} ${b.slice(0, 450)}`)
  if (!allowed) assert.ok(denied, `${label}: expected permission denial`)
  checks++
}
const fields = (uid) => ({
  uid: str(uid),
  displayName: str('Synthetic Staff'),
  access: str('club-a'),
  rank: str('staff'),
})
async function seed(path, data) {
  const r = await call(base + '/' + path, { method: 'PATCH', body: { fields: data }, admin: true })
  assert.ok(r.ok, await r.text())
}
const patch = (uid, updates) => ({ uid, method: 'PATCH', body: { fields: updates } })
function query(collection, filters = [], extra = {}) {
  return {
    structuredQuery: {
      from: [{ collectionId: collection }],
      ...(filters.length
        ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } }
        : {}),
      ...extra,
    },
  }
}
const eq = (name, value) => ({ fieldFilter: { field: { fieldPath: name }, op: 'EQUAL', value } })
try {
  let ready = false
  for (let i = 0; i < 80; i++) {
    if (emulator.exitCode !== null) throw Error(logs)
    try {
      await fetch(origin, { signal: AbortSignal.timeout(500) })
      ready = true
      break
    } catch {
      await delay(250)
    }
  }
  assert.ok(ready, logs)
  // Explicitly load exact production rules for the named database. Never contact a live project.
  const rules = await readFile('firebase/cerms.rules', 'utf8')
  const load = await fetch(
    origin + `/emulator/v1/projects/${project}/databases/cerms:securityRules`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'cerms.rules', content: rules }] } }),
    },
  )
  assert.ok(load.ok, 'Named rules loading failed: ' + (await load.text()))
  for (const uid of ['staff', 'other', owner]) await seed('users/' + uid, fields(uid))
  await seed('users/wrong-uid', { ...fields('different'), access: str('club-a') })
  await seed('users/no-access', { uid: str('no-access') })
  for (const club of ['a', 'b']) {
    await seed('system/club-' + club, { businessName: str('Synthetic ' + club) })
    for (const collection of ['members', 'orders', 'activity'])
      await seed(collection + '/' + club, {
        access: str('club-' + club),
        name: str('Synthetic'),
        creation_time: { integerValue: '1' },
        active: { booleanValue: true },
        memberID: str('a'),
        customerID: str('a'),
        dna: { booleanValue: true },
        dob: str('1980-01-01'),
        id_number: { integerValue: '1' },
      })
  }
  const userPath = base + '/users/staff'
  for (const uid of [undefined, 'other', owner])
    await check('Other/anonymous profile read', userPath, { uid }, false)
  await check('Own profile without email/version', userPath, { uid: 'staff' }, true)
  await check(
    'Profile listing',
    base + ':runQuery',
    { uid: owner, method: 'POST', body: query('users') },
    false,
  )
  await check('Self provision', base + '/users/new', patch('new', fields('new')), false)
  await check('Own profile delete', userPath, { uid: 'staff', method: 'DELETE' }, false)
  for (const change of [
    { rank: str('admin') },
    { access: str('club-b') },
    { permissionEditMembers: { booleanValue: true } },
    { version: str('5') },
    { uid: str('other') },
    { displayName: str('Changed') },
  ])
    await check(
      'Staff mutation',
      userPath,
      patch('staff', { ...fields('staff'), ...change }),
      false,
    )
  for (const uid of [undefined, 'unprovisioned', 'wrong-uid', 'no-access'])
    await check('Unprovisioned data access', base + '/members/a', { uid }, false)
  for (const collection of ['members', 'activity', 'orders']) {
    await check('Own club read', base + '/' + collection + '/a', { uid: 'staff' }, true)
    await check('Other club read', base + '/' + collection + '/b', { uid: 'staff' }, false)
    await check(
      'Scoped query',
      base + ':runQuery',
      { uid: 'staff', method: 'POST', body: query(collection, [eq('access', str('club-a'))]) },
      true,
    )
    await check(
      'Unscoped query',
      base + ':runQuery',
      { uid: 'staff', method: 'POST', body: query(collection) },
      false,
    )
    await check(
      'Cross-club query',
      base + ':runQuery',
      { uid: 'staff', method: 'POST', body: query(collection, [eq('access', str('club-b'))]) },
      false,
    )
    for (const uid of ['staff', owner])
      for (const method of ['PATCH', 'DELETE'])
        await check(
          'Business mutation',
          base + '/' + collection + '/a',
          {
            uid,
            method,
            ...(method === 'PATCH' ? { body: { fields: { access: str('club-a') } } } : {}),
          },
          false,
        )
  }
  const qcases = [
    query('members', [eq('access', str('club-a'))], {
      orderBy: [{ field: { fieldPath: 'creation_time' }, direction: 'DESCENDING' }],
      limit: 26,
    }),
    query('members', [eq('access', str('club-a')), eq('dna', { booleanValue: true })], {
      limit: 26,
    }),
    query(
      'members',
      [
        eq('access', str('club-a')),
        {
          compositeFilter: {
            op: 'OR',
            filters: ['name', 'fname', 'lname'].map((k) => eq(k, str('Synthetic'))),
          },
        },
      ],
      { limit: 26 },
    ),
    query(
      'members',
      [
        eq('access', str('club-a')),
        {
          fieldFilter: {
            field: { fieldPath: 'dob' },
            op: 'IN',
            value: { arrayValue: { values: [str('1980-01-01'), str('01/01/1980')] } },
          },
        },
      ],
      { limit: 26 },
    ),
    query('activity', [eq('access', str('club-a')), eq('active', { booleanValue: true })]),
    query('activity', [eq('access', str('club-a')), eq('memberID', str('a'))], { limit: 51 }),
    query('orders', [eq('access', str('club-a')), eq('customerID', str('a'))], { limit: 51 }),
  ]
  for (const body of qcases)
    await check(
      'Existing application query',
      base + ':runQuery',
      { uid: 'staff', method: 'POST', body },
      true,
    )
  for (const uid of [undefined, 'staff'])
    await check(
      'System list non-owner',
      base + ':runQuery',
      { uid, method: 'POST', body: query('system') },
      false,
    )
  await check(
    'Owner system list',
    base + ':runQuery',
    { uid: owner, method: 'POST', body: query('system') },
    true,
  )
  const ownerPath = base + '/users/' + owner
  for (const change of [
    { rank: str('admin') },
    { uid: str('staff') },
    { email: str('changed@example.test') },
    { version: str('5') },
    { extra: str('x') },
    { access: str('missing') },
    { access: str('bad/path') },
    { access: str(' ') },
    { access: str('x'.repeat(1501)) },
    { access: { integerValue: '1' } },
  ])
    await check(
      'Owner mutation rejected',
      ownerPath,
      patch(owner, { ...fields(owner), ...change }),
      false,
    )
  const missingRank = fields(owner)
  delete missingRank.rank
  await check('Required field removal', ownerPath, patch(owner, missingRank), false)
  await check(
    'Owner changes other profile',
    userPath,
    patch(owner, { ...fields('staff'), access: str('club-b') }),
    false,
  )
  await check(
    'Owner system write',
    base + '/system/club-c',
    patch(owner, { businessName: str('New') }),
    false,
  )
  await check(
    'Authorized switch',
    ownerPath,
    patch(owner, { ...fields(owner), access: str('club-b') }),
    true,
  )
  await check('Old club revoked', base + '/members/a', { uid: owner }, false)
  await check('New club granted', base + '/members/b', { uid: owner }, true)
  for (const path of ['future/item', 'users/staff/private/item', 'members/a/private/item']) {
    await seed(path, { secret: str('fixture') })
    await check('Unknown/nested read', base + '/' + path, { uid: owner }, false)
    await check('Unknown/nested write', base + '/' + path, patch(owner, { value: str('x') }), false)
  }
  // Synthetic development creation: same three create-only writes as the desktop.
  await seed('system/dev', { businessName: str('Synthetic Dev') })
  await seed('users/' + owner, { ...fields(owner), access: str('dev') })
  await seed('users/dev-staff', { ...fields('dev-staff'), access: str('dev') })
  const devId = '11111111-1111-4111-8111-111111111111'
  const devBody = () => {
    const strings = {
      access: 'dev',
      name: 'Synthetic Guest',
      fname: 'Synthetic',
      lname: 'Guest',
      mname: '',
      suffix: '',
      dob: '1990-01-02',
      membership_type: 'Development membership',
      idnum: 'FAKE-001',
      idstate: 'TX',
      email: '',
      createdBy: owner,
      productId: 'dev-annual',
      identityKey: 'a'.repeat(64),
      fingerprint: 'b'.repeat(64),
      searchFirst: 'synthetic',
      searchLast: 'guest',
      searchName: 'synthetic guest',
      searchId: 'FAKE-001',
      searchEmail: '',
    }
    const data = Object.fromEntries(
      Object.entries(strings).map(([key, value]) => [key, str(value)]),
    )
    Object.assign(data, {
      schemaVersion: { integerValue: '2' },
      id_number: { integerValue: '123456789' },
      id_expiration: { integerValue: String(Math.floor(Date.now() / 1000) + 365 * 86400) },
      dna: { booleanValue: false },
      checkedIn: { booleanValue: false },
      waiver_status: { booleanValue: false },
      notes: { arrayValue: { values: [] } },
    })
    const claim = { access: str('dev'), memberId: str(devId) }
    return {
      writes: [
        {
          update: { name: base + '/members/' + devId, fields: data },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'creation_time', setToServerValue: 'REQUEST_TIME' }],
        },
        {
          update: { name: base + '/system/dev/memberIdentities/' + 'a'.repeat(64), fields: claim },
          currentDocument: { exists: false },
        },
        {
          update: { name: base + '/system/dev/memberNumbers/123456789', fields: claim },
          currentDocument: { exists: false },
        },
      ],
    }
  }
  for (const uid of [undefined, 'staff', 'dev-staff'])
    await check(
      'Dev create rejects other identities',
      base + ':commit',
      { uid, method: 'POST', body: devBody() },
      false,
    )
  for (const mutate of [
    (b) => {
      b.writes[0].update.fields.access = str('club-a')
    },
    (b) => {
      b.writes[0].update.fields.createdBy = str('dev-staff')
    },
    (b) => {
      b.writes[0].update.fields.extra = str('pollution')
    },
    (b) => {
      delete b.writes[0].update.fields.dob
    },
    (b) => {
      b.writes[0].update.fields.dob = str('2020-01-01')
    },
    (b) => {
      b.writes[0].update.fields.dob = str('1990-02-30')
    },
    (b) => {
      b.writes[0].update.fields.dna = { booleanValue: true }
    },
    (b) => {
      b.writes[0].update.fields.schemaVersion = { integerValue: '1' }
    },
    (b) => {
      b.writes[0].update.fields.id_number = { integerValue: '-1' }
    },
    (b) => {
      b.writes[0].update.fields.id_expiration = { integerValue: '1' }
    },
    (b) => {
      b.writes[0].update.fields.fname = str('X'.repeat(201))
    },
    (b) => {
      b.writes[0].update.fields.notes = { arrayValue: { values: [str('X'.repeat(10201))] } }
    },
    (b) => {
      b.writes[0].update.fields.creation_time = { timestampValue: '2000-01-01T00:00:00Z' }
      delete b.writes[0].updateTransforms
    },
    (b) => {
      b.writes.pop()
    },
    (b) => {
      b.writes.shift()
    },
    (b) => {
      b.writes[1].update.fields.memberId = str('22222222-2222-4222-8222-222222222222')
    },
    (b) => {
      b.writes[2].update.name = base + '/system/dev/memberNumbers/987654321'
    },
    (b) => {
      b.writes[1].update.fields.access = str('club-a')
    },
    (b) => {
      b.writes[0].update.fields.productId = str('other')
    },
  ]) {
    const body = devBody()
    mutate(body)
    await check(
      'Malformed or incomplete dev create',
      base + ':commit',
      { uid: owner, method: 'POST', body },
      false,
    )
  }
  assert.equal(
    (await call(base + '/members/' + devId, { uid: owner })).status,
    404,
    'Owner can check missing member for retry',
  )
  checks++
  for (const replacement of ['system/club-a/memberIdentities', 'devMemberIdentities']) {
    const body = devBody()
    body.writes[1].update.name = base + '/' + replacement + '/' + 'a'.repeat(64)
    await check(
      'Foreign or obsolete reservation create denied',
      base + ':commit',
      { uid: owner, method: 'POST', body },
      false,
    )
  }
  for (const path of [
    'system/club-a/memberIdentities/key',
    'system/club-a/memberNumbers/key',
    'devMemberIdentities/key',
    'devMemberNumbers/key',
    'system/dev/private/key',
  ]) {
    await seed(path, { access: str('dev'), memberId: str(devId) })
    await check(
      'Foreign/obsolete reservation read denied',
      base + '/' + path,
      { uid: owner },
      false,
    )
  }
  for (const phone of [
    str(''),
    str('2105550123'),
    str('+00012345678'),
    { integerValue: '12105550123' },
  ]) {
    const body = devBody()
    body.writes[0].update.fields.phone = phone
    await check(
      'Invalid optional phone denied',
      base + ':commit',
      { uid: owner, method: 'POST', body },
      false,
    )
  }
  const withPhone = devBody()
  withPhone.writes[0].update.fields.phone = str('+12105550123')
  const phoneId = '33333333-3333-4333-8333-333333333333'
  withPhone.writes[0].update.name = base + '/members/' + phoneId
  withPhone.writes[0].update.fields.identityKey = str('c'.repeat(64))
  withPhone.writes[0].update.fields.id_number = { integerValue: '234567891' }
  withPhone.writes[1].update.name = base + '/system/dev/memberIdentities/' + 'c'.repeat(64)
  withPhone.writes[2].update.name = base + '/system/dev/memberNumbers/234567891'
  withPhone.writes[1].update.fields.memberId = str(phoneId)
  withPhone.writes[2].update.fields.memberId = str(phoneId)
  await check(
    'Optional canonical phone accepted',
    base + ':commit',
    { uid: owner, method: 'POST', body: withPhone },
    true,
  )
  await check(
    'Dev owner create',
    base + ':commit',
    { uid: owner, method: 'POST', body: devBody() },
    true,
  )
  await check('Dev owner read', base + '/members/' + devId, { uid: owner }, true)
  const logPath =
    base + '/system/dev/memberLogs/' + devId + '/events/44444444-4444-4444-8444-444444444444'
  const logBody = () => ({
    writes: [
      {
        update: {
          name: logPath,
          fields: {
            type: str('member.viewed'),
            actorUid: str(owner),
            actorName: str('Synthetic Staff'),
            schemaVersion: { integerValue: '1' },
          },
        },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'occurredAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  })
  for (const mutate of [
    (b) => {
      b.writes[0].update.fields.actorUid = str('dev-staff')
    },
    (b) => {
      b.writes[0].update.fields.actorName = str('Impersonator')
    },
    (b) => {
      b.writes[0].update.fields.type = str('member.created')
    },
    (b) => {
      b.writes[0].update.fields.extra = str('bad')
    },
    (b) => {
      b.writes[0].updateTransforms = []
      b.writes[0].update.fields.occurredAt = { timestampValue: '2000-01-01T00:00:00Z' }
    },
    (b) => {
      b.writes[0].update.name = logPath.replace('/dev/', '/club-a/')
    },
    (b) => {
      b.writes[0].update.name = logPath.replace('/' + devId + '/', '/a/')
    },
    (b) => {
      b.writes[0].update.name = logPath.replace('/' + devId + '/', '/missing/')
    },
  ]) {
    const body = logBody()
    mutate(body)
    await check(
      'Malformed/foreign log denied',
      base + ':commit',
      { uid: owner, method: 'POST', body },
      false,
    )
  }
  for (const uid of [null, 'dev-staff', 'staff'])
    await check(
      'Unauthorized log append denied',
      base + ':commit',
      { uid, method: 'POST', body: logBody() },
      false,
    )
  await check(
    'Dev member view appended',
    base + ':commit',
    { uid: owner, method: 'POST', body: logBody() },
    true,
  )
  await check('Dev log read', logPath, { uid: owner }, true)
  for (const uid of [null, 'dev-staff', 'staff'])
    await check('Unauthorized log read denied', logPath, { uid }, false)
  await check('Log update denied', logPath, patch(owner, { actorName: str('Changed') }), false)
  await check('Log delete denied', logPath, { uid: owner, method: 'DELETE' }, false)
  const duplicateLog = await call(base + ':commit', { uid: owner, method: 'POST', body: logBody() })
  assert.ok(
    [403, 409, 412].includes(duplicateLog.status),
    'Duplicate append cannot overwrite an event',
  )
  checks++
  const logQuery = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      orderBy: [{ field: { fieldPath: 'occurredAt' }, direction: 'DESCENDING' }],
      limit: 50,
    },
  }
  const logQueryPath = base + '/system/dev/memberLogs/' + devId + ':runQuery'
  await check(
    'Bounded log query',
    logQueryPath,
    { uid: owner, method: 'POST', body: logQuery },
    true,
  )
  logQuery.structuredQuery.limit = 51
  await check(
    'Unbounded log query denied',
    logQueryPath,
    { uid: owner, method: 'POST', body: logQuery },
    false,
  )

  for (const collection of ['memberIdentities', 'memberNumbers']) {
    const key = collection === 'memberIdentities' ? 'a'.repeat(64) : '123456789'
    await check(
      'Owner claim get',
      base + '/system/dev/' + collection + '/' + key,
      { uid: owner },
      true,
    )
    await check(
      'Staff claim get denied',
      base + '/system/dev/' + collection + '/' + key,
      { uid: 'dev-staff' },
      false,
    )
    await check(
      'Claim enumeration denied',
      base + '/system/dev:runQuery',
      { uid: owner, method: 'POST', body: query(collection) },
      false,
    )
    await check(
      'Claim modification denied',
      base + '/system/dev/' + collection + '/' + key,
      patch(owner, { access: str('dev'), memberId: str(devId) }),
      false,
    )
    await check(
      'Claim deletion denied',
      base + '/system/dev/' + collection + '/' + key,
      { uid: owner, method: 'DELETE' },
      false,
    )
  }
  await check(
    'Dev member update denied',
    base + '/members/' + devId,
    patch(owner, { access: str('dev') }),
    false,
  )
  await check(
    'Dev member delete denied',
    base + '/members/' + devId,
    { uid: owner, method: 'DELETE' },
    false,
  )
  await check(
    'Dev normalized query',
    base + ':runQuery',
    {
      uid: owner,
      method: 'POST',
      body: query('members', [eq('access', str('dev')), eq('searchFirst', str('synthetic'))]),
    },
    true,
  )
  const collision = devBody()
  collision.writes[0].update.name = base + '/members/22222222-2222-4222-8222-222222222222'
  for (const w of collision.writes.slice(1)) {
    w.update.fields = { access: str('dev'), memberId: str('22222222-2222-4222-8222-222222222222') }
    delete w.currentDocument
  }
  await check(
    'Existing claims cannot be reused',
    base + ':commit',
    { uid: owner, method: 'POST', body: collision },
    false,
  )
  await seed('users/' + owner, { ...fields(owner), access: str('club-a') })
  await check(
    'Owner outside dev cannot create',
    base + ':commit',
    { uid: owner, method: 'POST', body: devBody() },
    false,
  )

  // Owner-scoped catalog writes, including stale edit protection.
  const catPath = base + '/system/club-a/categories/retail'
  const productPath = base + '/system/club-a/products/product'
  function catalogBody(path, values, version = 1) {
    const encode = (v) =>
      v === null
        ? { nullValue: null }
        : Array.isArray(v)
          ? { arrayValue: { values: v.map(encode) } }
          : typeof v === 'boolean'
            ? { booleanValue: v }
            : typeof v === 'number'
              ? Number.isInteger(v)
                ? { integerValue: String(v) }
                : { doubleValue: v }
              : str(v)
    return {
      writes: [
        {
          update: {
            name: path,
            fields: Object.fromEntries(
              Object.entries({ ...values, version, updatedBy: owner }).map(([k, v]) => [
                k,
                encode(v),
              ]),
            ),
          },
          currentDocument: { exists: version > 1 },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ],
    }
  }
  const cat = { name: 'Retail', desc: 'Synthetic category', color: '#abcdef' }
  const product = {
    name: 'Guest towel',
    desc: 'Synthetic',
    cat: 'retail',
    barcode: '000123',
    priceCents: 299,
    inventory: 0,
    inventoryPar: 10,
    invWarning: 0,
    favorite: true,
    taxable: true,
    active: true,
    core: false,
    rental: false,
    membership: false,
    restricted: false,
    payout: false,
    askforprice: false,
    rentalLengthRaw: 1,
    rentalLengthType: 'hour',
    membershipLengthRaw: 1,
    membershipLengthType: 'year',
    restrictedUsers: [],
  }
  for (const uid of [null, 'staff', 'dev-staff'])
    await check(
      'Employee cannot administer catalog',
      base + ':commit',
      { uid, method: 'POST', body: catalogBody(catPath, cat) },
      false,
    )
  await check(
    'Owner creates category',
    base + ':commit',
    { uid: owner, method: 'POST', body: catalogBody(catPath, cat) },
    true,
  )
  for (const change of [
    { priceCents: -1 },
    { priceCents: 1.5 },
    { inventory: -1 },
    { inventory: '0' },
    { active: 'true' },
    { name: ' ' },
    { askforprice: true },
    { restricted: true },
    { rentalLengthRaw: 0 },
    { cat: 'missing' },
    { cat: '../retail' },
    { extra: true },
    { restricted: true, restrictedUsers: ['staff', 'staff'] },
    { restricted: true, restrictedUsers: ['bad/uid'] },
  ]) {
    await check(
      'Invalid catalog product denied: ' + Object.keys(change).join(','),
      base + ':commit',
      { uid: owner, method: 'POST', body: catalogBody(productPath, { ...product, ...change }) },
      false,
    )
  }
  await check(
    'Unlimited inventory and staff restriction accepted',
    base + ':commit',
    {
      uid: owner,
      method: 'POST',
      body: catalogBody(productPath + '-unlimited', {
        ...product,
        inventory: null,
        inventoryPar: null,
        invWarning: null,
        restricted: true,
        restrictedUsers: ['staff'],
        rental: true,
        rentalLengthRaw: 0.5,
      }),
    },
    true,
  )
  await check(
    'Owner creates product',
    base + ':commit',
    { uid: owner, method: 'POST', body: catalogBody(productPath, product) },
    true,
  )
  await check(
    'Owner edits product',
    base + ':commit',
    {
      uid: owner,
      method: 'POST',
      body: catalogBody(productPath, { ...product, priceCents: 399 }, 2),
    },
    true,
  )
  await check(
    'Stale product edit denied',
    base + ':commit',
    {
      uid: owner,
      method: 'POST',
      body: catalogBody(productPath, { ...product, priceCents: 499 }, 2),
    },
    false,
  )
  await check(
    'Owner edits category',
    base + ':commit',
    {
      uid: owner,
      method: 'POST',
      body: catalogBody(catPath, { ...cat, name: 'Retail updated' }, 2),
    },
    true,
  )
  const forged = catalogBody(productPath, product, 3)
  forged.writes[0].update.fields.updatedBy = str('staff')
  await check(
    'Catalog actor forgery denied',
    base + ':commit',
    { uid: owner, method: 'POST', body: forged },
    false,
  )
  const clock = catalogBody(productPath, product, 3)
  clock.writes[0].updateTransforms = []
  clock.writes[0].update.fields.updatedAt = { timestampValue: '2000-01-01T00:00:00Z' }
  await check(
    'Client catalog timestamp denied',
    base + ':commit',
    { uid: owner, method: 'POST', body: clock },
    false,
  )
  await check(
    'Foreign business catalog create denied',
    base + ':commit',
    { uid: owner, method: 'POST', body: catalogBody(catPath.replace('/club-a/', '/dev/'), cat) },
    false,
  )
  await check('Catalog owner read', productPath, { uid: owner }, true)
  await check('Catalog employee read denied', productPath, { uid: 'staff' }, false)
  await check('Product deletion denied', productPath, { uid: owner, method: 'DELETE' }, false)
  await check('Category deletion denied', catPath, { uid: owner, method: 'DELETE' }, false)
  const catalogQuery = {
    structuredQuery: {
      from: [{ collectionId: 'products' }],
      orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
      limit: 100,
    },
  }
  await check(
    'Bounded business catalog query',
    base + '/system/club-a:runQuery',
    { uid: owner, method: 'POST', body: catalogQuery },
    true,
  )
  catalogQuery.structuredQuery.limit = 101
  await check(
    'Unbounded catalog denied',
    base + '/system/club-a:runQuery',
    { uid: owner, method: 'POST', body: catalogQuery },
    false,
  )
  await seed('users/' + owner, { ...fields(owner), access: str('dev') })
  await check('Catalog previous business revoked', productPath, { uid: owner }, false)
  console.log(
    `Firestore rules passed ${checks} allow/deny checks using exact rules on named cerms in isolated ${project}.`,
  )
} finally {
  emulator.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (emulator.exitCode === null) {
    emulator.kill('SIGKILL')
    await exited
  }
  await rm(dir, { recursive: true, force: true })
}
