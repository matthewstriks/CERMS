const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

export function downloadDisposition(name) {
  const filename = name.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim() || 'attachment'
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export function supportEmail(metadata, artifacts, requestId, submittedAt, issue) {
  const login = metadata.origin === 'login'
  const origin = login ? 'Login support · not signed in' : 'Signed-in staff report'
  const priority = metadata.priority[0].toUpperCase() + metadata.priority.slice(1)
  const colors = { low: '#496778', normal: '#2e664d', high: '#995b10', urgent: '#a33131' }
  const details = [
    ['From', metadata.email],
    ['Source', origin],
    ...(!login
      ? [
          ['Business', metadata.business],
          ['Staff UID', metadata.uid],
        ]
      : []),
    ['Submitted', new Date(submittedAt).toUTCString()],
    ['App', `CERMS ${metadata.version} · ${metadata.platform} · Electron ${metadata.electron}`],
    ['Report ID', requestId],
    ...(issue ? [['GitHub issue', issue.url]] : []),
  ]
  const diagnostics = metadata.logs.join('\n') || 'No renderer errors recorded.'
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:7px 12px 7px 0;color:#607267;font-size:12px;vertical-align:top;white-space:nowrap">${escape(label)}</th><td style="padding:7px 0;font-size:13px;overflow-wrap:anywhere">${escape(value)}</td></tr>`,
    )
    .join('')
  const files = artifacts.length
    ? artifacts
        .map(
          (a) =>
            `<tr><td style="padding:13px 0;border-bottom:1px solid #e1e9e3"><a href="${escape(a.url)}" style="color:#286348;font-weight:600;text-decoration:underline">Download ${escape(a.name)}</a><div style="font-size:12px;color:#607267;margin-top:5px">${escape(a.contentType)} · ${(a.size / 1024).toFixed(1)} KB</div></td></tr>`,
        )
        .join('')
    : '<tr><td style="padding:10px 0;color:#607267">No attachments.</td></tr>'
  return {
    text: `${metadata.subject}\nPriority: ${priority}\n${origin}\n${login ? 'Reply email is user-provided and unverified.\n' : ''}\n${metadata.message}\n\n${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nAttachments (download links expire in seven days):\n${artifacts.map((a) => `${a.name}: ${a.url}`).join('\n') || 'None'}\n\nDiagnostics:\n${diagnostics}`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f2;color:#20392c;font-family:Arial,sans-serif"><table role="presentation" align="center" width="100%" style="max-width:680px;border-collapse:collapse;background:#fff;border:1px solid #dce7df;border-radius:12px"><tr><td style="padding:26px 30px;background:#285b43;color:#fff"><div style="font-size:12px;letter-spacing:2px">CERMS 5 SUPPORT</div><h1 style="font-size:25px;line-height:1.3;margin:12px 0 8px">${escape(metadata.subject)}</h1><div style="font-size:13px">${escape(origin)}</div></td></tr><tr><td style="padding:26px 30px"><span style="display:inline-block;padding:6px 12px;background:#eef4ef;border-radius:20px;font-size:12px;color:${colors[metadata.priority]}"><strong>${priority} priority</strong></span>${login ? '<p style="padding:12px;background:#fff4da;border-radius:6px;font-size:12px;color:#78591a">Submitted before sign-in. The reply email is user-provided and has not been verified.</p>' : ''}${issue ? `<p style="margin:22px 0"><a href="${escape(issue.url)}" style="display:inline-block;padding:12px 18px;background:#285b43;color:#fff;text-decoration:none;border-radius:7px;font-weight:600">View GitHub issue #${issue.number}</a></p>` : ''}<h2 style="font-size:16px;margin:24px 0 10px">What happened</h2><div style="font-size:14px;line-height:1.7;overflow-wrap:anywhere">${escape(metadata.message).replace(/\n/g, '<br>')}</div><h2 style="font-size:16px;margin:26px 0 8px">Report details</h2><table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table><h2 style="font-size:16px;margin:26px 0 4px">Attachments</h2><p style="font-size:12px;color:#607267">Download the original files below. Links expire after seven days.</p><table role="presentation" width="100%" style="border-collapse:collapse">${files}</table><h2 style="font-size:16px;margin:26px 0 8px">Diagnostics</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere;padding:15px;background:#f4f7f4;border:1px solid #e1e9e3;border-radius:6px;font-size:11px;line-height:1.6;color:#4e6255">${escape(diagnostics)}</pre></td></tr><tr><td style="padding:18px 30px;background:#f6f8f6;color:#607267;font-size:12px">Reply to this email to contact the reporter.</td></tr></table></body></html>`,
  }
}
