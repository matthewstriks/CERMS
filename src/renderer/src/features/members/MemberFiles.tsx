import { useEffect, useMemo, useRef, useState } from 'react'
import { createMemberFiles } from '../../../../data/firebase-member-files'
import { hasStaffPermission } from '../../../../domain/staff-permissions'
import type { Member } from '../../../../domain/legacy'
import type { MembershipReader } from '../../../../data/membership-contracts'
import { isMemberFileUrl } from '../../../../shared/firebase-policy'
import { maxMemberFileBytes, type MemberAttachment } from '../../../../shared/member-files-policy'
import './MemberFiles.css'
export default function MemberFiles({
  member,
  reader,
}: {
  member: Member
  reader: MembershipReader | null
}) {
  const client = useMemo(
      () => (reader ? createMemberFiles(reader, member.id) : null),
      [reader, member.id],
    ),
    input = useRef<HTMLInputElement>(null),
    pending = useRef(false),
    alive = useRef(true)
  const [rows, setRows] = useState<MemberAttachment[]>([]),
    [more, setMore] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [uploads, setUploads] = useState<{ id: string; file: File }[]>([])
  const canUpload = !!reader && hasStaffPermission(reader.uid, 'editMembers', reader.permissions)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function load(reset = true, clearError = true) {
    if (!client) return
    setLoading(true)
    if (clearError) setError('')
    try {
      const page = await client.list(reset ? undefined : (cursor ?? undefined))
      if (alive.current) {
        setRows((v) =>
          reset ? page.rows : [...v, ...page.rows.filter((r) => !v.some((o) => o.id === r.id))],
        )
        setMore(page.more)
        setCursor(page.cursor)
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Files could not load.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [client])
  async function upload(queue: { id: string; file: File }[]) {
    if (!client || pending.current || !queue.length) return
    pending.current = true
    setBusy(true)
    setError('')
    let remaining = queue
    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]!
        if (alive.current) setNotice(`Uploading ${i + 1} of ${queue.length}: ${item.file.name}`)
        await client.upload(item.file, item.id)
        remaining = queue.slice(i + 1)
        if (alive.current) setUploads(remaining)
      }
      if (alive.current) setNotice('Files uploaded.')
    } catch (e) {
      if (alive.current) {
        setUploads(remaining)
        setNotice('')
        setError(e instanceof Error ? e.message : 'Upload was not confirmed. Retry the same files.')
      }
    } finally {
      pending.current = false
      if (alive.current) {
        setBusy(false)
        if (input.current) input.current.value = ''
        await load(true, false)
      }
    }
  }
  async function open(file: MemberAttachment, download: boolean) {
    if (!client || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await window.desktop.openMemberFile(await client.url(file.id, download))
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'This file could not be opened.')
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <section className="profile-files" aria-labelledby="member-files-title">
      <h3 id="member-files-title">Files & signed waiver</h3>
      <div className="button-row">
        {canUpload && (
          <label className="member-file-picker">
            Upload files
            <input
              ref={input}
              aria-label="Upload member files"
              type="file"
              multiple
              disabled={busy || uploads.length > 0}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.some((f) => !f.size || f.size > maxMemberFileBytes)) {
                  setError('Each file must be non-empty and no larger than 20 MB.')
                  e.target.value = ''
                  return
                }
                const queue = files.map((file) => ({ id: crypto.randomUUID(), file }))
                setUploads(queue)
                void upload(queue)
              }}
            />
          </label>
        )}
        {client && (
          <button disabled={loading || busy} onClick={() => void load()}>
            Refresh files
          </button>
        )}
      </div>
      {canUpload && (
        <p className="muted">Images, PDFs and other documents · Up to 20 MB per file.</p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {uploads.length > 0 && !busy && (
        <button onClick={() => void upload(uploads)}>
          Retry {uploads.length} pending upload{uploads.length === 1 ? '' : 's'}
        </button>
      )}
      {loading && <p role="status">Loading files…</p>}
      <ul className="member-files">
        {rows.map((file) => (
          <li key={file.id}>
            <div>
              <strong>{file.name}</strong>
              <small>
                {(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB ·{' '}
                {file.uploadedBy}
                {file.createdAt !== null ? ` · ${new Date(file.createdAt).toLocaleString()}` : ''}
              </small>
            </div>
            <div className="button-row">
              {file.viewable && (
                <button
                  disabled={busy}
                  onClick={() => void open(file, false)}
                  aria-label={`View ${file.name}`}
                >
                  View
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => void open(file, true)}
                aria-label={`Download ${file.name}`}
              >
                Download
              </button>
            </div>
          </li>
        ))}
        {member.files.map((file, index) => (
          <li key={`legacy-${index}`}>
            <div>
              <strong>{file.name}</strong>
              <small>Existing attachment</small>
            </div>
            <button
              disabled={busy || !isMemberFileUrl(file.url)}
              title="Open existing attachment in your browser"
              onClick={() => {
                void window.desktop
                  .openMemberFile(file.url)
                  .catch(() => setError('This existing attachment could not be opened.'))
              }}
            >
              View
            </button>
          </li>
        ))}
      </ul>
      {!loading && !rows.length && !member.files.length && (
        <p className="muted">No files attached.</p>
      )}
      {more && (
        <button disabled={loading || busy} onClick={() => void load(false)}>
          Load older files
        </button>
      )}
    </section>
  )
}
