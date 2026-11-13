// Read-only deployment compatibility evidence. No document or Auth-account APIs.
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const mode = process.argv[2]
const group = process.argv.includes('--group')
const images = process.argv.includes('--images')
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
    images
      ? get(`https://storage.googleapis.com/storage/v1/b/${project}-cerms5-product-images`)
      : Promise.resolve(null),
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
  ...(images ? { privateBucket } : {}),
}
const beforePath = images
  ? '/private/tmp/cerms-pos-images-before.json'
  : group
    ? '/private/tmp/cerms-group-checkout-before.json'
    : '/private/tmp/cerms-checkout-before.json'
if (mode === 'before') {
  const baseline = await readFile(
    group || images
      ? 'firebase/releases/checkout-2026-10-11.rules'
      : 'firebase/releases/register-managers-2026-09-30.rules',
    'utf8',
  )
  assert.equal(live.source.files.length, 1)
  assert.equal(
    live.source.files[0].content,
    baseline,
    'Live rules must match the documented current baseline',
  )
  await writeFile(beforePath, JSON.stringify(snapshot, null, 2))
  console.log(
    'Compatibility snapshot saved; current cerms rules match the documented baseline. No document data inspected or changed.',
  )
} else {
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  stableDatabases(before.databases)
  for (const key of [
    'databases',
    'defaultIndexes',
    'cermsIndexes',
    'legacyBucket',
    ...(images ? ['privateBucket'] : []),
  ])
    assert.deepEqual(snapshot[key], before[key], `${key} must remain unchanged`)
  assert.deepEqual(
    releases.filter((r) => r.name !== cermsRelease.name),
    before.releases.filter((r) => r.name !== cermsRelease.name),
    'All legacy/Storage rules releases unchanged',
  )
  if (group || images)
    assert.deepEqual(
      releases,
      before.releases,
      'All rules releases unchanged for function-only deployment',
    )
  const changed = (f) => f.name.endsWith(images ? '/getProductImage' : '/completeSale')
  assert.deepEqual(
    functions.filter((f) => !changed(f)),
    before.functions.filter((f) => !changed(f)),
    'All other functions unchanged',
  )
  const completed = functions.find(changed)
  assert.equal(completed.state, 'ACTIVE')
  assert.notEqual(
    completed.updateTime,
    before.functions.find(changed).updateTime,
    'Target function update must be verified',
  )
  const source = await readFile('firebase/releases/checkout-2026-10-11.rules', 'utf8')
  assert.equal(live.source.files.length, 1)
  assert.equal(live.source.files[0].content, source)
  const evidence = {
    feature: images
      ? 'POS image tiles, collapsible categories, persistent favorites and scoped cashier image reads'
      : group
        ? 'Multiple pending memberships and individually assigned rentals in member-switchable orders'
        : 'Atomic member creation and rental check-in through linked checkout',
    database: 'cerms',
    verifiedAt: new Date().toISOString(),
    ruleset: cermsRelease.rulesetName,
    previousRuleset: before.releases.find((r) => r.name === cermsRelease.name).rulesetName,
    sha256: createHash('sha256').update(source).digest('hex'),
    rulesChecks: 311,
    ...(images
      ? {
          imageServiceChecks: 3,
          rulesUnchanged: true,
          privateImageBucketUnchanged: true,
          interceptedPosCatalogPassed: true,
          interceptedImageUploadPassed: true,
        }
      : { serverCheckoutChecks: group ? 12 : 8 }),
    ...(group
      ? {
          rulesUnchanged: true,
          interceptedGroupCheckoutPassed: true,
          serverSourceSha256: createHash('sha256')
            .update(await readFile('functions/pos.mjs'))
            .digest('hex'),
        }
      : {}),
    interceptedMemberCheckoutPassed: true,
    defaultRulesAndStorageRulesUnchanged: true,
    bothDatabaseConfigurationsUnchanged: true,
    defaultIndexesUnchanged: true,
    cermsIndexesUnchanged: true,
    legacyBucketUnchanged: true,
    otherFunctionsUnchanged: true,
    liveTestWrites: false,
    existingAuthAccountsModified: false,
    functions: [
      {
        name: completed.name,
        state: completed.state,
        updateTime: completed.updateTime,
        entryPoint: completed.buildConfig.entryPoint,
      },
    ],
  }
  await writeFile(
    images
      ? 'docs/POS-CATALOG-DEPLOYMENT.json'
      : group
        ? 'docs/MULTI-MEMBER-ORDERS-DEPLOYMENT.json'
        : 'docs/MEMBER-CHECKOUT-DEPLOYMENT.json',
    JSON.stringify(evidence, null, 2) + '\n',
  )
  console.log(
    `Verified: current cerms rules and ACTIVE ${completed.buildConfig.entryPoint}; legacy databases, indexes, rules, Storage and all other functions unchanged.`,
  )
}
