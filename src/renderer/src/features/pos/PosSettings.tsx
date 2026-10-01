import { useState } from 'react'
import type { PosSettings as Settings } from '../../../../domain/pos'
import type { PosClient } from '../../../../data/firebase-pos'
export default function PosSettings({
  settings,
  client,
  onSaved,
}: {
  settings: Settings
  client: PosClient
  onSaved(): void
}) {
  const [draft, setDraft] = useState(settings),
    [rate, setRate] = useState(
      settings.taxRateBps === null ? '' : String(settings.taxRateBps / 100),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <form
      className="panel pos-settings"
      onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100) {
          setError('Enter a tax percentage from 0 to 100, with up to two decimal places.')
          return
        }
        setBusy(true)
        try {
          await client.saveSettings({ ...draft, taxRateBps: Math.round(Number(rate) * 100) })
          onSaved()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Unable to save settings.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>Tax & receipt settings</h2>
      <fieldset disabled={busy}>
        <label>
          Sales tax (%)
          <input
            required
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label>
          Business name on receipt
          <input
            required
            maxLength={200}
            value={draft.receiptName}
            onChange={(e) => setDraft({ ...draft, receiptName: e.target.value })}
          />
        </label>
        <label>
          Receipt address
          <textarea
            maxLength={500}
            value={draft.receiptAddress}
            onChange={(e) => setDraft({ ...draft, receiptAddress: e.target.value })}
          />
        </label>
        <label>
          Receipt footer
          <textarea
            maxLength={500}
            value={draft.receiptFooter}
            onChange={(e) => setDraft({ ...draft, receiptFooter: e.target.value })}
          />
        </label>
        <p>
          Tax applies only to products marked taxable. Existing receipts keep their original tax and
          business details.
        </p>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <button className="primary">{busy ? 'Saving…' : 'Save POS settings'}</button>
      </fieldset>
    </form>
  )
}
