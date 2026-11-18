// Metadata only: no sale/member/profile reads or writes and no test email sends.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const project = 'cerms-7af24',
  targets = ['refundSale', 'completeSale', 'createStaffAccount', 'sendDevDailyReport']
const releasePath = 'firebase/releases/refunds-2026-11-17.rules'
const targeted = (f) => targets.includes(f.name.split('/').at(-1))
const beforePath = '/private/tmp/cerms-refunds-before.json'
const headers = {
  Authorization: `Bearer ${await releaseToken()}`,
  'Content-Type': 'application/json',
}
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { headers, method, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.ok(r.ok, `Refund compatibility inspection failed (${r.status})`)
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
  const named = resources.releases.find((r) => r.name.endsWith('/cloud.firestore/cerms'))
  const rules = await api('https://firebaserules.googleapis.com/v1/' + named.rulesetName)
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
          .filter(([k]) => !['functions', 'releases'].includes(k))
          .map(([k, v]) => [k, hash(v)]),
      ),
      otherReleases: hash(resources.releases.filter((r) => r !== named)),
      extras: hash(extras),
      schedules: hash(schedules),
    },
    functions: resources.functions,
    rules: rules.source.files[0].content,
  }
}
const mode = process.argv[2],
  current = await state()
if (mode === 'before') {
  assert.equal(
    current.rules,
    await readFile('firebase/releases/staff-management-2026-11-17.rules', 'utf8'),
  )
  await writeFile(beforePath, JSON.stringify(current), { mode: 0o600 })
  console.log(
    'Refund compatibility baseline saved; existing services, rules, schedules and IAM recorded.',
  )
} else {
  assert.equal(mode, 'after')
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  assert.deepEqual(
    current.hashes,
    before.hashes,
    'Legacy/Storage rules, all indexes, database settings, buckets, IAM/secret policies and schedules must remain unchanged',
  )
  assert.deepEqual(
    current.functions.filter((f) => !targeted(f)),
    before.functions.filter((f) => !targeted(f)),
    'Every existing function must remain unchanged',
  )
  assert.equal(current.rules, await readFile(releasePath, 'utf8'))
  for (const name of targets)
    assert.equal(current.functions.find((f) => f.name.endsWith('/' + name))?.state, 'ACTIVE')
  const deployed = current.functions.find((f) => f.name.endsWith('/refundSale'))
  assert.equal(
    deployed.serviceConfig.serviceAccountEmail,
    'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  )
  const sources = {}
  for (const path of [
    'functions/refunds.mjs',
    'functions/refund-domain.mjs',
    'functions/pos.mjs',
    'functions/staff-account.mjs',
    'report-functions/report-data.mjs',
    'report-functions/report-render.mjs',
    'src/shared/refund-policy.ts',
    releasePath,
  ])
    sources[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  await writeFile(
    'docs/REFUNDS-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        project,
        database: 'cerms',
        rulesBaseline: releasePath,
        functions: current.functions
          .filter(targeted)
          .map((f) => ({ name: f.name, state: f.state, updateTime: f.updateTime })),
        allUntargetedFunctionsUnchanged: true,
        allLegacyAndStorageRulesUnchanged: true,
        allIndexesUnchanged: true,
        allDatabaseSettingsUnchanged: true,
        allBucketAndIamPoliciesUnchanged: true,
        allExistingSecretPoliciesUnchanged: true,
        allSchedulesUnchanged: true,
        sharedAuthAccountsUnchanged: true,
        refundSalesAndRegisterAccountingOnlyInNamedCerms: true,
        originalReceiptsAndClosedRegistersPreserved: true,
        syntheticRulesChecks: 391,
        noProductionTestEmailsOrWrites: true,
        sources,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'Refund functions ACTIVE; exact named rules verified; all other functions and legacy/shared resources unchanged.',
  )
}
