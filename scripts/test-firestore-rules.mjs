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
