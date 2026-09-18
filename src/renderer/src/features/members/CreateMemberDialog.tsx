import type { MembershipReader } from '../../../../data/membership-contracts'
import type { MemberScan } from '../../../../domain/member-creation'
import type { Member } from '../../../../domain/legacy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createDevMemberCreator } from '../../../../data/firebase-dev-member-creator'
import CreateMemberForm from './CreateMemberForm'
export default function CreateMemberDialog({
  uid,
  club,
  reader,
  initialScan,
  onViewMember,
  onClose,
  onCreated,
}: {
  uid: string
  club: string
  reader: MembershipReader
  initialScan?: MemberScan
  onViewMember(member: Member): void
  onClose(): void
  onCreated(): void
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
      <p>Development membership · 365 days · No payment collected</p>
      <CreateMemberForm
        creator={creator}
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
