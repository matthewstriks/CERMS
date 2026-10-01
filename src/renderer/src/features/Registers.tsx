import RegisterLedger from './pos/RegisterLedger'
import './pos/Pos.css'
import { hasStaffPermission } from '../../../domain/staff-permissions'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMembershipSession } from '../lib/membership-session'
import { createRegisters, registerError } from '../../../data/firebase-registers'
import type { RegisterRecord } from '../../../domain/registers'
import { money } from '../lib/data'
import RegisterCountDialog from './registers/RegisterCountDialog'
import './registers/Registers.css'

export default function Registers() {
  const { reader } = useMembershipSession()
  const client = useMemo(() => (reader ? createRegisters(reader) : null), [reader])
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [rows, setRows] = useState<RegisterRecord[]>([])
  const [own, setOwn] = useState<RegisterRecord | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<{
    mode: 'open' | 'close' | 'view'
    record?: RegisterRecord
  } | null>(null)
  const mounted = useRef(true),
    loadingMore = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!client) return
    let active = true
    setBusy(true)
    setLoaded(false)
    setError('')
    setRows([])
    setOwn(null)
    setMore(false)
    void Promise.all([client.list(status), client.own()])
      .then(([page, current]) => {
        if (!active) return
        setRows(page.rows)
        setMore(page.more)
        setOwn(current)
        setLoaded(true)
      })
      .catch((failure) => {
        if (active) setError(registerError(failure))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [client, status, revision])
  if (!reader || !client) return null
  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Register lists">
          <button
            disabled={busy || !!editor}
            className={status === 'open' ? 'selected' : ''}
            onClick={() => setStatus('open')}
          >
            Open registers
          </button>
          <button
            disabled={busy || !!editor}
            className={status === 'closed' ? 'selected' : ''}
            onClick={() => setStatus('closed')}
          >
            Closed registers
          </button>
        </div>
        <button disabled={busy || !!editor} onClick={() => setRevision((value) => value + 1)}>
          Refresh registers
        </button>
        <button
          className="primary"
          disabled={
            !loaded ||
            busy ||
            !!own ||
            !!editor ||
            !hasStaffPermission(reader.uid, 'openRegisters', reader.permissions)
          }
          onClick={() => setEditor({ mode: 'open' })}
        >
          Open register
        </button>
      </div>
      <p className="page-note">
        Registers for {reader.club}. Each staff member can open one register. Authorized staff can
        also close other staff’s registers. Refresh to see other staff changes.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading registers…</p>}
      {own && (
        <section className="panel register-own">
          <div>
            <h2>Your open register</h2>
            <p>
              Opened {new Date(own.openedAt).toLocaleString()} · Opening cash{' '}
              {money(own.openingTotalCents / 100)}
            </p>
            <RegisterLedger record={own} key={revision} />
          </div>
          <button
            className="primary"
            onClick={() => setEditor({ mode: 'close', record: own })}
            disabled={
              busy ||
              !!editor ||
              !hasStaffPermission(reader.uid, 'closeRegisters', reader.permissions)
            }
          >
            Close my register
          </button>
        </section>
      )}
      {loaded && (
        <section className="panel">
          <h2>{status === 'open' ? 'Open registers' : 'Closed registers'}</h2>
          {!rows.length ? (
            <p className="empty">No {status} registers in this business.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Opened</th>
                    <th>Opening cash</th>
                    {status === 'closed' && (
                      <>
                        <th>Closed</th>
                        <th>Ending cash</th>
                        <th>Cash change</th>
                      </>
                    )}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.ownerName || row.ownerUid}
                        {row.ownerUid === reader.uid && <small> · You</small>}
                      </td>
                      <td>{new Date(row.openedAt).toLocaleString()}</td>
                      <td>{money(row.openingTotalCents / 100)}</td>
                      {status === 'closed' && (
                        <>
                          <td>
                            {row.closedAt === null ? '—' : new Date(row.closedAt).toLocaleString()}
                            <small>
                              {' '}
                              · Closed by {row.closedByName || row.closedByUid || 'Not recorded'}
                            </small>
                          </td>
                          <td>{money((row.closingTotalCents ?? 0) / 100)}</td>
                          <td>
                            {money(((row.closingTotalCents ?? 0) - row.openingTotalCents) / 100)}
                          </td>
                        </>
                      )}
                      <td>
                        <button
                          disabled={!!editor}
                          aria-label={`View counts for ${row.ownerName || row.ownerUid}`}
                          onClick={() => setEditor({ mode: 'view', record: row })}
                        >
                          View counts
                        </button>
                        {row.status === 'open' &&
                          hasStaffPermission(
                            reader.uid,
                            row.ownerUid === reader.uid ? 'closeRegisters' : 'closeOtherRegisters',
                            reader.permissions,
                          ) && (
                            <button
                              disabled={busy || !!editor}
                              aria-label={`Close register for ${row.ownerName || row.ownerUid}`}
                              onClick={() => setEditor({ mode: 'close', record: row })}
                            >
                              Close register
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {more && (
            <button
              disabled={busy || !!editor}
              onClick={async () => {
                if (loadingMore.current) return
                loadingMore.current = true
                setBusy(true)
                setError('')
                try {
                  const page = await client.list(status, false)
                  if (mounted.current) {
                    setRows((prior) => [
                      ...prior,
                      ...page.rows.filter((row) => !prior.some((item) => item.id === row.id)),
                    ])
                    setMore(page.more)
                  }
                } catch (failure) {
                  if (mounted.current) setError(registerError(failure))
                } finally {
                  loadingMore.current = false
                  if (mounted.current) setBusy(false)
                }
              }}
            >
              Load more {status} registers
            </button>
          )}
        </section>
      )}
      <p className="page-note">
        POS cash payments, change and payouts update expected cash. View counts to review card and
        other payment totals and closing over/short.
      </p>
      {editor && (
        <RegisterCountDialog
          {...editor}
          client={client}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setNotice(
              editor.mode === 'open'
                ? 'Register opened. Your opening count is saved.'
                : 'Register closed. Your ending count is saved in Closed registers.',
            )
            setEditor(null)
            setRevision((value) => value + 1)
          }}
        />
      )}
    </>
  )
}
