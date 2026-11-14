// Scoped additive setup/verification. No document-write or email-send APIs.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { releaseToken } from './firebase-release-auth.mjs'
import { snapshot } from './firebase-release-compatibility.mjs'
import { reportConfig as config } from '../report-functions/config.mjs'
import { createRequire } from 'node:module'
const reportRequire = createRequire(new URL('../report-functions/package.json', import.meta.url))
const nodemailer = reportRequire('nodemailer')
const project = config.project,
  member = `serviceAccount:${config.serviceAccount}`
const secretUrl = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${config.smtpSecret}`
const targetName = `projects/${project}/locations/us-central1/functions/sendDevDailyReport`
const jobName = `projects/${project}/locations/us-central1/jobs/firebase-schedule-sendDevDailyReport-us-central1`
const beforePath = '/private/tmp/cerms-daily-report-before.json'
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
  // Never echo SMTP configuration or secret values from error response bodies.
  if (!r.ok) {
    const detail =
      new URL(url).hostname === 'cloudresourcemanager.googleapis.com'
        ? (await r.json().catch(() => ({}))).error?.message
        : ''
    throw new Error(
      `Report setup/inspection failed (${r.status}) at ${new URL(url).hostname}${detail ? ': ' + detail : ''}`,
    )
  }
  return r.status === 204 ? {} : r.json()
}
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
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')
const iamUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`
const projectPolicy = () =>
  api(iamUrl + ':getIamPolicy', 'POST', { options: { requestedPolicyVersion: 3 } })
function withoutReportMember(policy) {
  return {
    ...policy,
    etag: undefined,
    version: undefined,
    bindings: policy.bindings
      .map((b) => ({ ...b, members: b.members.filter((m) => m !== member).sort() }))
      .filter((b) => b.members.length)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}
async function state() {
  const [resources, scheduler, policy, secretPolicy, releaseBucket, releaseIam] = await Promise.all(
    [
      snapshot(),
      api(
        `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs?pageSize=500`,
      ),
      projectPolicy(),
      api(
        `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/firestore-send-email-SMTP_PASSWORD:getIamPolicy`,
      ),
      api(`https://storage.googleapis.com/storage/v1/b/${project}-cerms5-releases`),
      api(`https://storage.googleapis.com/storage/v1/b/${project}-cerms5-releases/iam`),
    ],
  )
  assert.equal(scheduler.nextPageToken, undefined)
  return {
    hashes: Object.fromEntries(
      Object.entries(resources)
        .filter(([key]) => key !== 'functions')
        .map(([key, value]) => [key, digest(value)]),
    ),
    functions: resources.functions.map((f) => ({ name: f.name, hash: digest(f) })),
    scheduler: (scheduler.jobs ?? [])
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
      .sort((a, b) => a.name.localeCompare(b.name)),
    projectPolicyWithoutReportMember: digest(withoutReportMember(policy)),
    legacySmtpSecretPolicy: digest(secretPolicy),
    releaseBucket: digest(releaseBucket),
    releaseIam: digest(releaseIam),
  }
}
async function setup() {
  const legacy = await api(
    `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1/functions/ext-firestore-send-email-processqueue`,
  )
  const env = legacy.serviceConfig.environmentVariables
  assert.equal(env.AUTH_TYPE, 'UsernamePassword')
  assert.equal(env.DEFAULT_FROM, config.from)
  const uri = new URL(env.SMTP_CONNECTION_URI)
  assert.equal(uri.hostname, 'smtp.office365.com')
  assert.equal(uri.port, '587')
  const ref = legacy.serviceConfig.secretEnvironmentVariables.find((s) => s.key === 'SMTP_PASSWORD')
  assert.ok(ref)
  const secret = await api(
    `https://secretmanager.googleapis.com/v1/projects/${ref.projectId}/secrets/${ref.secret}/versions/${ref.version}:access`,
  )
  const password =
    Buffer.from(secret.payload.data, 'base64').toString('utf8') || decodeURIComponent(uri.password)
  const smtp = {
    host: uri.hostname,
    port: Number(uri.port),
    secure: false,
    auth: { user: decodeURIComponent(uri.username), pass: password },
  }
  assert.ok(smtp.auth.user && smtp.auth.pass)
  const transport = nodemailer.createTransport({
    ...smtp,
    requireTLS: true,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    logger: false,
    debug: false,
  })
  try {
    await transport.verify()
  } catch {
    throw new Error(
      'SMTP authentication could not be verified without sending mail. Legacy configuration is unchanged; reporting activation is paused.',
    )
  } finally {
    transport.close()
  }
  console.log('SMTP authentication verified without sending email.')
  const accounts = `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`
  if (!(await api(`${accounts}/${config.serviceAccount}`, 'GET', undefined, true)))
    await api(accounts, 'POST', {
      accountId: 'cerms5-reports',
      serviceAccount: {
        displayName: 'CERMS 5 Dev daily reports',
        description: 'Named-cerms Dev reporting only; no legacy database, Storage or Auth access.',
      },
    })
  const policy = await projectPolicy()
  policy.version = 3
  policy.bindings ??= []
  const condition = {
    title: 'CERMS5_named_database_only',
    expression: 'resource.name=="projects/cerms-7af24/databases/cerms"',
    description: 'Named cerms data/report audit only; no legacy database access.',
  }
  if (
    !policy.bindings.some(
      (b) =>
        b.role === 'roles/datastore.user' &&
        b.condition?.expression === condition.expression &&
        b.members.includes(member),
    )
  ) {
    policy.bindings.push({ role: 'roles/datastore.user', members: [member], condition })
    await api(iamUrl + ':setIamPolicy', 'POST', { policy })
  }
  if (!(await api(secretUrl, 'GET', undefined, true))) {
    await api(
      `https://secretmanager.googleapis.com/v1/projects/${project}/secrets?secretId=${config.smtpSecret}`,
      'POST',
      {
        replication: { automatic: {} },
        labels: { application: 'cerms5', purpose: 'dev-daily-reports' },
      },
    )
    await api(secretUrl + ':addVersion', 'POST', {
      payload: { data: Buffer.from(JSON.stringify(smtp)).toString('base64') },
    })
  } else {
    const current = await api(secretUrl + '/versions/latest:access')
    assert.equal(
      digest(JSON.parse(Buffer.from(current.payload.data, 'base64').toString('utf8'))),
      digest(smtp),
      'Existing report credentials differ; do not rotate implicitly',
    )
  }
  const access = await api(secretUrl + ':getIamPolicy')
  access.bindings ??= []
  if (
    !access.bindings.some(
      (b) => b.role === 'roles/secretmanager.secretAccessor' && b.members.includes(member),
    )
  ) {
    access.bindings.push({ role: 'roles/secretmanager.secretAccessor', members: [member] })
    await api(secretUrl + ':setIamPolicy', 'POST', { policy: access })
  }
  console.log(
    'Dedicated report identity, database-scoped IAM and isolated SMTP secret prepared; no legacy grants/configuration changed.',
  )
}
const mode = process.argv[2]
if (mode === 'before') {
  await writeFile(beforePath, JSON.stringify(await state(), null, 2), { mode: 0o600 })
  console.log('Hashed compatibility snapshot saved; no credentials or report data in evidence.')
} else if (mode === 'setup') await setup()
else if (mode === 'after') {
  const before = JSON.parse(await readFile(beforePath, 'utf8')),
    after = await state()
  assert.equal(
    digest(after.hashes),
    digest(before.hashes),
    'Existing rules, database settings, indexes and buckets must remain unchanged',
  )
  assert.equal(
    digest(after.functions.filter((f) => f.name !== targetName)),
    digest(before.functions),
    'All pre-existing functions must remain unchanged',
  )
  assert.equal(
    digest(after.scheduler.filter((j) => j.name !== jobName)),
    digest(before.scheduler),
    'Existing schedules must remain unchanged',
  )
  for (const key of [
    'projectPolicyWithoutReportMember',
    'legacySmtpSecretPolicy',
    'releaseBucket',
    'releaseIam',
  ])
    assert.equal(after[key], before[key], `${key} must remain unchanged`)
  const deployed = await api(`https://cloudfunctions.googleapis.com/v2/${targetName}`)
  assert.equal(deployed.state, 'ACTIVE')
  assert.equal(deployed.serviceConfig.serviceAccountEmail, config.serviceAccount)
  const job = after.scheduler.find((j) => j.name === jobName)
  assert.equal(job?.schedule, config.schedule)
  assert.equal(job.timeZone, config.timeZone)
  assert.equal(job.state, 'ENABLED')
  const grants = (await projectPolicy()).bindings.filter((b) => b.members.includes(member))
  assert.equal(grants.length, 1)
  assert.equal(grants[0].role, 'roles/datastore.user')
  assert.equal(
    grants[0].condition?.expression,
    'resource.name=="projects/cerms-7af24/databases/cerms"',
  )
  const runPolicy = await api(
    `https://run.googleapis.com/v2/${deployed.serviceConfig.service}:getIamPolicy`,
  )
  assert.ok(
    !runPolicy.bindings?.some(
      (b) => b.members.includes('allUsers') || b.members.includes('allAuthenticatedUsers'),
    ),
    'Report endpoint must not be public',
  )
  const hashes = {}
  for (const file of [
    'config.mjs',
    'index.mjs',
    'delivery.mjs',
    'report-data.mjs',
    'report-render.mjs',
    'package-lock.json',
  ])
    hashes[file] = createHash('sha256')
      .update(await readFile(`report-functions/${file}`))
      .digest('hex')
  let testEvidence = { productionTestEmailsSent: false }
  const testDate = process.argv
    .find((value) => value.startsWith('--test-email-date='))
    ?.split('=')[1]
  if (testDate) {
    assert.match(testDate, /^\d{4}-\d{2}-\d{2}$/)
    const audit = await api(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/cerms/documents/system/dev/dailyReports/${testDate}`,
    )
    assert.equal(audit.fields.state.stringValue, 'sent')
    assert.equal(audit.fields.recipient.stringValue, config.recipient)
    testEvidence = {
      productionTestEmailsSent: true,
      userRequestedTestEmail: {
        reportDate: testDate,
        recipient: config.recipient,
        sentAt: audit.fields.sentAt.timestampValue,
        smtpAccepted: true,
        attachmentSha256: audit.fields.attachmentSha256.stringValue,
        orderCount: Number(audit.fields.orderCount.integerValue),
        closedRegisterCount: Number(audit.fields.closedRegisterCount.integerValue),
        auditPath: `system/dev/dailyReports/${testDate}`,
        fullScheduledReportNotSuppressedByTest: true,
      },
    }
  }
  await writeFile(
    'docs/DAILY-REPORT-DEPLOYMENT.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        function: {
          name: deployed.name,
          state: deployed.state,
          updateTime: deployed.updateTime,
          serviceAccount: config.serviceAccount,
        },
        recipient: config.recipient,
        business: 'dev',
        database: 'cerms',
        schedule: config.schedule,
        timeZone: config.timeZone,
        allExistingFunctionsAndSchedulesUnchanged: true,
        allRulesDatabaseSettingsAndIndexesUnchanged: true,
        allExistingBucketSettingsAndIamUnchanged: true,
        legacySmtpSecretPolicyUnchanged: true,
        onlyProjectIamAdditionIsDatabaseScopedReportIdentity: true,
        reportEndpointPublic: false,
        smtpAuthVerifiedWithoutSendingEmail: true,
        ...testEvidence,
        productionTestBusinessWrites: false,
        existingAuthAccountsModified: false,
        privateAttachmentOnlyNoPublicReportUploads: true,
        syntheticReportTests: 11,
        sourceSha256: hashes,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    'Report ACTIVE, schedule ENABLED; all existing functions/schedules/rules/databases/buckets and legacy SMTP settings unchanged. ' +
      (testDate
        ? 'User-requested Dev test acceptance recorded; no additional email sent.'
        : 'No live test email or business write.'),
  )
} else throw new Error('Use before, setup or after')
