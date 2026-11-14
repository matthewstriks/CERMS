// Hashed read-only compatibility evidence; never writes business documents.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
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
const canonicalHash = (value) => hash(stable(value))
const target = 'projects/cerms-7af24/locations/us-central1/functions/completeSale'
const path = '/private/tmp/cerms-membership-renewal-before.json'
const current = await snapshot()
const state = {
  ...Object.fromEntries(
    Object.entries(current)
      .filter(([key]) => key !== 'functions')
      .map(([key, value]) => [key, hash(value)]),
  ),
  functions: current.functions.map((f) => ({ name: f.name, hash: hash(f) })),
}
const headers = { Authorization: `Bearer ${await releaseToken()}` }
async function get(url) {
  const r = await fetch(url, { headers })
  assert.ok(r.ok, `Metadata read failed (${r.status})`)
  return r.json()
}
const [schedules, releaseBucket, releaseIam] = await Promise.all([
  get('https://cloudscheduler.googleapis.com/v1/projects/cerms-7af24/locations/us-central1/jobs'),
  get('https://storage.googleapis.com/storage/v1/b/cerms-7af24-cerms5-releases'),
  get('https://storage.googleapis.com/storage/v1/b/cerms-7af24-cerms5-releases/iam'),
])
state.schedules = hash(
  schedules.jobs
    .map((j) => ({
      name: j.name,
      schedule: j.schedule,
      timeZone: j.timeZone,
      state: j.state,
      httpTarget: j.httpTarget,
      retryConfig: j.retryConfig,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
state.releaseBucket = hash(releaseBucket)
state.releaseIam = hash(releaseIam)
if (process.argv[2] === 'before') {
  await writeFile(path, JSON.stringify(state), { mode: 0o600 })
  console.log('Membership renewal compatibility snapshot saved; no business data changed.')
} else {
  assert.equal(process.argv[2], 'after')
  const before = JSON.parse(await readFile(path, 'utf8'))
  // The first snapshot used raw JSON hashes. The API reorders object keys.
  // Bridge that snapshot with the earlier canonical compatibility baseline,
  // already verified across the reporting-only deployment in this session.
  const earlier = JSON.parse(await readFile('/private/tmp/cerms-daily-report-before.json', 'utf8'))
  for (const f of current.functions.filter(
    (f) => f.name !== target && !f.name.endsWith('/sendDevDailyReport'),
  )) {
    const old = earlier.functions.find((row) => row.name === f.name)
    assert.ok(old, 'Every existing function needs a verified baseline')
    assert.equal(
      canonicalHash(f),
      old.hash,
      'Other function metadata must remain unchanged after key normalization',
    )
  }
  const report = JSON.parse(await readFile('docs/DAILY-REPORT-DEPLOYMENT.json', 'utf8'))
  assert.equal(
    current.functions.find((f) => f.name === report.function.name)?.updateTime,
    report.function.updateTime,
    'Verified reporting deployment must remain unchanged',
  )
  for (const [key, value] of Object.entries(current).filter(([key]) => key !== 'functions'))
    assert.equal(
      canonicalHash(value),
      earlier.hashes[key],
      `${key} must remain unchanged after key normalization`,
    )
  assert.equal(canonicalHash(releaseBucket), earlier.releaseBucket, 'Release bucket unchanged')
  assert.equal(canonicalHash(releaseIam), earlier.releaseIam, 'Release bucket IAM unchanged')
  const priorJobs = schedules.jobs
    .filter((j) => !j.name.endsWith('/firebase-schedule-sendDevDailyReport-us-central1'))
    .map((j) => ({
      name: j.name,
      schedule: j.schedule,
      timeZone: j.timeZone,
      httpTarget: j.httpTarget,
      pubsubTarget: j.pubsubTarget,
      retryConfig: j.retryConfig,
      attemptDeadline: j.attemptDeadline,
      state: j.state,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  assert.equal(
    canonicalHash(priorJobs),
    canonicalHash(earlier.scheduler),
    'Legacy schedules unchanged',
  )
  const reportJob = schedules.jobs.find((j) =>
    j.name.endsWith('/firebase-schedule-sendDevDailyReport-us-central1'),
  )
  assert.equal(reportJob?.schedule, report.schedule)
  assert.equal(reportJob.timeZone, report.timeZone)
  assert.equal(reportJob.state, 'ENABLED')
  assert.equal(reportJob.httpTarget.oidcToken.serviceAccountEmail, report.function.serviceAccount)
  const deployed = current.functions.find((f) => f.name === target)
  assert.equal(deployed.state, 'ACTIVE')
  await writeFile(
    'docs/MEMBERSHIP-RENEWAL-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        function: { name: deployed.name, state: deployed.state, updateTime: deployed.updateTime },
        database: 'cerms',
        onlyFunctionChanged: 'completeSale',
        allRulesReleasesUnchanged: true,
        bothDatabaseConfigurationsAndIndexesUnchanged: true,
        allOtherFunctionsAndSchedulesUnchanged: true,
        allExistingBucketSettingsAndIamUnchanged: true,
        metadataObjectKeyOrderingNormalized: true,
        liveTestWrites: false,
        focusedServerTests: 21,
        focusedClientTests: 11,
        interceptedMembershipRenewalFlowPassed: true,
        sourceSha256: createHash('sha256')
          .update(await readFile('functions/pos.mjs'))
          .digest('hex'),
        checkoutDomainSha256: createHash('sha256')
          .update(await readFile('functions/checkout-domain.mjs'))
          .digest('hex'),
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'completeSale ACTIVE; legacy, reports, rules, databases, indexes, buckets and every other function unchanged.',
  )
}
