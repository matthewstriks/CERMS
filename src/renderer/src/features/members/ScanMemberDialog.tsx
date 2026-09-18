import { dobLabel } from '../../lib/data'
import { useEffect, useRef, useState } from 'react'
import type { MembershipPage, MembershipReader } from '../../../../data/membership-contracts'
import type { MemberScan } from '../../../../domain/member-creation'
import type { Member } from '../../../../domain/legacy'
import IdScanInput from './IdScanInput'
import MemberMatches from './MemberMatches'
import './CreateMemberForm.css'

export default function ScanMemberDialog({
  reader,
  canCreate,
  onClose,
  onCreate,
  onView,
}: {
  reader: MembershipReader
  canCreate: boolean
  onClose(): void
  onCreate(scan: MemberScan): void
  onView(member: Member): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState<MemberScan | null>(null)
  const [result, setResult] = useState<MembershipPage | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    const node = dialog.current
    node?.showModal()
    return () => {
      active.current = false
      node?.close()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="member-dialog member-create-dialog"
      aria-labelledby="scan-member-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="dialog-heading">
        <h2 id="scan-member-title">Find member by ID</h2>
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <p>Search members in the current system using their government ID number.</p>
      {!result && (
        <IdScanInput
          actionLabel="Search members"
          onCancel={onClose}
          onBusyChange={setBusy}
          onDecoded={async (scanned) => {
            const found = await reader.list({
              field: 'id',
              search: scanned.draft.governmentId!,
              dnaOnly: false,
            })
            if (active.current) {
              setScan(scanned)
              setResult(found)
            }
          }}
        />
      )}
      {result && (
        <>
          <MemberMatches result={result} onView={onView} />
          {!result.members.length && scan && (
            <section className="scan-review" aria-label="No matching member">
              <h3>No member found with this ID</h3>
              <p>
                {scan.draft.firstName} {scan.draft.lastName} · DOB {dobLabel(scan.draft.birthDate)}
              </p>
              {scan.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              {canCreate ? (
                <>
                  <p>Would you like to create a membership using these details?</p>
                  <button onClick={() => onCreate(scan)}>Create membership with this ID</button>
                </>
              ) : (
                <p>Member creation is currently available only to the owner in Dev System.</p>
              )}
            </section>
          )}
          <button
            onClick={() => {
              setScan(null)
              setResult(null)
            }}
          >
            Scan another ID
          </button>
        </>
      )}
    </dialog>
  )
}
