import { useEffect, useMemo, useRef, useState } from 'react'
import type { Member } from '../../../../domain/legacy'
import type { MembershipReader } from '../../../../data/membership-contracts'
import type { MemberEditDraft } from '../../../../domain/member-edit'
import { idTypes, suffixes, type MembershipOption } from '../../../../domain/member-creation'
import {
  createMemberManagement,
  type EditableMember,
} from '../../../../data/firebase-member-management'
import './MemberManagement.css'

const localDateTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return ''
  const d = new Date(seconds * 1000)
  if (!Number.isFinite(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}
export default function ManageMemberDialog({
  member,
  mode,
  reader,
  onClose,
  onSaved,
}: {
  member: Member
  mode: 'edit' | 'delete'
  reader: MembershipReader
  onClose(): void
  onSaved(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false)
  const client = useMemo(() => createMemberManagement(reader), [reader])
  const [original, setOriginal] = useState<EditableMember | null>(null)
  const [draft, setDraft] = useState<MemberEditDraft | null>(null)
  const [options, setOptions] = useState<MembershipOption[]>([])
  const [optionError, setOptionError] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  useEffect(() => {
    let active = true
    setOriginal(null)
    setDraft(null)
    setError('')
    setOptionError('')
    void client
      .load(member.id)
      .then((value) => {
        if (active) {
          setOriginal(value)
          setDraft(value.draft)
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message)
      })
    if (mode === 'edit')
      void client
        .options()
        .then((values) => {
          if (active) setOptions(values)
        })
        .catch(() => {
          if (active)
            setOptionError(
              'Product choices could not be loaded. You can keep the current membership type or reopen to retry.',
            )
        })
    return () => {
      active = false
    }
  }, [client, member.id, mode, revision])
  const title = mode === 'edit' ? 'Edit member' : 'Delete member'
  const change = <K extends keyof MemberEditDraft>(key: K, value: MemberEditDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  const input = (
    key: 'firstName' | 'middleName' | 'lastName' | 'birthDate' | 'governmentId' | 'email' | 'phone',
    label: string,
    type = 'text',
    required = false,
  ) => (
    <label>
      {label}
      <input
        type={type}
        required={required}
        maxLength={key === 'email' ? 320 : 200}
        value={draft?.[key] ?? ''}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  )
  return (
    <dialog
      ref={dialog}
      className="member-dialog member-manage-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending.current) onClose()
      }}
    >
      <h2>{title}</h2>
      <p>
        {member.name} · #{member.number}
      </p>
      {!original && !error && <p role="status">Loading current member record…</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!original && error && (
        <button onClick={() => setRevision((n) => n + 1)}>Retry loading</button>
      )}
      {original && draft && (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending.current) return
            pending.current = true
            setBusy(true)
            setError('')
            try {
              if (mode === 'delete') await client.remove(original)
              else await client.save(original, draft)
              onSaved()
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : 'Unable to save this change.')
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy}>
            {mode === 'delete' ? (
              <>
                <p>
                  Permanently delete <strong>{member.name}</strong> and their membership record?
                </p>
                <p>
                  Visits, orders, activity logs and stored files will remain. For Dev-created
                  members, the membership number stays reserved. This cannot be undone.
                </p>
              </>
            ) : (
              <>
                <div className="member-edit-grid">
                  {input('firstName', 'First name', 'text', true)}
                  {input('middleName', 'Middle name')}
                  {input('lastName', 'Last name', 'text', true)}
                  <label>
                    Suffix
                    <select
                      aria-label="Suffix"
                      value={draft.suffix}
                      onChange={(e) => change('suffix', e.target.value)}
                    >
                      {suffixes.map((value) => (
                        <option key={value} value={value}>
                          {value || 'None'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {input('birthDate', 'Date of birth', 'date', true)}
                  {input('email', 'Email', 'email')}
                  {input('phone', 'Phone number', 'tel')}
                  <label>
                    ID state or type
                    <select
                      required
                      aria-label="ID state or type"
                      value={draft.governmentIdType}
                      onChange={(e) => change('governmentIdType', e.target.value)}
                    >
                      <option value="">Select state or type</option>
                      {idTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {input('governmentId', 'ID number', 'text', true)}
                  <label>
                    Membership type
                    <select
                      aria-label="Membership type"
                      value={draft.productId}
                      onChange={(e) => change('productId', e.target.value)}
                    >
                      <option value="">
                        Keep current: {original.membershipName || 'Not recorded'}
                      </option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Membership expires
                    <input
                      required
                      type="datetime-local"
                      step={1}
                      value={localDateTime(draft.expiresAt)}
                      onChange={(e) =>
                        change('expiresAt', Math.floor(new Date(e.target.value).getTime() / 1000))
                      }
                    />
                  </label>
                </div>
                {optionError && <p role="status">{optionError}</p>}
                <p className="muted">
                  Changing the membership type does not automatically renew it or collect payment.
                  Set the expiration explicitly if needed.
                </p>
                <div className="member-edit-flags">
                  <p>DNA status is managed in member notes, where a reason is required.</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.tagged}
                      onChange={(e) => change('tagged', e.target.checked)}
                    />
                    Read notes / tagged
                  </label>
                </div>
              </>
            )}
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={mode === 'delete' ? 'danger' : 'primary'}>
                {busy
                  ? 'Saving…'
                  : mode === 'delete'
                    ? 'Delete permanently'
                    : 'Save member changes'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {!original && (
        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      )}
    </dialog>
  )
}
