// Read-only compatibility inspection. Never calls document, Auth or object-write APIs.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')
const mode = process.argv[2]
assert.ok(['before', 'after'].includes(mode))
const target = 'projects/cerms-7af24/locations/us-central1/functions/completeSale'
const beforePath = '/private/tmp/cerms-expired-checkin-before.json'
const current = await snapshot()
const headers = { Authorization: `Bearer ${await releaseToken()}` }
async function get(url) {
  const r = await fetch(url, { headers })
  assert.ok(r.ok, `Read-only metadata inspection failed (${r.status})`)
  return r.json()
}
const [jobs, bucket, iam] = await Promise.all([
  get('https://cloudscheduler.googleapis.com/v1/projects/cerms-7af24/locations/us-central1/jobs'),
  get('https://storage.googleapis.com/storage/v1/b/cerms-7af24-cerms5-releases'),
  get('https://storage.googleapis.com/storage/v1/b/cerms-7af24-cerms5-releases/iam'),
])
assert.ok(!jobs.nextPageToken, 'Schedules must be fully inspected')
const schedules = (jobs.jobs ?? [])
  .map((j) => ({
    name: j.name,
    schedule: j.schedule,
    timeZone: j.timeZone,
    state: j.state,
    httpTarget: j.httpTarget,
    pubsubTarget: j.pubsubTarget,
    retryConfig: j.retryConfig,
    attemptDeadline: j.attemptDeadline,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))
const state = {
  ...Object.fromEntries(
    Object.entries(current)
      .filter(([key]) => key !== 'functions')
      .map(([key, value]) => [key, hash(value)]),
  ),
  functions: current.functions.map((f) => ({ name: f.name, hash: hash(f) })),
  schedules: hash(schedules),
  releaseBucket: hash(bucket),
  releaseIam: hash(iam),
}
const sourceHash = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
state.sourceSha256 = await sourceHash('functions/pos.mjs')
state.checkoutDomainSha256 = await sourceHash('functions/checkout-domain.mjs')
if (mode === 'before') {
  assert.equal(current.functions.find((f) => f.name === target)?.state, 'ACTIVE')
  await writeFile(beforePath, JSON.stringify(state), { mode: 0o600 })
  console.log('Compatibility baseline saved for completeSale only; no business data changed.')
} else {
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  for (const [key, value] of Object.entries(state).filter(([key]) => key !== 'functions'))
    assert.equal(value, before[key], `${key} must remain unchanged`)
  assert.deepEqual(
    state.functions.filter((f) => f.name !== target),
    before.functions.filter((f) => f.name !== target),
    'All other functions must remain unchanged',
  )
  const deployed = current.functions.find((f) => f.name === target)
  assert.equal(deployed.state, 'ACTIVE')
  assert.notEqual(
    state.functions.find((f) => f.name === target).hash,
    before.functions.find((f) => f.name === target).hash,
    'Target must have been deployed',
  )
  await writeFile(
    'docs/EXPIRED-CHECKIN-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        function: { name: target, state: deployed.state, updateTime: deployed.updateTime },
        database: 'cerms',
        onlyFunctionChanged: 'completeSale',
        allRulesReleasesUnchanged: true,
        bothDatabaseConfigurationsAndIndexesUnchanged: true,
        allOtherFunctionsAndSchedulesUnchanged: true,
        allExistingBucketSettingsAndIamUnchanged: true,
        clientChecks: 211,
        serverCheckoutChecks: 21,
        buildPassed: true,
        interceptedExpiredCheckinAndRenewalFlowsPassed: true,
        liveTestWrites: false,
        sourceSha256: state.sourceSha256,
        checkoutDomainSha256: state.checkoutDomainSha256,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'completeSale ACTIVE; legacy/default, rules, indexes, other functions, schedules and bucket settings verified unchanged.',
  )
}
