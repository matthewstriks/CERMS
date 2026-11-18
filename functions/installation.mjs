import { createHash } from 'node:crypto'
import { isInstallationRequest } from './installation-domain.mjs'
const recipient = 'matthew@rocmtssolutions.com'
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
export async function reportInstallation(
  request,
  { db, send, timestamp, fail, now = () => Date.now() },
) {
  const uid = request.auth?.uid,
    d = request.data
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid))
    fail('unauthenticated', 'Sign in to confirm an installation.')
  if (!isInstallationRequest(JSON.stringify({ data: d })))
    fail('invalid-argument', 'Invalid installation report.')
  const eventId = createHash('sha256')
    .update(d.installationId + ':' + d.version)
    .digest('hex')
  const ref = db.doc('installationUpdates/' + eventId)
  const claim = await db.runTransaction(async (tx) => {
    const profile = (await tx.get(db.doc('users/' + uid))).data()
    if (
      !profile ||
      profile.uid !== uid ||
      typeof profile.access !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(profile.access)
    )
      fail('permission-denied', 'A valid CERMS staff profile is required.')
    const [system, audit] = await Promise.all([
      tx.get(db.doc('system/' + profile.access)),
      tx.get(ref),
    ])
    if (!system.exists) fail('permission-denied', 'A valid CERMS business is required.')
    const previous = audit.data()
    if (previous) {
      if (previous.state === 'sent') return { status: 'sent' }
      if (previous.state === 'uncertain' || now() - previous.startedAt > 120000)
        return { status: 'review' }
      return { status: 'pending' }
    }
    const actor = {
      uid,
      name: typeof profile.displayName === 'string' ? profile.displayName : uid,
      email:
        typeof request.auth.token?.email === 'string'
          ? request.auth.token.email
          : typeof profile.email === 'string'
            ? profile.email
            : 'Not recorded',
      business: profile.access,
    }
    tx.create(ref, {
      schemaVersion: 1,
      ...d,
      actor,
      state: 'sending',
      startedAt: now(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    })
    return { actor }
  })
  if (claim.status) return { status: claim.status }
  const actor = claim.actor,
    device = d.device
  const system = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[device.platform]
  const heading = d.previousVersion ? 'Update installed' : 'Installation confirmed'
  const fields = [
    ['User', actor.name],
    ['Account email', actor.email],
    ['CERMS version', d.version],
    ['Previous version', d.previousVersion || 'First tracked version on this installation'],
    ['Device', device.hostname],
    ['Operating system', `${system} ${device.osRelease} · ${device.arch}`],
    ['Business', actor.business],
    ['Installation ID', d.installationId],
    [
      'Confirmed at',
      new Date(now()).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        timeZoneName: 'short',
      }),
    ],
  ]
  const text = `${heading}\n\n${actor.name} logged in on ${device.hostname}, running CERMS ${d.version}.\n\n${fields.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nOne confirmation per installation and version. This is the installed running version, not a downloaded update.`
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f2;font-family:Arial,sans-serif;color:#20392c"><table role="presentation" align="center" width="100%" style="max-width:660px;background:#fff;border:1px solid #dce7df;border-collapse:collapse"><tr><td style="padding:26px 30px;background:#285b43;color:#fff"><div style="font-size:12px;letter-spacing:2px">CERMS 5 · INSTALLATION TRACKING</div><h1 style="font-size:25px;margin-bottom:0">${heading}</h1></td></tr><tr><td style="padding:26px 30px"><p style="font-size:15px;line-height:1.7"><strong>${escape(actor.name)}</strong> logged in on <strong>${escape(device.hostname)}</strong>, running <strong>CERMS ${escape(d.version)}</strong>.</p><table role="presentation" width="100%" style="border-collapse:collapse">${fields.map(([k, v]) => `<tr><th align="left" style="padding:10px 16px 10px 0;font-size:12px;color:#607267;vertical-align:top">${escape(k)}</th><td style="padding:10px 0;font-size:13px;overflow-wrap:anywhere">${escape(v)}</td></tr>`).join('')}</table></td></tr><tr><td style="padding:18px 30px;background:#f6f8f6;color:#607267;font-size:12px">First successful sign-in for this installation/version. Later logins do not send another email.</td></tr></table></body></html>`
  try {
    const result = await send({
      from: { name: 'CERMS 5 Updates', address: 'system@rocmtssolutions.com' },
      to: [recipient],
      replyTo: 'support@rocmtssolutions.com',
      subject:
        `CERMS ${d.version} installed · ${actor.name.slice(0, 80)} · ${device.hostname.slice(0, 100)}`.replace(
          /[\x00-\x1f\x7f]/g,
          ' ',
        ),
      messageId: `<cerms5-install-${eventId}@rocmtssolutions.com>`,
      text,
      html,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    if (
      !result.accepted?.some(
        (v) => (typeof v === 'string' ? v : v.address)?.toLowerCase() === recipient,
      )
    )
      throw Error('Recipient acceptance not confirmed')
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data()
      if (current?.state === 'sending')
        tx.update(ref, { state: 'sent', sentAt: timestamp(), updatedAt: timestamp() })
      else throw Error('Installation notification claim changed')
    })
    return { status: 'sent' }
  } catch {
    await db
      .runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data()
        if (current?.state === 'sending')
          tx.update(ref, { state: 'uncertain', updatedAt: timestamp() })
      })
      .catch(() => {})
    return { status: 'review' }
  }
}
