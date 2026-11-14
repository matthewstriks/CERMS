import { useEffect, useState } from 'react'
import { registerCloseoutText } from '../../../../domain/register-closeout'
import { createRegisters } from '../../../../data/firebase-registers'
import { createPos } from '../../../../data/firebase-pos'
import { useMembershipSession } from '../../lib/membership-session'
import ReceiptPrintDialog from '../pos/ReceiptPrintDialog'

export default function RegisterCloseoutDialog({
  registerId,
  onClose,
}: {
  registerId: string
  onClose(): void
}) {
  const { reader } = useMembershipSession()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!reader) return
    let active = true
    setText(null)
    setError('')
    const pos = createPos(reader)
    void Promise.all([createRegisters(reader).get(registerId), pos.settings()])
      .then(async ([record, settings]) => {
        if (!record || record.status !== 'closed')
          throw new Error(
            'This register has not been confirmed closed. Refresh Registers and try again.',
          )
        const totals = await pos.totals(record.id, record.openingTotalCents)
        const report = registerCloseoutText({
          business: reader.club,
          receiptName: settings.receiptName,
          receiptAddress: settings.receiptAddress,
          record,
          totals,
        })
        if (active) setText(report)
      })
      .catch((error) => {
        if (active)
          setError(
            `${error instanceof Error ? error.message : 'Report could not be loaded.'} The register remains closed; retry loading the report.`,
          )
      })
    return () => {
      active = false
    }
  }, [reader, registerId, revision])
  return (
    <ReceiptPrintDialog
      title="Register closeout report"
      text={text}
      onClose={onClose}
      printLabel="Print closeout report"
      successMessage="Closeout report sent to the printer."
      failureMessage="The register remains closed. You can retry printing or reprint from Closed registers."
      loadError={error}
      onRetry={() => setRevision((value) => value + 1)}
    />
  )
}
