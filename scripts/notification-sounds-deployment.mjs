// Read-only compatibility inspection; never reads/writes business documents or Auth accounts.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const mode = process.argv[2]
assert.ok(['before', 'after'].includes(mode))
const target =
  'projects/cerms-7af24/locations/us-central1/functions/saveNotificationSoundPreference'
const path = '/private/tmp/cerms-notification-sounds-before.json'
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v
const hash = (v) =>
  createHash('sha256')
    .update(JSON.stringify(stable(v)))
    .digest('hex')
const sourceHash = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
const headers = { Authorization: `Bearer ${await releaseToken()}` }
async function get(url) {
  const r = await fetch(url, { headers })
  assert.ok(r.ok, `Metadata inspection failed (${r.status})`)
  return r.json()
}
const current = await snapshot()
const named = current.releases.find((r) => r.name.endsWith('/cloud.firestore/cerms'))
assert.ok(named, 'Named cerms release is required')
const live = await get('https://firebaserules.googleapis.com/v1/' + named.rulesetName)
assert.equal(live.source.files.length, 1)
const baseline = await readFile('firebase/releases/messaging-2026-11-15.rules', 'utf8')
const prepared = await readFile('firebase/releases/notification-sounds-2026-11-16.rules', 'utf8')
const optionalValidation = `
        && (!('notificationSoundPreference' in data) || (
          data.notificationSoundPreference is map
          && data.notificationSoundPreference.keys().hasOnly(['enabled','volume'])
          && data.notificationSoundPreference.keys().hasAll(['enabled','volume'])
          && data.notificationSoundPreference.enabled is bool
          && data.notificationSoundPreference.volume is int
          && data.notificationSoundPreference.volume >= 0 && data.notificationSoundPreference.volume <= 100))`
const expected = baseline
  .replace(
    "'version', 'themePreference'])",
    "'version', 'themePreference', 'notificationSoundPreference'])",
  )
  .replace(
    "        && (!('themePreference' in data) || data.themePreference in ['light', 'dark'])",
    "        && (!('themePreference' in data) || data.themePreference in ['light', 'dark'])" +
      optionalValidation,
  )
assert.equal(
  prepared,
  expected,
  'Only the optional sound preference validation may differ from the current baseline',
)
assert.equal(
  await readFile('firebase/cerms.rules', 'utf8'),
  prepared,
  'Tested local rules must match the release',
)
assert.equal(
  live.source.files[0].content,
  mode === 'before' ? baseline : prepared,
  'Named live rules must match the expected exact release',
)
const [jobs, releaseBucket, releaseIam] = await Promise.all([
  get('https://cloudscheduler.googleapis.com/v1/projects/cerms-7af24/locations/us-central1/jobs'),
  get('https://storage.googleapis.com/storage/v1/b/cerms-7af24-cerms5-releases'),
  get('https://storage.googleapis.com/storage/v1/b/cerms-7af24-cerms5-releases/iam'),
])
assert.ok(!jobs.nextPageToken)
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
      .filter(([k]) => !['functions', 'releases'].includes(k))
      .map(([k, v]) => [k, hash(v)]),
  ),
  otherReleases: hash(current.releases.filter((r) => r.name !== named.name)),
  functions: current.functions
    .filter((f) => f.name !== target)
    .map((f) => ({ name: f.name, hash: hash(f) })),
  schedules: hash(schedules),
  releaseBucket: hash(releaseBucket),
  releaseIam: hash(releaseIam),
  rulesSha256: await sourceHash('firebase/releases/notification-sounds-2026-11-16.rules'),
  serviceSha256: await sourceHash('functions/notification-sounds.mjs'),
  indexSha256: await sourceHash('functions/index.mjs'),
}
if (mode === 'before') {
  assert.ok(
    !current.functions.some((f) => f.name === target),
    'This release creates only the new preference service',
  )
  await writeFile(path, JSON.stringify(state), { mode: 0o600 })
  console.log('Sound preference compatibility baseline saved; no business documents changed.')
} else {
  assert.deepEqual(
    state,
    JSON.parse(await readFile(path, 'utf8')),
    'All existing functions, legacy rules/indexes/database settings, schedules and bucket settings/IAM must remain unchanged',
  )
  const deployed = current.functions.find((f) => f.name === target)
  assert.equal(deployed?.state, 'ACTIVE')
  await writeFile(
    'docs/NOTIFICATION-SOUNDS-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        database: 'cerms',
        function: { name: target, state: deployed.state, updateTime: deployed.updateTime },
        rulesBaseline: 'firebase/releases/notification-sounds-2026-11-16.rules',
        rulesSha256: state.rulesSha256,
        serviceSha256: state.serviceSha256,
        indexSha256: state.indexSha256,
        onlyOptionalSoundPreferenceRulesChanged: true,
        allOtherRulesReleasesUnchanged: true,
        allExistingFunctionsAndSchedulesUnchanged: true,
        bothDatabaseConfigurationsAndIndexesUnchanged: true,
        allExistingBucketSettingsAndIamUnchanged: true,
        liveTestWrites: false,
        existingAuthAccountsChanged: false,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'Sound preference service ACTIVE; exact named-cerms rules verified; legacy/default, existing functions, indexes, schedules and buckets unchanged.',
  )
}
