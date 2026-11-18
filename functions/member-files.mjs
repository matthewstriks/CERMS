import { createHash } from 'node:crypto'
import { validMemberFilesData, memberFilesBucket } from './member-files-domain.mjs'
const owner = 'c7D7AH07kgXmjn8tSiOgzHscLZ12'
const hash = (v) => createHash('sha256').update(v).digest('hex')
export function memberFileName(name) {
  let output = name
    .replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
  if (!output) output = 'attachment'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(output)) output = 'file-' + output
  return output.slice(0, 180)
}
export function memberFileType(bytes) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return 'image/gif'
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp'
  return 'application/octet-stream'
}
const view = (s) => {
  const d = s.data()
  return {
    id: s.id,
    name: d.name,
    size: d.size,
    contentType: d.contentType,
    viewable: d.contentType !== 'application/octet-stream',
    uploadedBy: d.uploaderName || d.uploaderUid,
    createdAt: d.createdAt?.toMillis?.() ?? null,
  }
}
export async function memberFiles(
  request,
  { db, bucket, fail, timestamp, now = () => Date.now() },
) {
  const d = request.data,
    uid = request.auth?.uid
  if (!uid) fail('unauthenticated', 'Sign in to view member files.')
  if (!validMemberFilesData(d)) fail('invalid-argument', 'Choose a non-empty file up to 20 MB.')
  if (bucket.name !== memberFilesBucket)
    fail('failed-precondition', 'Member files require their isolated private bucket.')
  const collection = `system/${d.business}/memberFiles/${d.memberId}/files`
  async function authorize(tx) {
    const [profile, system, member, permissions] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`system/${d.business}`)),
      tx.get(db.doc(`members/${d.memberId}`)),
      d.action === 'upload' ? tx.get(db.doc(`system/${d.business}/staffPermissions/${uid}`)) : null,
    ])
    if (
      !profile.exists ||
      profile.data().uid !== uid ||
      profile.data().access !== d.business ||
      !system.exists ||
      !member.exists ||
      member.data().access !== d.business
    )
      fail('permission-denied', 'This member is unavailable in your business.')
    if (
      d.action === 'upload' &&
      uid !== owner &&
      permissions?.data()?.permissions?.editMembers !== true
    )
      fail('permission-denied', 'Edit member records permission is required to upload files.')
    return profile.data()
  }
  if (d.action === 'list') {
    await db.runTransaction(authorize)
    let query = db
      .collection(collection)
      .orderBy('createdAt', 'desc')
      .orderBy('__name__', 'desc')
      .limit(51)
    if (d.cursor) {
      const cursor = await db.doc(`${collection}/${d.cursor}`).get()
      if (!cursor.exists) fail('failed-precondition', 'Reload member files.')
      query = query.startAfter(cursor)
    }
    const result = await query.get()
    await db.runTransaction(authorize)
    const docs = result.docs.slice(0, 50)
    return {
      rows: docs.filter((s) => s.data().state === 'ready').map(view),
      more: result.docs.length > 50,
      cursor: docs.at(-1)?.id ?? null,
    }
  }
  const ref = db.doc(`${collection}/${d.fileId}`)
  if (d.action === 'url') {
    const record = await db.runTransaction(async (tx) => {
      await authorize(tx)
      const s = await tx.get(ref)
      if (!s.exists || s.data().state !== 'ready')
        fail('not-found', 'This attachment is unavailable.')
      return s.data()
    })
    const expected = `cerms5/members/${d.business}/${d.memberId}/${d.fileId}/${record.sha256}`
    if (record.objectPath !== expected || !/^[a-f0-9]{64}$/.test(record.sha256))
      fail('failed-precondition', 'Attachment metadata needs review.')
    const file = bucket.file(expected),
      [metadata] = await file.getMetadata()
    if (
      Number(metadata.size) !== record.size ||
      metadata.metadata?.sha256 !== record.sha256 ||
      metadata.contentType !== record.contentType
    )
      fail('failed-precondition', 'The stored attachment could not be verified.')
    const name = memberFileName(record.name),
      ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_'),
      disposition = `${d.download || record.contentType === 'application/octet-stream' ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`
    await db.runTransaction(authorize)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: now() + 300000,
      responseDisposition: disposition,
      responseType: record.contentType,
    })
    return { url }
  }
  // Reserve the immutable request before storing bytes; every retry uses the same object/name/hash.
  const bytes = Buffer.from(d.base64, 'base64')
  if (bytes.length !== d.size || bytes.toString('base64') !== d.base64)
    fail('invalid-argument', 'The selected file could not be verified.')
  const sha256 = hash(bytes),
    name = memberFileName(d.name),
    contentType = memberFileType(bytes),
    objectPath = `cerms5/members/${d.business}/${d.memberId}/${d.fileId}/${sha256}`,
    fingerprint = hash(JSON.stringify({ uid, name, size: d.size, sha256 }))
  const ready = await db.runTransaction(async (tx) => {
    const profile = await authorize(tx),
      s = await tx.get(ref)
    if (s.exists) {
      if (s.data().fingerprint !== fingerprint)
        fail('already-exists', 'This upload request already belongs to a different file.')
      return s.data().state === 'ready'
    }
    tx.create(ref, {
      state: 'uploading',
      fingerprint,
      sha256,
      name,
      size: d.size,
      contentType,
      objectPath,
      uploaderUid: uid,
      uploaderName: profile.displayName || uid,
      createdAt: timestamp(),
    })
    return false
  })
  if (!ready) {
    try {
      await bucket
        .file(objectPath)
        .save(bytes, {
          resumable: false,
          contentType,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            cacheControl: 'private, no-store',
            contentDisposition: 'attachment',
            metadata: { sha256 },
          },
        })
    } catch (e) {
      if (Number(e.code) !== 412) throw e
    }
    const [metadata] = await bucket.file(objectPath).getMetadata()
    if (
      Number(metadata.size) !== d.size ||
      metadata.metadata?.sha256 !== sha256 ||
      metadata.contentType !== contentType
    )
      fail('failed-precondition', 'The stored upload could not be verified.')
    await db.runTransaction(async (tx) => {
      await authorize(tx)
      const s = await tx.get(ref)
      if (!s.exists || s.data().fingerprint !== fingerprint)
        fail('failed-precondition', 'Upload metadata changed.')
      if (s.data().state !== 'ready') tx.update(ref, { state: 'ready', completedAt: timestamp() })
    })
  }
  return { fileId: d.fileId }
}
