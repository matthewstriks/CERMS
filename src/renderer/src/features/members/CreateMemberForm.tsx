import { normalizePhone, phoneLabel } from '../../../../domain/phone'
import { dobLabel } from '../../lib/data'
import { useEffect, useRef, useState } from 'react'
import './CreateMemberForm.css'
import IdScanInput from './IdScanInput'
import MemberMatches from './MemberMatches'
import type { Member } from '../../../../domain/legacy'
import type { MembershipPage } from '../../../../data/membership-contracts'
import {
  ageOn,
  emptyMemberDraft,
  idTypes,
  type MemberScan,
  type CreatedMember,
  suffixes,
  type MemberCreator,
  type MemberDraft,
  type MembershipOption,
} from '../../../../domain/member-creation'

/** Shared form: persistence is injected, never imported from Firebase. */
export default function CreateMemberForm({
  creator,
  allowImport = true,
  startScanning = false,
  onCreated,
  onBusyChange,
  initialScan,
  lookupId,
  onViewMember,
  onViewCreated,
}: {
  creator: MemberCreator
  onViewCreated?: (member: CreatedMember) => Promise<void>
  initialScan?: MemberScan
  lookupId?: (id: string) => Promise<MembershipPage>
  onViewMember?: (member: Member) => void
  allowImport?: boolean
  startScanning?: boolean
  onCreated?: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [draft, setDraft] = useState(() => ({ ...emptyMemberDraft(), ...initialScan?.draft }))
  const [options, setOptions] = useState<MembershipOption[]>([])
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [scanning, setScanning] = useState(startScanning)
  const [matches, setMatches] = useState<MembershipPage | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [scanReview, setScanReview] = useState<MemberScan | null>(initialScan ?? null)
  const [saved, setSaved] = useState(false)
  const [created, setCreated] = useState<CreatedMember | null>(null)
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
        if (active) setError('Unable to load membership types. Check your connection and retry.')
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
    setCreated(null)
    setSuccess('')
    setError('')
    setScanning(false)
    setMatches(null)
    setScanReview(null)
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
        if (pending.current || saved || scanning || matches?.members.length || lookingUp) return
        pending.current = true
        setBusy(true)
        onBusyChange?.(true)
        setError('')
        setSuccess('')
        try {
          const result = await creator.create(draft, requestId.current)
          setSuccess(`${result.name} created. Membership ID: ${result.number}.`)
          setSaved(true)
          setCreated(result)
          onCreated?.()
          setMatches(null)
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to create member. Retry with the same details.',
          )
        } finally {
          pending.current = false
          setBusy(false)
          onBusyChange?.(false)
        }
      }}
    >
      <fieldset disabled={busy || saved || lookingUp}>
        <legend>Guest information</legend>
        <button
          type="button"
          onClick={() => {
            setScanning(!scanning)
            setMatches(null)
            setScanReview(null)
          }}
        >
          {scanning ? 'Cancel scan' : 'Scan ID'}
        </button>
        {scanning && (
          <IdScanInput
            onCancel={() => setScanning(false)}
            onBusyChange={(value) => {
              setLookingUp(value)
              onBusyChange?.(value)
            }}
            onDecoded={async (scanned) => {
              const found = lookupId ? await lookupId(scanned.draft.governmentId!) : null
              if (!mounted.current) return
              setMatches(found)
              if (!found?.members.length) setDraft((current) => ({ ...current, ...scanned.draft }))
              setScanReview(scanned)
              setScanning(false)
              setError('')
            }}
          />
        )}
        {matches && onViewMember && <MemberMatches result={matches} onView={onViewMember} />}
        {scanReview && (
          <section className="scan-review" aria-label="Review scanned ID">
            <h3>Review scanned ID</h3>
            <dl>
              <dt>Name</dt>
              <dd>
                {[
                  scanReview.draft.firstName,
                  scanReview.draft.middleName,
                  scanReview.draft.lastName,
                  scanReview.draft.suffix,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </dd>
              <dt>Date of birth</dt>
              <dd>{dobLabel(scanReview.draft.birthDate)}</dd>
              <dt>ID number</dt>
              <dd>{scanReview.draft.governmentId}</dd>
              <dt>Address state</dt>
              <dd>{scanReview.draft.governmentIdType || 'Not decoded'}</dd>
              <dt>ID expires</dt>
              <dd>{scanReview.expirationDate || 'Not decoded'}</dd>
            </dl>
            {scanReview.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>
              {matches?.members.length
                ? 'Open the existing member instead of creating a duplicate.'
                : 'Scanned details are filled in below. Review them against the physical ID before saving.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setScanReview(null)
                setMatches(null)
              }}
            >
              Dismiss scan details
            </button>
          </section>
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
          <label>
            Phone number (optional)
            <input
              type="tel"
              autoComplete="tel"
              maxLength={64}
              value={draft.phone}
              placeholder="(210) 555-0123"
              onChange={(event) => {
                event.target.setCustomValidity('')
                change('phone', event.target.value)
              }}
              onBlur={(event) => {
                try {
                  const phone = normalizePhone(event.target.value)
                  event.target.setCustomValidity('')
                  change('phone', phone ? phoneLabel(phone) : '')
                } catch (failure) {
                  event.target.setCustomValidity((failure as Error).message)
                  event.target.reportValidity()
                }
              }}
            />
            <small>US number, or include + and the country code.</small>
          </label>
        </div>
        {age !== null && age < 21 && (
          <p role="status" className="inline-error">
            {age < 18
              ? 'Under 18 — membership cannot be created.'
              : 'Under 21 — verify age restrictions before admission.'}
          </p>
        )}
      </fieldset>
      <fieldset disabled={busy || saved || lookingUp}>
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
        {allowImport && (
          <label className="creation-checkbox">
            <input
              type="checkbox"
              checked={draft.importExisting}
              onChange={(event) => change('importExisting', event.target.checked)}
            />
            Enter existing membership details
          </label>
        )}
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
      <fieldset disabled={busy || saved || lookingUp}>
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
          <>
            {created && onViewCreated && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  onBusyChange?.(true)
                  setError('')
                  try {
                    await onViewCreated(created)
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : 'Unable to open the member. Try again.',
                    )
                  } finally {
                    setBusy(false)
                    onBusyChange?.(false)
                  }
                }}
              >
                View member {created.name}
              </button>
            )}
            <button type="button" disabled={busy} onClick={reset}>
              Create another member
            </button>
          </>
        ) : (
          <>
            <button
              className="primary"
              type="submit"
              disabled={
                busy ||
                lookingUp ||
                loading ||
                !options.length ||
                scanning ||
                !!matches?.members.length
              }
            >
              {busy ? 'Creating member…' : 'Create membership'}
            </button>
            <button type="button" disabled={busy || lookingUp} onClick={reset}>
              Clear form
            </button>
          </>
        )}
      </div>
    </form>
  )
}
