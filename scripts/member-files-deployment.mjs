// Metadata only: no sale/member/profile reads or writes and no test email sends.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const project = 'cerms-7af24',
  target = `projects/${project}/locations/us-central1/functions/memberFiles`
const bucketName = `${project}-cerms5-member-files`,
  support = 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  supportMember = `serviceAccount:${support}`
const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}`
const accountUrl = `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${support}`
const beforePath = '/private/tmp/cerms-member-files-before.json'
const headers = {
  Authorization: `Bearer ${await releaseToken()}`,
  'Content-Type': 'application/json',
}
async function api(url, method = 'GET', body, allow404 = false) {
  const r = await fetch(url, { headers, method, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (allow404 && r.status === 404) return null
  assert.ok(r.ok, `Member files compatibility inspection failed (${r.status})`)
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
    api(accountUrl + ':getIamPolicy', 'POST', {}),
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
async function setup() {
  const baseline = JSON.parse(await readFile(beforePath, 'utf8'))
  assert.ok(baseline)
  let bucket = await api(bucketUrl, 'GET', undefined, true)
  if (!bucket)
    bucket = await api(`https://storage.googleapis.com/storage/v1/b?project=${project}`, 'POST', {
      name: bucketName,
      location: 'US-CENTRAL1',
      storageClass: 'STANDARD',
      iamConfiguration: {
        uniformBucketLevelAccess: { enabled: true },
        publicAccessPrevention: 'enforced',
      },
      labels: { application: 'cerms5', purpose: 'member-files' },
    })
  assert.equal(bucket.iamConfiguration.uniformBucketLevelAccess.enabled, true)
  assert.equal(bucket.iamConfiguration.publicAccessPrevention, 'enforced')
  const iam = await api(bucketUrl + '/iam')
  iam.bindings ??= []
  assert.ok(
    !iam.bindings.some((b) =>
      b.members.some((m) => ['allUsers', 'allAuthenticatedUsers'].includes(m)),
    ),
  )
  for (const role of ['roles/storage.objectCreator', 'roles/storage.objectViewer'])
    if (!iam.bindings.some((b) => b.role === role && b.members.includes(supportMember)))
      iam.bindings.push({ role, members: [supportMember] })
  await api(bucketUrl + '/iam', 'PUT', iam)
  const signing = await api(accountUrl + ':getIamPolicy', 'POST', {})
  assert.ok(
    signing.bindings?.some(
      (b) => b.role === 'roles/iam.serviceAccountTokenCreator' && b.members.includes(supportMember),
    ),
    'Existing support self-signing permission must be available; never broaden project IAM',
  )
  console.log(
    'New isolated private member-file bucket ready; creator/viewer granted only on that bucket. No objects uploaded.',
  )
}
const mode = process.argv[2]
if (mode === 'setup') {
  await setup()
} else {
  const current = await state()
  if (mode === 'before') {
    assert.ok(
      !current.functions.some((f) => f.name === target),
      'Member file endpoint must not replace an existing function',
    )
    assert.equal(
      await api(bucketUrl, 'GET', undefined, true),
      null,
      'Do not modify an existing bucket implicitly',
    )
    await writeFile(beforePath, JSON.stringify(current), { mode: 0o600 })
    console.log(
      'Member-files compatibility baseline saved; existing rules, functions, settings, IAM and schedules recorded.',
    )
  } else {
    assert.equal(mode, 'after')
    const before = JSON.parse(await readFile(beforePath, 'utf8'))
    assert.deepEqual(
      current.hashes,
      before.hashes,
      'All existing settings, rules, indexes, IAM, bucket/secret policies and schedules must remain unchanged',
    )
    assert.deepEqual(
      current.functions.filter((f) => f.name !== target),
      before.functions,
      'Every existing function must remain unchanged',
    )
    const deployed = current.functions.find((f) => f.name === target)
    assert.equal(deployed?.state, 'ACTIVE')
    assert.equal(deployed.serviceConfig.serviceAccountEmail, support)
    const bucket = await api(bucketUrl),
      iam = await api(bucketUrl + '/iam')
    assert.equal(bucket.iamConfiguration.uniformBucketLevelAccess.enabled, true)
    assert.equal(bucket.iamConfiguration.publicAccessPrevention, 'enforced')
    assert.ok(
      !iam.bindings.some((b) =>
        b.members.some((m) => ['allUsers', 'allAuthenticatedUsers'].includes(m)),
      ),
    )
    assert.deepEqual(
      iam.bindings
        .filter((b) => b.members.includes(supportMember))
        .map((b) => b.role)
        .sort(),
      ['roles/storage.objectCreator', 'roles/storage.objectViewer'].sort(),
    )
    const sources = {}
    for (const path of [
      'functions/member-files.mjs',
      'functions/member-files-domain.mjs',
      'src/shared/member-files-policy.ts',
      'src/data/firebase-member-files.ts',
      'src/renderer/src/features/members/MemberFiles.tsx',
    ])
      sources[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex')
    await writeFile(
      'docs/MEMBER-FILES-DEPLOYMENT.json',
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          project,
          database: 'cerms',
          function: { name: target, state: deployed.state, updateTime: deployed.updateTime },
          isolatedPrivateBucket: bucketName,
          uniformAccessAndPublicAccessPrevention: true,
          newBucketServiceRoles: ['roles/storage.objectCreator', 'roles/storage.objectViewer'],
          existingSigningPolicyUnchanged: true,
          allExistingFunctionsUnchanged: true,
          allRulesAndIndexesUnchanged: true,
          allDatabaseSettingsUnchanged: true,
          allExistingBucketsAndIamSecretPoliciesUnchanged: true,
          allSchedulesUnchanged: true,
          noLegacyDataOrAuthChanges: true,
          noProductionTestFilesOrWrites: true,
          sources,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(
      'memberFiles ACTIVE; new private bucket verified; every existing function and all legacy/shared resources unchanged.',
    )
  }
}
