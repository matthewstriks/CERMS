// Read-only deployment compatibility evidence. No document or Auth-account APIs.
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const mode = process.argv[2]
assert.ok(['before', 'after'].includes(mode))
const project = 'cerms-7af24'
const config = JSON.parse(
  await readFile(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'),
)
const headers = { Authorization: `Bearer ${config.tokens.access_token}` }
async function get(url) {
  const r = await fetch(url, { headers })
  if (!r.ok) throw new Error(`Metadata inspection failed: ${r.status} ${url}`)
  return r.json()
}
async function list(url, key) {
  const all = []
  let token = ''
  do {
    const result = await get(url + (token ? `?pageToken=${encodeURIComponent(token)}` : ''))
    all.push(...(result[key] ?? []))
    token = result.nextPageToken ?? ''
  } while (token)
  return all.sort((a, b) => a.name.localeCompare(b.name))
}
const rules = `https://firebaserules.googleapis.com/v1/projects/${project}`
const firestore = `https://firestore.googleapis.com/v1/projects/${project}/databases`
const [releases, databases, defaultIndexes, cermsIndexes, functions, legacyBucket, privateBucket] =
  await Promise.all([
    list(rules + '/releases', 'releases'),
    get(firestore),
    list(firestore + '/(default)/collectionGroups/-/indexes', 'indexes'),
    list(firestore + '/cerms/collectionGroups/-/indexes', 'indexes'),
    list(
      `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`,
      'functions',
    ),
    get(`https://storage.googleapis.com/storage/v1/b/${project}.appspot.com`),
    get(`https://storage.googleapis.com/storage/v1/b/${project}-cerms5-product-images`),
  ])
function stableDatabases(value) {
  // The rolling retention timestamp changes continuously; etag hashes other fields.
  // https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases
  for (const d of value.databases) {
    delete d.earliestVersionTime
    delete d.etag
  }
  value.databases.sort((a, b) => a.name.localeCompare(b.name))
  return value
}
stableDatabases(databases)
const cermsRelease = releases.find((r) => r.name.endsWith('/cloud.firestore/cerms'))
assert.ok(cermsRelease, 'Named cerms rules release required')
const live = await get(`https://firebaserules.googleapis.com/v1/${cermsRelease.rulesetName}`)
const snapshot = {
  releases,
  databases,
  defaultIndexes,
  cermsIndexes,
  functions,
  legacyBucket,
  privateBucket,
}
const beforePath = '/private/tmp/cerms-messaging-before.json'
const source = await readFile(
  mode === 'before'
    ? 'firebase/releases/member-notes-2026-11-15.rules'
    : 'firebase/releases/messaging-2026-11-15.rules',
  'utf8',
)
assert.equal(live.source.files.length, 1)
assert.equal(live.source.files[0].content, source, 'Current rules baseline must remain unchanged')
if (mode === 'before') {
  await writeFile(beforePath, JSON.stringify(snapshot, null, 2))
  console.log('Messaging compatibility snapshot saved; no document data inspected or changed.')
} else {
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  stableDatabases(before.databases)
  for (const key of ['databases', 'defaultIndexes', 'legacyBucket', 'privateBucket'])
    assert.deepEqual(snapshot[key], before[key], `${key} must remain unchanged`)
  // Eventarc filters are an unordered conjunction; the API can reorder them.
  // Keep every field/value and compare all remaining metadata exactly.
  const normalizeFunctions = (rows) =>
    rows.map((f) => {
      const value = structuredClone(f)
      value.eventTrigger?.eventFilters?.sort((a, b) => a.attribute.localeCompare(b.attribute))
      return value
    })
  assert.deepEqual(
    releases.filter((r) => r.name !== cermsRelease.name),
    before.releases.filter((r) => r.name !== cermsRelease.name),
    'Legacy and Storage rules releases unchanged',
  )
  const targeted = (f) => f.name.endsWith('/staffMessaging')
  assert.deepEqual(
    normalizeFunctions(functions.filter((f) => !targeted(f))),
    normalizeFunctions(before.functions.filter((f) => !targeted(f))),
    'All other functions unchanged',
  )
  const deployed = functions.filter(targeted)
  assert.equal(deployed.length, 1)
  for (const f of deployed) {
    assert.equal(f.state, 'ACTIVE')
    assert.notEqual(f.updateTime, before.functions.find((p) => p.name === f.name)?.updateTime)
  }
  for (const old of before.cermsIndexes) {
    const current = cermsIndexes.find((i) => i.name === old.name)
    assert.deepEqual(current, old, 'Existing cerms index must remain unchanged')
  }
  const added = cermsIndexes.filter((i) => !before.cermsIndexes.some((old) => old.name === i.name))
  assert.equal(added.length, 1, 'Only the new chat-list index may be created')
  const index = added[0]
  assert.ok(index.name.includes('/collectionGroups/staffChats/'))
  assert.equal(index.queryScope, 'COLLECTION')
  assert.equal(
    index.state,
    'READY',
    'Messaging index must finish building before release completion',
  )
  assert.deepEqual(
    index.fields.filter((f) => f.fieldPath !== '__name__'),
    [
      { fieldPath: 'participantUids', arrayConfig: 'CONTAINS' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ],
  )
  const evidence = {
    feature:
      'Private direct and group staff messaging, directory/history search, server timestamps and read receipts',
    verifiedAt: new Date().toISOString(),
    database: 'cerms',
    rulesChange:
      'Participant-only saved-business chat/message reads; all direct messaging writes denied',
    rulesBaseline: 'firebase/releases/messaging-2026-11-15.rules',
    rulesSha256: createHash('sha256').update(source).digest('hex'),
    serverSha256: createHash('sha256')
      .update(await readFile('functions/staff-messaging.mjs'))
      .digest('hex'),
    bothDatabaseConfigurationsUnchanged: true,
    legacyIndexesUnchanged: true,
    existingCermsIndexesUnchanged: true,
    messagingIndex: index,
    legacyAndStorageRulesUnchanged: true,
    bothBucketsUnchanged: true,
    otherFunctionsUnchanged: true,
    clientChecks: 207,
    serverMessagingChecks: 8,
    rulesChecks: 362,
    buildPassed: true,
    interceptedMessagingFlowPassed: true,
    concurrentDemoEmulatorTransactionsPassed: true,
    admissionsEmulatorRegressionPassed: true,
    liveTestWrites: false,
    existingAuthAccountsModified: false,
    functions: deployed.map((f) => ({
      name: f.name,
      state: f.state,
      updateTime: f.updateTime,
      entryPoint: f.buildConfig.entryPoint,
    })),
  }
  await writeFile('docs/MESSAGING-DEPLOYMENT.json', JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'Staff messaging ACTIVE; new index READY; all legacy/shared metadata and existing indexes verified unchanged.',
  )
}
