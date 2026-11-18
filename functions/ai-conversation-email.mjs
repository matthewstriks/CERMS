import { createHash } from 'node:crypto'
import { validAiConversation, redactSupportSecrets } from './ai-conversation-domain.mjs'
const recipient = 'matthew@rocmtssolutions.com'
const hash = (v) => createHash('sha256').update(v).digest('hex')
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
export async function emailAiSupportConversation(
  request,
  { db, send, timestamp, fail, now = () => Date.now() },
) {
  if (!validAiConversation(request.data)) fail('invalid-argument', 'Invalid AI conversation.')
  const d = request.data,
    ip = request.rawRequest?.ip
  if (typeof ip !== 'string' || !ip || ip.length > 200)
    fail('invalid-argument', 'Client context is unavailable.')
  const turns = d.turns.map((t) => ({ ...t, text: redactSupportSecrets(t.text) }))
  const canonical = { ...d, turns }
  const fingerprint = hash(JSON.stringify(canonical))
  const ref = db.doc(`aiSupportConversationEmails/${d.id}`)
  const limits = [
    [db.doc('aiSupportConversationEmailLimits/ip-' + hash(ip)), 10],
    [db.doc('aiSupportConversationEmailLimits/global'), 100],
  ]
  const claim = await db.runTransaction(async (tx) => {
    const [prior, ...saved] = await Promise.all([tx.get(ref), ...limits.map(([r]) => tx.get(r))])
    const p = prior.data()
    if (p) {
      if (p.fingerprint !== fingerprint)
        fail('already-exists', 'Conversation was already finished with different content.')
      return { status: p.state === 'sent' ? 'sent' : 'review' }
    }
    saved.forEach((s, i) => {
      const l = s.data()
      if (l?.windowStart > now() - 3600000 && l.count >= limits[i][1])
        fail('resource-exhausted', 'Conversation email is queued for later. Please retry later.')
    })
    saved.forEach((s, i) => {
      const l = s.data(),
        current = l?.windowStart > now() - 3600000
      tx.set(limits[i][0], {
        windowStart: current ? l.windowStart : now(),
        count: current ? l.count + 1 : 1,
      })
    })
    // Audit metadata only: full transcript is sent by email, not retained in Firestore.
    tx.set(ref, {
      fingerprint,
      state: 'sending',
      turnCount: turns.length,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    })
    return { status: 'send' }
  })
  if (claim.status !== 'send') return claim
  const details = [
    ['Conversation ID', d.id],
    [
      'User (recorded at chat start)',
      d.user
        ? d.user.name
        : d.user === null
          ? 'Signed out · login-page assistant'
          : 'Not recorded · older conversation',
    ],
    ...(d.user
      ? [
          ['Staff email (client reported)', d.user.email],
          ['Staff UID (client reported)', d.user.uid],
          ['Business (client reported)', d.user.business],
        ]
      : []),
    ['CERMS', d.version],
    ['Model', d.model],
    ['Device (client reported)', d.device],
    ['Platform', d.platform],
    ['Started (client time)', new Date(d.startedAt).toUTCString()],
    ['Finished (client time)', new Date(d.finishedAt).toUTCString()],
    ['Finished by', d.reason],
  ]
  const conversation = turns
    .map(
      (t) =>
        `${t.role === 'user' ? 'USER' : 'AI'}\n${t.text}${t.sources?.length ? '\nHelp articles: ' + t.sources.map((s) => s.title).join('; ') : ''}`,
    )
    .join('\n\n────────────────────\n\n')
  const text = `CERMS Assistant quality assurance\n\n${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nFull conversation\n\n${conversation}\n\nAssistant suggestions are unverified. User identity is the client-reported snapshot from chat start, retained for offline delivery; it is not independently authenticated by this email. This email is independent of bug report submission.`
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f2;font-family:Arial,sans-serif;color:#20392c"><div style="max-width:720px;margin:auto;background:#fff;border:1px solid #dce7df"><div style="padding:24px;background:#285b43;color:white"><h1 style="font-size:24px;margin:0">CERMS Assistant conversation</h1><p style="margin-bottom:0">CERMS ${escape(d.version)} · ${escape(d.reason)}</p></div><div style="padding:24px"><table>${details.map(([k, v]) => `<tr><th align="left" style="padding:6px 18px 6px 0;vertical-align:top">${escape(k)}</th><td style="overflow-wrap:anywhere">${escape(v)}</td></tr>`).join('')}</table><h2 style="font-size:18px;margin-top:24px">Full conversation</h2>${turns.map((t) => `<div style="padding:16px;margin:14px 0;background:${t.role === 'user' ? '#edf1f8' : '#f0f6f1'};border-radius:8px"><strong>${t.role === 'user' ? 'User' : 'CERMS Assistant'}</strong><div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin-top:8px">${escape(t.text)}</div>${t.sources?.length ? `<p style="font-size:12px">Help articles: ${t.sources.map((s) => escape(s.title)).join('; ')}</p>` : ''}</div>`).join('')}<p style="font-size:12px;color:#607267">Assistant suggestions are unverified. User identity is a client-reported snapshot from chat start, retained for offline delivery; it is not independently authenticated by this email. This email is independent of bug report submission.</p></div></div></body></html>`
  try {
    const result = await send({
      from: { name: 'CERMS Assistant', address: 'system@rocmtssolutions.com' },
      to: [recipient],
      replyTo: 'support@rocmtssolutions.com',
      subject: `CERMS Assistant · ${d.user?.name ?? (d.user === null ? 'Signed out' : 'User not recorded')} · ${d.id}`,
      messageId: `<cerms5-ai-${d.id}@rocmtssolutions.com>`,
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
      if (current?.state !== 'sending') throw Error('Email claim changed')
      tx.update(ref, { state: 'sent', sentAt: timestamp(), updatedAt: timestamp() })
    })
    return { status: 'sent' }
  } catch {
    await db
      .runTransaction(async (tx) => {
        const p = (await tx.get(ref)).data()
        if (p?.state === 'sending') tx.update(ref, { state: 'uncertain', updatedAt: timestamp() })
      })
      .catch(() => {})
    return { status: 'review' }
  }
}
