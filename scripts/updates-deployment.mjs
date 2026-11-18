// Scoped requested setup only. Never reads/writes business documents or Auth users.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { snapshot } from './firebase-release-compatibility.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const project = 'cerms-7af24',
  account = `cerms5-support@${project}.iam.gserviceaccount.com`
const member = `serviceAccount:${account}`,
  bucketName = `${project}-cerms5-bug-reports`
const secret = 'CERMS5_SUPPORT_SMTP',
  baselinePath = '/private/tmp/cerms-updates-deployment-before.json'
const releasePath = 'firebase/releases/updates-2026-11-17.rules'
const targets = [
  'cashDrop',
  'submitBugReport',
  'completeSale',
  'createStaffAccount',
  'sendDevDailyReport',
]
const headers = {
  Authorization: `Bearer ${await releaseToken()}`,
  'Content-Type': 'application/json',
}
async function api(url, method = 'GET', body, allow404 = false) {
  const r = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (allow404 && r.status === 404) return null
  // Do not echo bodies from secret/SMTP APIs.
  assert.ok(
    r.ok,
    `Setup API ${method} ${new URL(url).hostname}${new URL(url).pathname.replace(/versions\/[^/]+:access/, 'versions/[redacted]')} failed (${r.status})`,
  )
  return r.status === 204 ? {} : r.json()
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
const projectUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`
const secretBase = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/`
const accountUrl = `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${account}`
const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}`
const policy = () =>
  api(projectUrl + ':getIamPolicy', 'POST', { options: { requestedPolicyVersion: 3 } })
function withoutSupport(p) {
  return {
    bindings: p.bindings
      .map((b) => ({ ...b, members: b.members.filter((m) => m !== member).sort() }))
      .filter((b) => b.members.length)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    auditConfigs: p.auditConfigs,
  }
}
async function state() {
  const [s, jobs, iam, reportSecret, legacySecret, releaseBucket, releaseIam] = await Promise.all([
    snapshot(),
    api(
      `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs?pageSize=500`,
    ),
    policy(),
    api(secretBase + 'CERMS5_REPORT_SMTP:getIamPolicy'),
    api(secretBase + 'firestore-send-email-SMTP_PASSWORD:getIamPolicy'),
    api(`https://storage.googleapis.com/storage/v1/b/${project}-cerms5-releases`),
    api(`https://storage.googleapis.com/storage/v1/b/${project}-cerms5-releases/iam`),
  ])
  assert.ok(!jobs.nextPageToken)
  const named = s.releases.find((r) => r.name.endsWith('/cloud.firestore/cerms'))
  const rules = await api('https://firebaserules.googleapis.com/v1/' + named.rulesetName)
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
        Object.entries(s)
          .filter(([k]) => !['functions', 'releases'].includes(k))
          .map(([k, v]) => [k, hash(v)]),
      ),
      otherReleases: hash(s.releases.filter((r) => r !== named)),
      projectPolicyWithoutSupport: hash(withoutSupport(iam)),
      reportSecretPolicy: hash(reportSecret),
      legacySecretPolicy: hash(legacySecret),
      releaseBucket: hash(releaseBucket),
      releaseIam: hash(releaseIam),
      schedules: hash(schedules),
    },
    functions: s.functions,
    rules: rules.source.files[0].content,
  }
}
async function setup() {
  if (!(await api(accountUrl, 'GET', undefined, true)))
    await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`, 'POST', {
      accountId: 'cerms5-support',
      serviceAccount: {
        displayName: 'CERMS 5 bug report delivery',
        description: 'Private CERMS 5 reports only; no legacy database or mail extension.',
      },
    })
  const p = await policy()
  p.version = 3
  p.bindings ??= []
  const condition = {
    title: 'CERMS5_support_named_database_only',
    expression: `resource.name=="projects/${project}/databases/cerms"`,
  }
  if (
    !p.bindings.some(
      (b) =>
        b.role === 'roles/datastore.user' &&
        b.condition?.expression === condition.expression &&
        b.members.includes(member),
    )
  ) {
    p.bindings.push({ role: 'roles/datastore.user', members: [member], condition })
    await api(projectUrl + ':setIamPolicy', 'POST', { policy: p })
  }
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
      labels: { application: 'cerms5', purpose: 'bug-reports' },
    })
  assert.equal(bucket.iamConfiguration.uniformBucketLevelAccess.enabled, true)
  assert.equal(bucket.iamConfiguration.publicAccessPrevention, 'enforced')
  const bp = await api(bucketUrl + '/iam')
  bp.bindings ??= []
  assert.ok(
    !bp.bindings.some((b) =>
      b.members.some((m) => ['allUsers', 'allAuthenticatedUsers'].includes(m)),
    ),
  )
  for (const role of ['roles/storage.objectCreator', 'roles/storage.objectViewer'])
    if (!bp.bindings.some((b) => b.role === role && b.members.includes(member)))
      bp.bindings.push({ role, members: [member] })
  await api(bucketUrl + '/iam', 'PUT', bp)
  const ap = await api(accountUrl + ':getIamPolicy', 'POST', {})
  ap.bindings ??= []
  if (
    !ap.bindings.some(
      (b) => b.role === 'roles/iam.serviceAccountTokenCreator' && b.members.includes(member),
    )
  ) {
    ap.bindings.push({ role: 'roles/iam.serviceAccountTokenCreator', members: [member] })
    await api(accountUrl + ':setIamPolicy', 'POST', { policy: ap })
  }
  const source = await api(secretBase + 'CERMS5_REPORT_SMTP/versions/latest:access')
  // Reuse the known CERMS 5 mail transport through a separate secret, with no rotation.
  const smtp = JSON.parse(Buffer.from(source.payload.data, 'base64').toString('utf8'))
  assert.equal(smtp.host, 'smtp.office365.com')
  assert.equal(smtp.port, 587)
  const require = createRequire(new URL('../functions/package.json', import.meta.url))
  const transport = require('nodemailer').createTransport({
    ...smtp,
    requireTLS: true,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    logger: false,
    debug: false,
  })
  try {
    await transport.verify()
  } catch {
    throw new Error(
      'Support SMTP authentication failed; no email sent and no legacy configuration changed.',
    )
  } finally {
    transport.close()
  }
  if (!(await api(secretBase + secret, 'GET', undefined, true))) {
    await api(secretBase.slice(0, -1) + `?secretId=${secret}`, 'POST', {
      replication: { automatic: {} },
      labels: { application: 'cerms5', purpose: 'support-email' },
    })
    await api(secretBase + secret + ':addVersion', 'POST', {
      payload: { data: source.payload.data },
    })
  } else {
    const previous = await api(secretBase + secret + '/versions/latest:access')
    assert.equal(
      previous.payload.data,
      source.payload.data,
      'Never rotate support credentials implicitly',
    )
  }
  const sp = await api(secretBase + secret + ':getIamPolicy')
  sp.bindings ??= []
  if (
    !sp.bindings.some(
      (b) => b.role === 'roles/secretmanager.secretAccessor' && b.members.includes(member),
    )
  ) {
    sp.bindings.push({ role: 'roles/secretmanager.secretAccessor', members: [member] })
    await api(secretBase + secret + ':setIamPolicy', 'POST', { policy: sp })
  }
  console.log(
    'Private support bucket, isolated identity, signing and SMTP secret ready. SMTP authentication verified; no email sent.',
  )
}
const mode = process.argv[2]
if (mode === 'before') {
  const s = await state()
  assert.equal(
    s.rules,
    await readFile('firebase/releases/notification-sounds-2026-11-16.rules', 'utf8'),
  )
  await writeFile(baselinePath, JSON.stringify(s), { mode: 0o600 })
  console.log('Compatibility baseline saved; named rules match the verified prior release.')
} else if (mode === 'setup') {
  await setup()
} else if (mode === 'after') {
  const before = JSON.parse(await readFile(baselinePath, 'utf8')),
    after = await state()
  assert.deepEqual(
    after.hashes,
    before.hashes,
    'Legacy/shared settings, schedules, indexes and existing secret policies must be unchanged',
  )
  const targeted = (f) => targets.includes(f.name.split('/').at(-1))
  assert.deepEqual(
    after.functions.filter((f) => !targeted(f)),
    before.functions.filter((f) => !targeted(f)),
    'Every untargeted function must remain unchanged',
  )
  assert.equal(after.rules, await readFile(releasePath, 'utf8'))
  for (const name of targets)
    assert.equal(after.functions.find((f) => f.name.endsWith('/' + name))?.state, 'ACTIVE')
  const supportFunction = after.functions.find((f) => f.name.endsWith('/submitBugReport'))
  assert.equal(supportFunction.serviceConfig.serviceAccountEmail, account)
  const [bucket, bp, sp, ap, p] = await Promise.all([
    api(bucketUrl),
    api(bucketUrl + '/iam'),
    api(secretBase + secret + ':getIamPolicy'),
    api(accountUrl + ':getIamPolicy', 'POST', {}),
    policy(),
  ])
  assert.equal(bucket.iamConfiguration.uniformBucketLevelAccess.enabled, true)
  assert.equal(bucket.iamConfiguration.publicAccessPrevention, 'enforced')
  assert.ok(
    !bp.bindings.some((b) =>
      b.members.some((m) => ['allUsers', 'allAuthenticatedUsers'].includes(m)),
    ),
  )
  for (const role of ['roles/storage.objectCreator', 'roles/storage.objectViewer'])
    assert.ok(bp.bindings.some((b) => b.role === role && b.members.includes(member)))
  assert.ok(
    sp.bindings.some(
      (b) => b.role === 'roles/secretmanager.secretAccessor' && b.members.includes(member),
    ),
  )
  assert.ok(
    ap.bindings.some(
      (b) => b.role === 'roles/iam.serviceAccountTokenCreator' && b.members.includes(member),
    ),
  )
  const rights = p.bindings.filter((b) => b.members.includes(member))
  assert.equal(rights.length, 1)
  assert.equal(rights[0].role, 'roles/datastore.user')
  assert.equal(
    rights[0].condition.expression,
    `resource.name=="projects/${project}/databases/cerms"`,
  )
  const sources = {}
  for (const path of [
    'functions/index.mjs',
    'functions/pos.mjs',
    'functions/staff-account.mjs',
    'functions/bug-report.mjs',
    'functions/checkout-domain.mjs',
    'functions/package-lock.json',
    'report-functions/report-render.mjs',
    'report-functions/report-data.mjs',
    releasePath,
  ])
    sources[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  await writeFile(
    'docs/UPDATES-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        project,
        database: 'cerms',
        rulesBaseline: releasePath,
        functions: after.functions
          .filter(targeted)
          .map((f) => ({ name: f.name, state: f.state, updateTime: f.updateTime })),
        privateSupportBucket: bucketName,
        supportServiceAccount: account,
        smtpAuthenticationVerifiedWithoutEmail: true,
        allUntargetedFunctionsUnchanged: true,
        allLegacyAndSharedSettingsUnchanged: true,
        allIndexesAndSchedulesUnchanged: true,
        legacyAndReportSecretPoliciesUnchanged: true,
        onlyProjectIamAdditionIsDatabaseScopedSupportIdentity: true,
        noLiveTestWrites: true,
        noTestEmailsSent: true,
        sources,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'All five requested functions ACTIVE, exact named rules verified; legacy/shared resources unchanged.',
  )
} else throw new Error('Use before, setup or after')
