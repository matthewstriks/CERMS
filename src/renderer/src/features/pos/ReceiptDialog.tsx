import { receiptText, type SaleReceipt } from '../../../../domain/pos'
import ReceiptPrintDialog from './ReceiptPrintDialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMembershipSession } from '../../lib/membership-session'
import { createPos } from '../../../../data/firebase-pos'
import { hasStaffPermission } from '../../../../domain/staff-permissions'

export default function ReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: SaleReceipt
  onClose(): void
}) {
  const { reader } = useMembershipSession()
  const client = useMemo(
    () =>
      reader &&
      reader.club === receipt.business &&
      receipt.kind !== 'refund' &&
      hasStaffPermission(reader.uid, 'processSales', reader.permissions)
        ? createPos(reader)
        : null,
    [reader, receipt.business],
  )
  const requestId = useRef(crypto.randomUUID())
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!client)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!client) return
    let active = true
    setLoading(true)
    setError('')
    setAddress(null)
    void client
      .receiptRecipient(receipt.id)
      .then((value) => {
        if (active) setAddress(value.email)
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Customer email could not load.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [client, receipt.id, revision])
  return (
    <ReceiptPrintDialog
      key={`${receipt.id}:${client ? 'email' : 'print'}`}
      title={receipt.kind === 'refund' ? 'Refund receipt' : 'Sale receipt'}
      text={receiptText(receipt)}
      onClose={onClose}
      failureMessage="The sale is saved and can be reprinted."
      emailDelivery={
        client
          ? {
              address,
              loading,
              error,
              retry: () => setRevision((value) => value + 1),
              send: async (email) => {
                await client.emailReceipt(receipt.id, email, requestId.current)
              },
            }
          : undefined
      }
    />
  )
}
