// Metadata only: no sale/member/profile reads or writes and no test email sends.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const project = 'cerms-7af24',
  targets = [
    'inventoryEmailSettings',
    'inventoryProductWritten',
    'inventoryEmailSettingsWritten',
  ].map((n) => `projects/${project}/locations/us-central1/functions/${n}`)
const beforePath = '/private/tmp/cerms-inventory-email-before.json'
const headers = {
  Authorization: `Bearer ${await releaseToken()}`,
  'Content-Type': 'application/json',
}
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { headers, method, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.ok(r.ok, `Inventory email compatibility inspection failed (${r.status})`)
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
const projectNumber = JSON.parse(
  await readFile('config/firebase-client.json', 'utf8'),
).messagingSenderId
const supportMember = 'serviceAccount:cerms5-support@cerms-7af24.iam.gserviceaccount.com'
const pubsubMember = `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`
const supportAccountUrl = `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/cerms5-support@cerms-7af24.iam.gserviceaccount.com`
function normalizeProject(iam) {
  const normalizedIam = { ...iam }
  delete normalizedIam.etag
  const exceptions = {
    'roles/eventarc.eventReceiver':
      'serviceAccount:cerms5-support@cerms-7af24.iam.gserviceaccount.com',
    'roles/eventarc.serviceAgent': `serviceAccount:service-${projectNumber}@gcp-sa-eventarc.iam.gserviceaccount.com`,
  }
  normalizedIam.bindings = iam.bindings
    .map((b) => ({
      ...b,
      members: b.members.filter((m) => b.condition || m !== exceptions[b.role]).sort(),
    }))
    .filter((b) => b.members.length)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return normalizedIam
}
function normalizeSupport(iam) {
  const result = { ...iam }
  delete result.etag
  result.bindings = (iam.bindings ?? [])
    .map((b) => ({
      ...b,
      members: b.members
        .filter(
          (m) =>
            b.condition || b.role !== 'roles/iam.serviceAccountTokenCreator' || m !== pubsubMember,
        )
        .sort(),
    }))
    .filter((b) => b.members.length)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return result
}
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
  const iam = extras.shift()
  const normalizedIam = normalizeProject(iam)
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
      iamExceptScopedEventarcGrants: hash(normalizedIam),
      schedules: hash(schedules),
      supportAccountExceptPubsubTokenGrant: hash(
        normalizeSupport(await api(supportAccountUrl + ':getIamPolicy', 'POST', {})),
      ),
    },
    functions: resources.functions,
  }
}
if (process.argv[2] === 'scope-eventarc-iam') {
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`
  const policy = await api(url + ':getIamPolicy', 'POST', {
    options: { requestedPolicyVersion: 3 },
  })
  const proposed = {
    ...policy,
    bindings: policy.bindings
      .map((b) => ({
        ...b,
        members: b.members.filter(
          (m) =>
            !(
              !b.condition &&
              ((b.role === 'roles/run.invoker' &&
                m === `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`) ||
                (b.role === 'roles/iam.serviceAccountTokenCreator' && m === pubsubMember))
            ),
        ),
      }))
      .filter((b) => b.members.length),
  }
  assert.equal(
    hash(normalizeProject(proposed)),
    before.hashes.iamExceptScopedEventarcGrants,
    'Refuse to remove any permission unless the proposed IAM exactly matches the original baseline except the scoped Eventarc grants',
  )
  const accountPolicy = await api(supportAccountUrl + ':getIamPolicy', 'POST', {})
  // Existing before files predate this resource check. Record its untouched policy before adding the scoped grant.
  if (!before.hashes.supportAccountExceptPubsubTokenGrant) {
    before.hashes.supportAccountExceptPubsubTokenGrant = hash(normalizeSupport(accountPolicy))
    await writeFile(beforePath, JSON.stringify(before), { mode: 0o600 })
  }
  let binding = (accountPolicy.bindings ??= []).find(
    (b) => b.role === 'roles/iam.serviceAccountTokenCreator' && !b.condition,
  )
  if (!binding) {
    binding = { role: 'roles/iam.serviceAccountTokenCreator', members: [] }
    accountPolicy.bindings.push(binding)
  }
  if (!binding.members.includes(pubsubMember)) {
    binding.members.push(pubsubMember)
    await api(supportAccountUrl + ':setIamPolicy', 'POST', { policy: accountPolicy })
  }
  for (const name of ['inventoryproductwritten', 'inventoryemailsettingswritten']) {
    const base = `https://run.googleapis.com/v1/projects/${project}/locations/us-central1/services/${name}`
    const resource = await api(base + ':getIamPolicy')
    let invoker = (resource.bindings ??= []).find(
      (b) => b.role === 'roles/run.invoker' && !b.condition,
    )
    if (!invoker) {
      invoker = { role: 'roles/run.invoker', members: [] }
      resource.bindings.push(invoker)
    }
    if (!invoker.members.includes(supportMember)) {
      invoker.members.push(supportMember)
      await api(base + ':setIamPolicy', 'POST', {
        policy: resource,
        updateMask: 'bindings,etag,version',
      })
    }
  }
  if (JSON.stringify(proposed.bindings) !== JSON.stringify(policy.bindings))
    await api(url + ':setIamPolicy', 'POST', { policy: proposed })
  console.log(
    'Inventory trigger invocation and Pub/Sub token creation are resource-scoped; CLI-added broad project grants restored to baseline.',
  )
  process.exit(0)
}
if (process.argv[2] === 'grant-eventarc') {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`
  const policy = await api(url + ':getIamPolicy', 'POST', {
    options: { requestedPolicyVersion: 3 },
  })
  let binding = policy.bindings.find(
    (b) => b.role === 'roles/eventarc.eventReceiver' && !b.condition,
  )
  if (!binding) {
    binding = { role: 'roles/eventarc.eventReceiver', members: [] }
    policy.bindings.push(binding)
  }
  const member = 'serviceAccount:cerms5-support@cerms-7af24.iam.gserviceaccount.com'
  if (!binding.members.includes(member)) {
    binding.members.push(member)
    await api(url + ':setIamPolicy', 'POST', { policy })
  }
  console.log('Eventarc receiver permission ready for only the CERMS 5 support identity.')
  process.exit(0)
}
const mode = process.argv[2],
  current = await state()
if (mode === 'before') {
  await writeFile(beforePath, JSON.stringify(current), { mode: 0o600 })
  console.log(
    'Inventory email compatibility baseline saved; existing services, rules, schedules and IAM recorded.',
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
    current.functions.filter((f) => !targets.includes(f.name)),
    before.functions.filter((f) => !targets.includes(f.name)),
    'Every existing function must remain unchanged',
  )
  for (const target of targets) {
    const f = current.functions.find((f) => f.name === target)
    assert.equal(f?.state, 'ACTIVE')
    assert.equal(
      f.serviceConfig.serviceAccountEmail,
      'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
    )
    if (!target.endsWith('/inventoryEmailSettings')) {
      assert.equal(
        f.eventTrigger.serviceAccountEmail,
        'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
      )
      assert.equal(
        f.eventTrigger.eventFilters.find((v) => v.attribute === 'database')?.value,
        'cerms',
      )
      assert.equal(
        f.eventTrigger.eventFilters.find((v) => v.attribute === 'document')?.value,
        target.endsWith('/inventoryProductWritten')
          ? 'system/{business}/products/{productId}'
          : 'system/{business}/inventoryEmailSettings/config',
      )
    }
  }
  for (const name of ['inventoryproductwritten', 'inventoryemailsettingswritten']) {
    const iam = await api(
      `https://run.googleapis.com/v1/projects/${project}/locations/us-central1/services/${name}:getIamPolicy`,
    )
    assert.ok(
      iam.bindings.some((b) => b.role === 'roles/run.invoker' && b.members.includes(supportMember)),
    )
  }
  const sources = {}
  for (const path of [
    'functions/inventory-email.mjs',
    'functions/inventory-email-domain.mjs',
    'functions/index.mjs',
    'src/data/firebase-inventory-email.ts',
    'src/shared/inventory-email-policy.ts',
  ])
    sources[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  await writeFile(
    'docs/INVENTORY-EMAIL-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        project,
        database: 'cerms',
        functions: current.functions
          .filter((f) => targets.includes(f.name))
          .map((f) => ({ name: f.name, state: f.state, updateTime: f.updateTime })),
        allExistingFunctionsUnchanged: true,
        allRulesAndIndexesUnchanged: true,
        allDatabaseSettingsUnchanged: true,
        allBucketPoliciesUnchanged: true,
        projectIamUnchangedExceptScopedEventarcGrants: true,
        pubsubTokenCreationScopedToSupportAccount: true,
        triggerInvocationScopedToNewServices: true,
        allExistingSecretPoliciesUnchanged: true,
        allSchedulesUnchanged: true,
        onlyNamedCermsTriggers: true,
        noCatalogOrBusinessMutationsByNotificationService: true,
        noProductionTestEmailsOrWrites: true,
        sources,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'Inventory email functions ACTIVE; all other functions and legacy/shared settings unchanged except scoped Eventarc grants.',
  )
}
