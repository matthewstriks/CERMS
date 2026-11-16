import { useEffect, useMemo, useRef, useState } from 'react'
import { useMembershipSession } from '../lib/membership-session'
import {
  createStaffManager,
  type StaffAccount,
  type StaffAccountDraft,
} from '../../../data/firebase-staff'
import {
  ownerUid,
  permissionDefinitions,
  defaultStaffPermissions,
  effectivePermissions,
  type StaffPermissions,
} from '../../../domain/staff-permissions'
import './staff/Staff.css'
function PermissionFields({
  value,
  disabled,
  onChange,
}: {
  value: StaffPermissions
  disabled?: boolean
  onChange?: (p: StaffPermissions) => void
}) {
  return (
    <div className="staff-permissions">
      {permissionDefinitions.map(({ key, label, description }) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={value[key]}
            disabled={disabled}
            onChange={(e) => onChange?.({ ...value, [key]: e.target.checked })}
          />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
    </div>
  )
}
function StaffDialog({
  account,
  client,
  onClose,
  onSaved,
}: {
  account: StaffAccount | null
  client: ReturnType<typeof createStaffManager>
  onClose: () => void
  onSaved: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null),
    pending = useRef(false),
    requestId = useRef(crypto.randomUUID())
  const [draft, setDraft] = useState<StaffAccountDraft>({
    displayName: '',
    email: '',
    password: '',
    permissions: { ...defaultStaffPermissions },
  })
  const [time, setTime] = useState<string | undefined>(),
    [loading, setLoading] = useState(!!account),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [submitted, setSubmitted] = useState(false)
  const owner = account?.uid === ownerUid
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    return () => node?.close()
  }, [])
  useEffect(() => {
    if (!account) return
    let active = true
    void client
      .permissions(account.uid)
      .then((p) => {
        if (active) {
          setDraft((d) => ({ ...d, permissions: p.permissions }))
          setTime(p.updateTime)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [account, client])
  const frozen = busy || (!account && submitted)
  return (
    <dialog
      ref={ref}
      className="member-dialog staff-dialog"
      aria-label={account ? 'Staff permissions' : 'Create staff account'}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{account ? 'Staff permissions' : 'Create staff account'}</h2>
      {account && (
        <p>
          {account.name} · {account.email}
        </p>
      )}
      {loading ? (
        <p role="status">Loading permissions…</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (pending.current || owner) return
            pending.current = true
            setBusy(true)
            setError('')
            try {
              if (account) await client.savePermissions(account.uid, draft.permissions, time)
              else {
                setSubmitted(true)
                await client.create(draft, requestId.current)
              }
              onSaved()
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : 'Unable to save staff account.')
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          {!account && (
            <div className="staff-fields">
              <label>
                Full name
                <input
                  required
                  maxLength={200}
                  autoComplete="off"
                  disabled={frozen}
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  maxLength={320}
                  autoComplete="off"
                  disabled={frozen}
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </label>
              <label>
                Initial password
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={frozen}
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                />
                <small>At least 12 characters. Share it directly with the staff member.</small>
              </label>
            </div>
          )}
          {owner && (
            <p className="notice">Owner — all permissions. Owner access cannot be removed.</p>
          )}
          <PermissionFields
            value={draft.permissions}
            disabled={frozen || owner || !!(account && error && !time)}
            onChange={(p) => setDraft({ ...draft, permissions: p })}
          />
          <p className="muted">
            All staff can view members, visits, orders and registers in their assigned business.
            Creating staff accounts and changing permissions are owner-only.
          </p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {!account && submitted && error && (
            <p>
              Retry uses the same account request to avoid duplicate logins. Keep the initial
              password until setup is confirmed.
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              {owner ? 'Close' : 'Cancel'}
            </button>
            {!owner && (
              <button
                type="submit"
                className="primary"
                disabled={busy || (!!account && !!error && !time)}
              >
                {busy
                  ? 'Saving…'
                  : account
                    ? 'Save permissions'
                    : submitted
                      ? 'Retry account setup'
                      : 'Create staff account'}
              </button>
            )}
          </div>
        </form>
      )}
      {loading && <button onClick={onClose}>Cancel</button>}
    </dialog>
  )
}
export default function Staff() {
  const { reader } = useMembershipSession()
  const client = useMemo(() => (reader ? createStaffManager(reader) : null), [reader])
  const [rows, setRows] = useState<StaffAccount[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [more, setMore] = useState(false),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<{ account: StaffAccount | null } | null>(null)
  const owner = reader?.uid === ownerUid
  useEffect(() => {
    if (!client || !owner) return
    let active = true
    setBusy(true)
    setError('')
    void client
      .list()
      .then((p) => {
        if (active) {
          setRows(p.rows)
          setMore(p.more)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [client, owner, revision])
  if (!reader || !client) return null
  if (!owner)
    return (
      <section className="panel settings-card">
        <h2>Your permissions</h2>
        <p>
          {reader.staffName} · {reader.club}
        </p>
        <PermissionFields value={effectivePermissions(reader.uid, reader.permissions)} disabled />
        <p>Contact the owner to change your permissions. Staff administration is owner-only.</p>
      </section>
    )
  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={() => setEditing({ account: null })}>
          Create staff account
        </button>
        <button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          Refresh users
        </button>
      </div>
      <p>Staff accounts for {reader.club}. Your owner account has full access in every business.</p>
      {notice && (
        <p role="status" data-notification-sound>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading staff accounts…</p>}
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Access</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => (
              <tr key={account.uid}>
                <td>{account.name}</td>
                <td>{account.email || 'Not recorded'}</td>
                <td>{account.uid === ownerUid ? 'Owner · Full access' : 'Staff'}</td>
                <td>
                  <button
                    aria-label={`View permissions for ${account.name}`}
                    onClick={() => setEditing({ account })}
                  >
                    View permissions
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && !error && !rows.length && (
          <p className="empty">No staff accounts in this business.</p>
        )}
      </div>
      {more && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const p = await client.list(false)
              setRows((r) => [...r, ...p.rows.filter((n) => !r.some((o) => o.uid === n.uid))])
              setMore(p.more)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unable to load staff.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Load more users
        </button>
      )}
      {editing && (
        <StaffDialog
          account={editing.account}
          client={client}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice(
              editing.account
                ? 'Permissions saved. Staff should reopen the app to refresh their controls.'
                : 'Staff login account created.',
            )
            setEditing(null)
            setRevision((v) => v + 1)
          }}
        />
      )}
    </>
  )
}
