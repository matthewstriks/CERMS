import { useEffect, useRef, useState } from 'react'
import { durationUnits, type CatalogProduct, type CatalogRecord } from '../../../../domain/catalog'
import type { OrderMember } from '../../../../domain/pos'
import {
  membershipRenewalPreview,
  type MembershipRenewalMode,
} from '../../../../domain/membership-renewal'
import type { MembershipReader } from '../../../../data/membership-contracts'
import { createPos } from '../../../../data/firebase-pos'
import OrderMemberPicker from './OrderMemberPicker'
import { money } from '../../lib/data'
import './MembershipPurchaseDialog.css'

type Recipient = { id: string; name: string; expiresAt: number | null }
const date = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
function remainingTime(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60000))
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60)
  return days
    ? `${days} day${days === 1 ? '' : 's'}${hours ? `, ${hours} hour${hours === 1 ? '' : 's'}` : ''}`
    : hours
      ? `${hours} hour${hours === 1 ? '' : 's'}, ${minutes % 60} min`
      : `${minutes} min`
}

export default function MembershipPurchaseDialog({
  reader,
  products,
  initialProductId,
  initialMember,
  renewalPrompt = false,
  members,
  assignments = [],
  canCreate,
  onCreate,
  onAssign,
  onClose,
}: {
  reader: MembershipReader
  products: CatalogRecord<CatalogProduct>[]
  initialProductId?: string
  initialMember?: OrderMember
  renewalPrompt?: boolean
  members: OrderMember[]
  assignments?: { productId: string; memberId: string }[]
  canCreate: boolean
  onCreate(productId: string): void
  onAssign(
    member: OrderMember,
    product: CatalogRecord<CatalogProduct>,
    mode: MembershipRenewalMode,
  ): void
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [productId, setProductId] = useState(initialProductId || products[0]?.id || '')
  const [selected, setSelected] = useState(initialMember)
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [mode, setMode] = useState<MembershipRenewalMode>('extend')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [now, setNow] = useState(Date.now)
  const options = [
    ...members,
    ...(selected && !members.some((m) => m.id === selected.id) ? [selected] : []),
  ]
  const product = products.find((p) => p.id === productId)
  const selectedId = selected?.id
  const currentRecipient = recipient?.id === selectedId ? recipient : null
  const units =
    1 + assignments.filter((a) => a.memberId === selectedId && a.productId === productId).length
  const durationLabel = product
    ? `${product.data.membershipLengthRaw} ${product.data.membershipLengthType}${product.data.membershipLengthRaw === 1 ? '' : 's'}`
    : ''
  let preview: ReturnType<typeof membershipRenewalPreview> | null = null
  if (currentRecipient && product) {
    try {
      preview = membershipRenewalPreview(
        currentRecipient.expiresAt,
        product.data.membershipLengthRaw * durationUnits[product.data.membershipLengthType],
        now,
        units,
      )
    } catch {
      /* Invalid catalog configuration cannot be added. */
    }
  }
  const effectiveMode = preview?.active ? mode : 'restart'
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => {
      window.clearInterval(timer)
      node?.close()
    }
  }, [])
  useEffect(() => {
    let active = true
    setRecipient(null)
    setLoadError('')
    setError('')
    setNow(Date.now())
    if (!selectedId) {
      setLoading(false)
      return
    }
    setLoading(true)
    void createPos(reader)
      .membershipRecipient(selectedId)
      .then((value) => {
        if (active) {
          setRecipient(value)
          setMode('extend')
        }
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error ? error.message : 'Could not load membership expiration.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reader, selectedId, retry])
  return (
    <>
      <dialog
        ref={dialog}
        className="member-dialog membership-purchase-dialog"
        aria-label="Add membership to order"
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
      >
        <div className="membership-purchase-heading">
          <div>
            <p className="membership-eyebrow">MEMBERSHIPS</p>
            <h2>{renewalPrompt ? 'Renew expired membership' : 'Add membership to order'}</h2>
            <p>
              {renewalPrompt
                ? `${initialMember?.name ?? 'This member'}’s membership has expired. Choose a plan to add to their order.`
                : 'Choose a plan, then assign its time to a member.'}
            </p>
          </div>
          <button type="button" aria-label="Close membership selection" onClick={onClose}>
            ×
          </button>
        </div>
        <section className="membership-purchase-section" aria-label="Choose membership plan">
          <label className="membership-field">
            Membership plan
            <select
              aria-label="Membership product"
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value)
                setError('')
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.data.name}
                </option>
              ))}
            </select>
          </label>
          {product ? (
            <div className="membership-plan-details">
              <span>{durationLabel} per unit</span>
              <strong>{money(product.data.priceCents / 100)}</strong>
            </div>
          ) : (
            <p>No available membership products.</p>
          )}
        </section>
        <section className="membership-purchase-section" aria-label="Membership recipient">
          <div className="membership-section-heading">
            <h3>Existing member</h3>
            {!renewalPrompt && (
              <button type="button" onClick={() => setPicking(true)}>
                Find membership recipient
              </button>
            )}
          </div>
          <label className="membership-field">
            Member
            <select
              aria-label="Membership recipient"
              disabled={renewalPrompt}
              value={selectedId ?? ''}
              onChange={(event) => setSelected(options.find((m) => m.id === event.target.value))}
            >
              <option value="">Choose a member</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {loading && (
            <p role="status" className="membership-status-note">
              Loading current membership…
            </p>
          )}
          {loadError && (
            <div role="alert" className="inline-error">
              <p>{loadError}</p>
              <button type="button" onClick={() => setRetry((value) => value + 1)}>
                Retry membership details
              </button>
            </div>
          )}
          {currentRecipient && preview && (
            <>
              <div className="membership-current-status">
                <div>
                  <strong>{currentRecipient.name}</strong>
                  <span>
                    Current expiration:{' '}
                    {currentRecipient.expiresAt === null
                      ? 'Not recorded'
                      : date(currentRecipient.expiresAt)}
                  </span>
                </div>
                <span
                  className={`membership-status-badge ${preview.active ? 'is-active' : 'is-expired'}`}
                >
                  {preview.active
                    ? 'Active'
                    : currentRecipient.expiresAt === null
                      ? 'No expiration'
                      : 'Expired'}
                </span>
                <p>
                  {preview.active
                    ? `${remainingTime(preview.remainingMillis)} remaining`
                    : 'No membership time remaining'}
                </p>
              </div>
              {units > 1 && (
                <p className="membership-status-note">
                  This member will have {units} units in this order. The calculations and time
                  choice apply to all {units} units.
                </p>
              )}
              {preview.active ? (
                <fieldset className="membership-renewal-options">
                  <legend>How should the new time be applied?</legend>
                  <label
                    className={`membership-renewal-option ${mode === 'restart' ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="membership-renewal-mode"
                      aria-label="Start from today"
                      value="restart"
                      checked={mode === 'restart'}
                      onChange={() => setMode('restart')}
                    />
                    <span>
                      <strong>Start from today</strong>
                      <small>Replace the remaining time</small>
                      <span className="membership-calculation">
                        Now + {units > 1 ? `${units} × ` : ''}
                        {durationLabel}
                      </span>
                      <span className="membership-expiration">
                        Expires {date(preview.restartExpiresAt)}
                      </span>
                    </span>
                  </label>
                  <label
                    className={`membership-renewal-option ${mode === 'extend' ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="membership-renewal-mode"
                      aria-label="Add to existing expiration"
                      value="extend"
                      checked={mode === 'extend'}
                      onChange={() => setMode('extend')}
                    />
                    <span>
                      <strong>Add to existing expiration</strong>
                      <small>Keep {remainingTime(preview.remainingMillis)} remaining</small>
                      <span className="membership-calculation">
                        {date(currentRecipient.expiresAt!)} + {units > 1 ? `${units} × ` : ''}
                        {durationLabel}
                      </span>
                      <span className="membership-expiration">
                        Expires {date(preview.extendExpiresAt)}
                      </span>
                    </span>
                  </label>
                </fieldset>
              ) : (
                <div className="membership-auto-start" role="status">
                  <strong>Starts from now automatically</strong>
                  <p>
                    {currentRecipient.expiresAt === null
                      ? 'No current expiration is recorded.'
                      : 'This membership has expired.'}{' '}
                    The full purchased duration starts at successful checkout.
                  </p>
                  <span className="membership-calculation">
                    Now + {units > 1 ? `${units} × ` : ''}
                    {durationLabel}
                  </span>
                  <span className="membership-expiration">
                    Expires {date(preview.restartExpiresAt)}
                  </span>
                </div>
              )}
              <p className="membership-status-note">
                Dates are estimates based on the current time. Nothing changes until checkout
                succeeds.
              </p>
            </>
          )}
        </section>
        {canCreate && (
          <div className="membership-new-member">
            <div>
              <strong>New customer?</strong>
              <span>Create their membership and add it to this order.</span>
            </div>
            <button type="button" disabled={!product} onClick={() => onCreate(productId)}>
              Create new membership
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!product || !currentRecipient || !preview || loading || !!loadError}
            onClick={() => {
              if (!currentRecipient || !product || !preview) return
              try {
                onAssign(
                  { id: currentRecipient.id, name: currentRecipient.name },
                  product,
                  effectiveMode,
                )
              } catch (error) {
                setError(error instanceof Error ? error.message : 'Could not add membership.')
              }
            }}
          >
            Add membership to order
          </button>
        </div>
      </dialog>
      {picking && (
        <OrderMemberPicker
          reader={reader}
          onClose={() => setPicking(false)}
          onSelect={(member) => {
            setSelected(member)
            setPicking(false)
          }}
        />
      )}
    </>
  )
}
