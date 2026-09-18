import { useEffect, useRef, useState } from 'react'
import './CreateMemberForm.css'
import {
  ageOn,
  emptyMemberDraft,
  idTypes,
  parseMemberScan,
  suffixes,
  type MemberCreator,
  type MemberDraft,
  type MembershipOption,
} from '../../../../domain/member-creation'

/** Shared form: persistence is injected, never imported from Firebase. */
export default function CreateMemberForm({ creator }: { creator: MemberCreator }) {
  const [draft, setDraft] = useState(emptyMemberDraft)
  const [options, setOptions] = useState<MembershipOption[]>([])
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState('')
  const [saved, setSaved] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    creator
      .options()
      .then((value) => {
        if (active) setOptions(value)
      })
      .catch(() => {
        if (active)
          setError('Unable to load membership types. Check the local test environment and retry.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [creator, revision])
  function change<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) {
    setError('')
    setDraft((current) => ({ ...current, [key]: value }))
  }
  function input(
    key: Exclude<keyof MemberDraft, 'importExisting'>,
    label: string,
    type = 'text',
    required = false,
  ) {
    return (
      <label>
        {label}
        <input
          type={type}
          required={required}
          value={String(draft[key])}
          onChange={(event) => change(key, event.target.value)}
        />
      </label>
    )
  }
  function reset() {
    setDraft(emptyMemberDraft())
    requestId.current = crypto.randomUUID()
    setSaved(false)
    setSuccess('')
    setError('')
    setScanning(false)
    setScan('')
  }
  let age: number | null = null
  try {
    if (draft.birthDate) age = ageOn(draft.birthDate)
  } catch {
    /* Validation displays on submit. */
  }
  return (
    <form
      className="create-member-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (pending.current || saved) return
        pending.current = true
        setBusy(true)
        setError('')
        setSuccess('')
        try {
          const result = await creator.create(draft, requestId.current)
          setSuccess(`${result.name} created. Membership ID: ${result.number}.`)
          setSaved(true)
          setScan('')
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to create member. Retry with the same details.',
          )
        } finally {
          pending.current = false
          setBusy(false)
        }
      }}
    >
      <fieldset disabled={busy || saved}>
        <legend>Guest information</legend>
        <button
          type="button"
          onClick={() => {
            setScanning(!scanning)
            setScan('')
          }}
        >
          {scanning ? 'Cancel scan' : 'Scan ID'}
        </button>
        {scanning && (
          <div className="scan-panel">
            <label>
              Scanned ID data
              <textarea autoFocus value={scan} onChange={(event) => setScan(event.target.value)} />
            </label>
            <button
              type="button"
              onClick={() => {
                try {
                  const scanned = parseMemberScan(scan)
                  setDraft((current) => ({ ...current, ...scanned }))
                  setScan('')
                  setScanning(false)
                  setError('')
                } catch (failure) {
                  setError((failure as Error).message)
                  setScan('')
                }
              }}
            >
              Apply scan
            </button>
            <p>Scan or paste newline-delimited ID data, then review the populated fields.</p>
          </div>
        )}
        <div className="creation-grid">
          {input('firstName', 'First name', 'text', true)}
          {input('middleName', 'Middle name')}
          {input('lastName', 'Last name', 'text', true)}
          <label>
            Suffix
            <select
              aria-label="Suffix"
              value={draft.suffix}
              onChange={(event) => change('suffix', event.target.value)}
            >
              {suffixes.map((suffix) => (
                <option key={suffix} value={suffix}>
                  {suffix || 'None'}
                </option>
              ))}
            </select>
          </label>
          {input('birthDate', 'Date of birth', 'date', true)}
          {input('email', 'Email', 'email')}
        </div>
        {age !== null && age < 21 && (
          <p role="status" className="inline-error">
            {age < 18
              ? 'Under 18 — membership cannot be created.'
              : 'Under 21 — verify age restrictions before admission.'}
          </p>
        )}
      </fieldset>
      <fieldset disabled={busy || saved}>
        <legend>Membership</legend>
        <label>
          Type of membership
          <select
            required
            disabled={loading}
            aria-label="Type of membership"
            value={draft.membershipProductId}
            onChange={(event) => change('membershipProductId', event.target.value)}
          >
            <option value="">
              {loading ? 'Loading membership types…' : 'Select membership type'}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        {!loading && !options.length && (
          <p>
            No membership types available.{' '}
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          </p>
        )}
        <label className="creation-checkbox">
          <input
            type="checkbox"
            checked={draft.importExisting}
            onChange={(event) => change('importExisting', event.target.checked)}
          />
          Enter existing membership details
        </label>
        {draft.importExisting && (
          <>
            <p>Optional overrides for importing a membership. Blank fields use automatic values.</p>
            <div className="creation-grid">
              {input('createdDate', 'Creation date', 'date')}
              {input('expiresDate', 'Expire date', 'date')}
              {input('membershipNumber', 'Membership ID', 'text')}
            </div>
          </>
        )}
      </fieldset>
      <fieldset disabled={busy || saved}>
        <legend>Identification and notes</legend>
        <div className="creation-grid">
          <label>
            ID state or type
            <select
              aria-label="ID state or type"
              value={draft.governmentIdType}
              onChange={(event) => change('governmentIdType', event.target.value)}
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
        </div>
        <label>
          Guest notes
          <textarea
            rows={4}
            value={draft.notes}
            onChange={(event) => change('notes', event.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="login-confirmation" role="status">
          {success}
        </p>
      )}
      <div className="creation-actions">
        {saved ? (
          <button type="button" onClick={reset}>
            Create another member
          </button>
        ) : (
          <>
            <button className="primary" type="submit" disabled={busy || loading || !options.length}>
              {busy ? 'Creating member…' : 'Create membership'}
            </button>
            <button type="button" disabled={busy} onClick={reset}>
              Clear form
            </button>
          </>
        )}
      </div>
    </form>
  )
}
