import { receiptText, type SaleReceipt } from '../../../../domain/pos'
import ReceiptPrintDialog from './ReceiptPrintDialog'

export default function ReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: SaleReceipt
  onClose(): void
}) {
  return (
    <ReceiptPrintDialog
      title="Sale receipt"
      text={receiptText(receipt)}
      onClose={onClose}
      failureMessage="The sale is saved and can be reprinted."
    />
  )
}
