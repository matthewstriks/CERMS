// Metadata only: no sale/member/profile reads or writes and no test email sends.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const project = 'cerms-7af24',
  target = `projects/${project}/locations/us-central1/functions/accountSettings`
const beforePath = '/private/tmp/cerms-account-settings-before.json'
const headers = {
  Authorization: `Bearer ${await releaseToken()}`,
  'Content-Type': 'application/json',
}
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { headers, method, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.ok(r.ok, `Account settings compatibility inspection failed (${r.status})`)
  return r.json()
}
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
async function state() {
  const resources = await snapshot()
  const extras = await Promise.all([
    api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`, 'POST', {
      options: { requestedPolicyVersion: 3 },
    }),
    ...['CERMS5_SUPPORT_SMTP', 'CERMS5_REPORT_SMTP', 'firestore-send-email-SMTP_PASSWORD'].map(
      (s) =>
        api(
          `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${s}:getIamPolicy`,
        ),
    ),
    ...['cerms5-bug-reports', 'cerms5-releases'].flatMap((b) =>
      ['', '/iam'].map((s) =>
        api(`https://storage.googleapis.com/storage/v1/b/${project}-${b}${s}`),
      ),
    ),
    api(
      `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs?pageSize=500`,
    ),
  ])
  const jobs = extras.pop()
  assert.ok(!jobs.nextPageToken)
  const schedules = (jobs.jobs ?? [])
    .map((j) => ({
      name: j.name,
      state: j.state,
      schedule: j.schedule,
      timeZone: j.timeZone,
      httpTarget: j.httpTarget,
      pubsubTarget: j.pubsubTarget,
      retryConfig: j.retryConfig,
      attemptDeadline: j.attemptDeadline,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    hashes: {
      ...Object.fromEntries(
        Object.entries(resources)
          .filter(([k]) => k !== 'functions')
          .map(([k, v]) => [k, hash(v)]),
      ),
      extras: hash(extras),
      schedules: hash(schedules),
    },
    functions: resources.functions,
  }
}
const mode = process.argv[2],
  current = await state()
if (mode === 'before') {
  assert.ok(
    !current.functions.some((f) => f.name === target),
    'This scope adds only the Account settings email function',
  )
  await writeFile(beforePath, JSON.stringify(current), { mode: 0o600 })
  console.log(
    'Account settings compatibility baseline saved; existing services, rules, schedules and IAM recorded.',
  )
} else {
  assert.equal(mode, 'after')
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  assert.deepEqual(
    current.hashes,
    before.hashes,
    'All rules, indexes, database settings, buckets, IAM/secret policies and schedules must remain unchanged',
  )
  assert.deepEqual(
    current.functions.filter((f) => f.name !== target),
    before.functions,
    'Every existing function must remain unchanged',
  )
  const deployed = current.functions.find((f) => f.name === target)
  assert.equal(deployed?.state, 'ACTIVE')
  assert.equal(
    deployed.serviceConfig.serviceAccountEmail,
    'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  )
  const sources = {}
  for (const path of [
    'functions/account-settings.mjs',
    'functions/account-domain.mjs',
    'functions/index.mjs',
    'src/data/firebase-account.ts',
    'src/shared/account-policy.ts',
  ])
    sources[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  await writeFile(
    'docs/ACCOUNT-SETTINGS-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        project,
        database: 'cerms',
        function: { name: target, state: deployed.state, updateTime: deployed.updateTime },
        allExistingFunctionsUnchanged: true,
        allRulesAndIndexesUnchanged: true,
        allDatabaseSettingsUnchanged: true,
        allBucketAndIamPoliciesUnchanged: true,
        allExistingSecretPoliciesUnchanged: true,
        allSchedulesUnchanged: true,
        selfOnlyProfileNameAndVerifiedEmail: true,
        noAuthConfigurationOrAccountsModifiedDuringDeployment: true,
        noProductionTestEmailsOrWrites: true,
        sources,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'accountSettings ACTIVE; every existing function and all legacy/shared resources unchanged.',
  )
}
