import { createHash, randomUUID } from 'node:crypto'
import { downloadDisposition, supportEmail } from './support-email.mjs'
import { validGithubIssue } from './github-issues.mjs'

const support = 'matthew@rocmtssolutions.com'
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const text = (v, max) => typeof v === 'string' && v.length <= max
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k))
const hash = (v) => createHash('sha256').update(v).digest('hex')
const millis = (v) => v?.toMillis?.() ?? v?.getTime?.() ?? 0
const redact = (v) =>
  v
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted token]')
    .replace(/((?:password|access_token|refresh_token|idToken)\s*[=:]\s*)\S+/gi, '$1[redacted]')

// Only deliberate submissions write here. No mail extension, default DB, or profile writes.
export async function submitBugReport(request, dependencies) {
  return submitReport(request, dependencies, false)
}
export async function submitLoginSupport(request, dependencies) {
  return submitReport(request, dependencies, true)
}
async function submitReport(
  request,
  { db, bucket, send, timestamp, fail, github, now = () => Date.now() },
  login,
) {
  const uid = login ? 'login' : request.auth?.uid,
    email = login
      ? typeof request.data?.replyEmail === 'string'
        ? request.data.replyEmail.trim()
        : undefined
      : request.auth?.token?.email,
    d = request.data
  if (!uid || !id(uid) || !text(email, 320) || !/^[^\s@\r\n]+@[^\s@\r\n]+$/.test(email))
    fail(
      login ? 'invalid-argument' : 'unauthenticated',
      login ? 'Enter a valid reply email address.' : 'Sign in again before submitting a report.',
    )
  if (
    login &&
    (!/^[^\s@<>(),;:"\\[\]\x00-\x1f]+@[^\s@<>(),;:"\\[\]\x00-\x1f]+\.[^\s@<>(),;:"\\[\]\x00-\x1f]+$/.test(
      email,
    ) ||
      email.length > 254 ||
      typeof request.rawRequest?.ip !== 'string' ||
      !request.rawRequest.ip)
  )
    fail('invalid-argument', 'Enter one valid reply email address and try again.')
  if (
    !exact(d, [
      'requestId',
      'subject',
      'priority',
      'message',
      'context',
      'screenshots',
      'files',
      ...(login ? ['replyEmail'] : []),
    ]) ||
    !text(d.requestId, 36) ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(d.requestId) ||
    !text(d.subject, 200) ||
    !d.subject.trim() ||
    /[\r\n]/.test(d.subject) ||
    !['low', 'normal', 'high', 'urgent'].includes(d.priority) ||
    !text(d.message, 10000) ||
    !d.message.trim() ||
    !exact(d.context, [
      'email',
      'uid',
      'business',
      'version',
      'platform',
      'electron',
      'logs',
      ...(login ? ['mode'] : []),
    ]) ||
    (login
      ? d.context.mode !== 'login' || d.context.uid !== '' || d.context.business !== ''
      : d.context.uid !== uid || !id(d.context.business)) ||
    !text(d.context.email, 320) ||
    !text(d.context.version, 80) ||
    !text(d.context.platform, 40) ||
    !text(d.context.electron, 80) ||
    !Array.isArray(d.context.logs) ||
    d.context.logs.length > 100 ||
    !d.context.logs.every((v) => text(v, 2000)) ||
    !Array.isArray(d.screenshots) ||
    d.screenshots.length > 5 ||
    !Array.isArray(d.files) ||
    d.files.length > 10
  )
    fail('invalid-argument', 'Check the report details and attachments.')
  const attachments = [...d.screenshots, ...d.files]
  let total = 0
  const artifacts = attachments.map((a, index) => {
    if (
      !exact(a, ['name', 'contentType', 'base64', 'size']) ||
      !text(a.name, 200) ||
      !a.name.trim() ||
      /[\r\n\x00]/.test(a.name) ||
      !text(a.contentType, 100) ||
      !/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(a.contentType) ||
      !text(a.base64, 12 * 1024 * 1024) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(a.base64) ||
      !Number.isSafeInteger(a.size) ||
      a.size < 1 ||
      a.size > 8 * 1024 * 1024
    )
      fail('invalid-argument', 'An attachment is invalid or exceeds 8 MB.')
    const bytes = Buffer.from(a.base64, 'base64')
    total += bytes.length
    if (bytes.length !== a.size || bytes.toString('base64') !== a.base64 || total > 8 * 1024 * 1024)
      fail('invalid-argument', 'Screenshots and attachments must total no more than 8 MB.')
    return { bytes, name: a.name, contentType: a.contentType, key: `${index}-${hash(bytes)}` }
  })
  const business = login ? 'login' : d.context.business
  // Canonical request hash ignores object key ordering and untrusted display email.
  const metadata = {
    uid,
    email,
    business,
    ...(login ? { origin: 'login' } : {}),
    subject: d.subject.trim(),
    priority: d.priority,
    message: d.message.trim(),
    version: d.context.version,
    platform: d.context.platform,
    electron: d.context.electron,
    logs: d.context.logs.map(redact),
    artifacts: artifacts.map(({ name, contentType, key }) => ({ name, contentType, key })),
  }
  const fingerprint = hash(JSON.stringify(metadata)),
    runId = randomUUID()
  const ref = db.doc(
    login
      ? `supportRequests/${d.requestId}`
      : `system/${business}/bugReports/${uid}-${d.requestId}`,
  )
  const limits = login
    ? [
        [db.doc('supportRequestLimits/ip-' + hash(request.rawRequest.ip)), 3],
        [db.doc('supportRequestLimits/email-' + hash(email.toLowerCase())), 3],
        [db.doc('supportRequestLimits/global'), 30],
      ]
    : [[db.doc(`system/${business}/bugReportLimits/${uid}`), 5]]
  const authorize = async (tx) => {
    if (login) return { displayName: 'Login support (unverified)' }
    const [profile, system] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`system/${business}`)),
    ])
    if (
      !profile.exists ||
      profile.data().uid !== uid ||
      profile.data().access !== business ||
      !system.exists
    )
      fail('permission-denied', 'Your business access changed. Sign in again.')
    return profile.data()
  }
  const claim = await db.runTransaction(async (tx) => {
    const profile = await authorize(tx)
    const [prior, ...savedLimits] = await Promise.all([
      tx.get(ref),
      ...limits.map(([ref]) => tx.get(ref)),
    ])
    const p = prior.data()
    if (p) {
      if (p.fingerprint !== fingerprint)
        fail('already-exists', 'Retry with the original report details, or open a new report.')
      if (p.state === 'sent') return { sent: true, github: p.github }
      if (['sending', 'uncertain'].includes(p.state))
        fail(
          'failed-precondition',
          'Email delivery is awaiting support review. Do not submit this report again.',
        )
      if (p.state === 'preparing' && millis(p.leaseUntil) > now())
        fail('aborted', 'This report is still being prepared. Retry shortly.')
    } else {
      const values = savedLimits.map((snapshot) => snapshot.data())
      values.forEach((l, i) => {
        if (millis(l?.windowStart) > now() - 3600000 && l.count >= limits[i][1])
          fail('resource-exhausted', 'Please wait before submitting more reports.')
      })
      values.forEach((l, i) => {
        const current = millis(l?.windowStart) > now() - 3600000
        tx.set(limits[i][0], {
          windowStart: current ? l.windowStart : new Date(now()),
          count: current ? l.count + 1 : 1,
        })
      })
    }
    tx.set(ref, {
      ...metadata,
      reporterName: profile.displayName || uid,
      fingerprint,
      runId,
      state: 'preparing',
      leaseUntil: new Date(now() + 180000),
      updatedAt: timestamp(),
      ...(p ? { createdAt: p.createdAt } : { createdAt: timestamp() }),
      ...(p?.github ? { github: p.github } : {}),
    })
    return { sent: false, github: p?.github }
  })
  if (claim.sent)
    return {
      reportId: d.requestId,
      ...(claim.github?.issue ? { issueUrl: claim.github.issue.url } : {}),
    }
  let sending = false
  try {
    const links = []
    for (const a of artifacts) {
      const file = bucket.file(
        login
          ? `login-support/${d.requestId}/${a.key}`
          : `reports/${business}/${uid}/${d.requestId}/${a.key}`,
      )
      const disposition = downloadDisposition(a.name)
      try {
        await file.save(a.bytes, {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: a.contentType,
            contentDisposition: disposition,
            cacheControl: 'private, no-store',
          },
        })
      } catch (error) {
        if (Number(error.code) !== 412) throw error
      }
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: now() + 7 * 24 * 3600000,
        responseDisposition: disposition,
        responseType: a.contentType,
      })
      links.push({ name: a.name, url, contentType: a.contentType, size: a.bytes.length })
    }
    let issue = claim.github?.state === 'created' ? claim.github.issue : undefined
    const saveGithub = async (value) =>
      db.runTransaction(async (tx) => {
        await authorize(tx)
        const current = (await tx.get(ref)).data()
        if (current?.runId !== runId || current.state !== 'preparing')
          fail('aborted', 'Report preparation changed. Retry the original report.')
        tx.update(ref, { github: value, updatedAt: timestamp() })
      })
    if (github && !issue) {
      const marker = hash(`${login ? 'login' : business + '/' + uid}/${d.requestId}`)
      const previous = claim.github
      if (previous && ['creating', 'uncertain'].includes(previous.state)) {
        issue = await github.find(marker, previous.startedAt)
        if (!issue)
          fail(
            'unavailable',
            'The report is saved, but GitHub issue confirmation is pending. Retry this original report; do not submit a new copy.',
          )
      } else {
        const attempt = { state: 'creating', marker, startedAt: now() }
        await saveGithub(attempt)
        try {
          issue = await github.create(metadata, marker, artifacts.length)
        } catch (error) {
          await saveGithub({ ...attempt, state: error.definitive ? 'failed' : 'uncertain' })
          fail(
            'unavailable',
            'The report is saved, but its GitHub issue was not confirmed. Retry this original report.',
          )
        }
      }
      if (!validGithubIssue(issue))
        fail('unavailable', 'GitHub issue confirmation needs review. Retry the original report.')
      await saveGithub({ state: 'created', marker, issue })
    }
    if (issue && !validGithubIssue(issue))
      fail('unavailable', 'The saved GitHub issue needs review.')
    const message = supportEmail(metadata, links, d.requestId, now(), issue)
    await db.runTransaction(async (tx) => {
      await authorize(tx)
      const current = (await tx.get(ref)).data()
      if (current?.runId !== runId || current.state !== 'preparing')
        fail('aborted', 'Report preparation changed. Retry shortly.')
      tx.update(ref, { state: 'sending', updatedAt: timestamp() })
    })
    sending = true
    const result = await send({
      from: { name: 'CERMS 5 Support', address: 'system@rocmtssolutions.com' },
      to: [support],
      replyTo: email,
      subject: `[CERMS 5 ${d.priority}] ${d.subject.trim()}`,
      messageId: `<cerms5-bug-${uid}-${d.requestId}@rocmtssolutions.com>`,
      ...message,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    if (
      !result.accepted?.some(
        (v) => (typeof v === 'string' ? v : v.address)?.toLowerCase() === support,
      )
    )
      throw new Error('Recipient acceptance not confirmed')
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data()
      if (current?.runId === runId && current.state === 'sending')
        tx.update(ref, { state: 'sent', sentAt: timestamp(), updatedAt: timestamp() })
      else throw new Error('Report claim changed')
    })
    return { reportId: d.requestId, ...(issue ? { issueUrl: issue.url } : {}) }
  } catch (error) {
    await db
      .runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data()
        if (current?.runId === runId && current.state !== 'sent')
          tx.update(ref, { state: sending ? 'uncertain' : 'failed', updatedAt: timestamp() })
      })
      .catch(() => {})
    if (sending)
      fail(
        'failed-precondition',
        'Email delivery could not be confirmed. Support must review before resending.',
      )
    throw error
  }
}
