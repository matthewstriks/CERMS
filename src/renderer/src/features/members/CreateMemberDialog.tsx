import type { MembershipReader } from '../../../../data/membership-contracts'
import type { MemberScan } from '../../../../domain/member-creation'
import type { Member } from '../../../../domain/legacy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createDevMemberCreator } from '../../../../data/firebase-dev-member-creator'
import CreateMemberForm from './CreateMemberForm'
import { validateDevMember } from '../../../../domain/dev-member'
import { createCatalog } from '../../../../data/firebase-catalog'
import { startMemberOrder } from '../../lib/order-start'
import type { OrderMember } from '../../../../domain/pos'
import type { CatalogProduct, CatalogRecord } from '../../../../domain/catalog'
export default function CreateMemberDialog({
  uid,
  club,
  reader,
  initialScan,
  onViewMember,
  onClose,
  onCreated,
  onAddToOrder,
  initialProductId,
}: {
  uid: string
  club: string
  reader: MembershipReader
  initialScan?: MemberScan
  onViewMember(member: Member): void
  onClose(): void
  onCreated(): void
  onAddToOrder?: (member: OrderMember, product: CatalogRecord<CatalogProduct>) => void
  initialProductId?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const creator = useMemo(() => createDevMemberCreator(uid, club), [uid, club])
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="member-dialog member-create-dialog"
      aria-labelledby="create-member-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="dialog-heading">
        <h2 id="create-member-title">Create member · Dev System</h2>
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <p>
        Choose a membership, then complete checkout. The member is saved only when the order
        succeeds.
      </p>
      <CreateMemberForm
        creator={creator}
        initialProductId={initialProductId}
        checkoutLabel={onAddToOrder ? 'Add membership to order' : undefined}
        onCheckout={async (input, id) => {
          const draft = validateDevMember(input)
          const catalog = createCatalog(reader)
          let page = await catalog.products(true)
          let product = page.rows.find((p) => p.id === draft.membershipProductId)
          while (!product && page.more) {
            page = await catalog.products()
            product = page.rows.find((p) => p.id === draft.membershipProductId)
          }
          if (
            !product ||
            !product.data.active ||
            !product.data.membership ||
            product.data.payout ||
            (product.data.restricted && !product.data.restrictedUsers.includes(uid))
          )
            throw new Error('The selected membership is unavailable. Choose another membership.')
          if (onAddToOrder) {
            onAddToOrder({ id, name: `${draft.firstName} ${draft.lastName}`, draft }, product)
            onClose()
            return
          }
          if (
            startMemberOrder(reader, {
              member: { id, name: `${draft.firstName} ${draft.lastName}`, draft },
              cart: [{ product, quantity: 1, unitPriceCents: product.data.priceCents }],
            })
          )
            onClose()
        }}
        allowImport={false}
        initialScan={initialScan}
        lookupId={(id) => reader.list({ field: 'id', search: id, dnaOnly: false })}
        onViewMember={onViewMember}
        onViewCreated={async (created) => {
          const page = await reader.list({
            field: 'number',
            search: String(created.number),
            dnaOnly: false,
          })
          const member = page.members.find((value) => value.id === created.id)
          if (!member) throw new Error('The saved member could not be loaded. Try again.')
          onViewMember(member)
        }}
        onCreated={onCreated}
        onBusyChange={setBusy}
      />
    </dialog>
  )
}
