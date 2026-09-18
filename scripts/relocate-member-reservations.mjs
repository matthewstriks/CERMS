// Explicit maintenance tool. Default is read-only inspection; never imported by the desktop.
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const apply = process.argv.includes('--apply')
const base = 'projects/cerms-7af24/databases/cerms/documents'
const origin = 'https://firestore.googleapis.com/v1/'
const config = JSON.parse(
  await readFile(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'),
)
const headers = {
  Authorization: `Bearer ${config.tokens.access_token}`,
  'Content-Type': 'application/json',
}
async function get(url, missing = false) {
  const response = await fetch(url, { headers })
  if (missing && response.status === 404) return null
  if (!response.ok) throw new Error(`Read-only inspection failed: HTTP ${response.status}`)
  return response.json()
}
async function list(collection) {
  const documents = []
  let pageToken = ''
  do {
    const result = await get(
      origin +
        base +
        '/' +
        collection +
        '?pageSize=100' +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''),
    )
    documents.push(...(result.documents || []))
    pageToken = result.nextPageToken || ''
  } while (pageToken)
  return documents
}
const expectedPausedRules = (await readFile('firebase/cerms.rules', 'utf8')).replace(
  'function devCreator() {\n      return switcher()',
  'function devCreator() {\n      return false && switcher()',
)
async function requirePaused() {
  const release = await get(
    'https://firebaserules.googleapis.com/v1/projects/cerms-7af24/releases/cloud.firestore/cerms',
  )
  const rules = await get('https://firebaserules.googleapis.com/v1/' + release.rulesetName)
  assert.equal(rules.source.files.length, 1)
  assert.equal(
    rules.source.files[0].content,
    expectedPausedRules,
    'Deploy the reviewed temporary creation-pause rules before moving reservations',
  )
  assert.ok(
    expectedPausedRules.includes('return false && switcher()'),
    'Pause rule marker is missing',
  )
}
const plan = []
const counts = {}
for (const [source, target, memberField] of [
  ['devMemberIdentities', 'system/dev/memberIdentities', 'identityKey'],
  ['devMemberNumbers', 'system/dev/memberNumbers', 'id_number'],
]) {
  const documents = await list(source)
  counts[source] = documents.length
  for (const document of documents) {
    const key = document.name.split('/').at(-1)
    assert.equal(document.name, base + '/' + source + '/' + key)
    assert.deepEqual(Object.keys(document.fields).sort(), ['access', 'memberId'])
    assert.equal(document.fields.access.stringValue, 'dev', 'Only Dev reservations may move')
    const memberId = document.fields.memberId.stringValue
    assert.match(memberId, /^[a-f0-9-]{36}$/)
    const member = await get(
      origin +
        base +
        '/members/' +
        memberId +
        '?mask.fieldPaths=access&mask.fieldPaths=identityKey&mask.fieldPaths=id_number',
    )
    assert.equal(member.fields.access.stringValue, 'dev')
    assert.equal(
      String(member.fields[memberField].stringValue ?? member.fields[memberField].integerValue),
      key,
      'Reservation must match its member',
    )
    const destination = base + '/' + target + '/' + key
    const existing = await get(origin + destination, true)
    if (existing)
      assert.deepEqual(
        existing.fields,
        document.fields,
        'Destination collision; refusing overwrite',
      )
    plan.push({ document, destination, existing: !!existing })
  }
}
if (!apply) {
  console.log(
    JSON.stringify({
      mode: 'read-only',
      database: 'cerms',
      sourceCounts: counts,
      destinationsToCreate: plan.filter((p) => !p.existing).length,
      oldDocumentsToRemove: plan.length,
      conflicts: 0,
    }),
  )
} else {
  await requirePaused()
  const directory = await mkdtemp(join(tmpdir(), 'cerms-reservation-backup-'))
  await writeFile(join(directory, 'reservations.json'), JSON.stringify(plan, null, 2), {
    mode: 0o600,
  })
  for (let offset = 0; offset < plan.length; offset += 200) {
    await requirePaused()
    const writes = plan
      .slice(offset, offset + 200)
      .flatMap(({ document, destination, existing }) => [
        ...(!existing
          ? [
              {
                update: { name: destination, fields: document.fields },
                currentDocument: { exists: false },
              },
            ]
          : []),
        { delete: document.name, currentDocument: { updateTime: document.updateTime } },
      ])
    const response = await fetch(origin + base + ':commit', {
      method: 'POST',
      headers,
      body: JSON.stringify({ writes }),
    })
    if (!response.ok)
      throw new Error(
        `Relocation commit failed: HTTP ${response.status}; keep creation paused and inspect before retrying`,
      )
  }
  for (const { document, destination } of plan) {
    const saved = await get(origin + destination)
    assert.deepEqual(saved.fields, document.fields)
    assert.equal(await get(origin + document.name, true), null)
  }
  for (const source of Object.keys(counts)) assert.equal((await list(source)).length, 0)
  console.log(
    JSON.stringify({
      database: 'cerms',
      moved: plan.length,
      sourceCounts: counts,
      verified: true,
      backup: directory,
      memberDocumentsChanged: 0,
    }),
  )
}
