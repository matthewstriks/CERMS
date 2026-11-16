import { useEffect, useState } from 'react'
import type { RegisterRecord } from '../../../../domain/registers'
import { paymentMethods, type RegisterTotals } from '../../../../domain/pos'
import { createPos } from '../../../../data/firebase-pos'
import { useMembershipSession } from '../../lib/membership-session'
import { money } from '../../lib/data'
export default function RegisterLedger({
  record,
  counted,
}: {
  record: RegisterRecord
  counted?: number | null
}) {
  const { reader } = useMembershipSession(),
    [totals, setTotals] = useState<RegisterTotals | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    if (!reader) return
    let active = true
    setTotals(null)
    void createPos(reader)
      .totals(record.id, record.openingTotalCents)
      .then((t) => {
        if (active) setTotals(t)
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
    }
  }, [reader, record.id, record.status, record.openingTotalCents])
  const ending = counted === undefined ? record.closingTotalCents : counted
  return (
    <section className="register-ledger">
      <h3>Payment reconciliation</h3>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {totals ? (
        <dl>
          <dt>Completed transactions</dt>
          <dd>{totals.saleCount}</dd>
          {Object.entries(paymentMethods).map(([key, label]) => (
            <div style={{ display: 'contents' }} key={key}>
              <dt>Net {label.toLowerCase()} payments</dt>
              <dd>{money(totals.netByMethod[key as keyof typeof paymentMethods] / 100)}</dd>
            </div>
          ))}
          <dt>Cash received</dt>
          <dd>{money(totals.cashReceivedCents / 100)}</dd>
          <dt>Change given</dt>
          <dd>{money(totals.changeGivenCents / 100)}</dd>
          <dt>Cash paid out</dt>
          <dd>{money(totals.cashPaidOutCents / 100)}</dd>
          <dt>Cash dropped</dt>
          <dd>{money(totals.cashDropCents / 100)}</dd>
          <dt>
            <strong>Expected cash</strong>
          </dt>
          <dd>
            <strong>{money(totals.expectedCashCents / 100)}</strong>
          </dd>
          {ending !== null && (
            <>
              <dt>Counted cash</dt>
              <dd>{money(ending / 100)}</dd>
              <dt>
                <strong>Over / short</strong>
              </dt>
              <dd>
                <strong>{money((ending - totals.expectedCashCents) / 100)}</strong>
              </dd>
            </>
          )}
        </dl>
      ) : (
        !error && <p>Loading payment totals…</p>
      )}
    </section>
  )
}
