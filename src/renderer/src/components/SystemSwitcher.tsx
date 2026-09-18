import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, X } from 'lucide-react'
import { useMembershipSession } from '../lib/membership-session'
import type { SystemOption } from '../../../data/firebase-system-access'

export default function SystemSwitcher() {
  const { reader, switchSystem } = useMembershipSession()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="system-switch-button" onClick={() => setOpen(true)}>
        <ArrowLeftRight size={15} />
        Change system
      </button>
      {open && (
        <SystemDialog
          current={reader!.club}
          onClose={() => setOpen(false)}
          onSwitch={switchSystem}
        />
      )}
    </>
  )
}
function SystemDialog({
  current,
  onClose,
  onSwitch,
}: {
  current: string
  onClose(): void
  onSwitch(id: string): Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [systems, setSystems] = useState<SystemOption[]>([])
  const [selected, setSelected] = useState(current)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void import('../../../data/firebase-system-access')
      .then(async (client) => {
        try {
          const options = await client.listSystems()
          if (active) setSystems(options)
        } catch (failure) {
          if (active) setError(client.systemSwitchError(failure))
        } finally {
          if (active) setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load systems. Please try again.')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [retry])
  return (
    <dialog
      ref={dialog}
      className="member-dialog system-dialog"
      aria-labelledby="system-dialog-title"
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <h2 id="system-dialog-title">Change system</h2>
        <button aria-label="Close system switcher" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p>
        Choose the system to use for this account. This selection is saved for your next sign-in.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (
            !loading &&
            !error &&
            selected !== current &&
            systems.some((system) => system.id === selected)
          )
            void onSwitch(selected)
        }}
      >
        <label htmlFor="selected-system">System</label>
        <select
          id="selected-system"
          value={selected}
          disabled={loading || !!error}
          onChange={(event) => setSelected(event.target.value)}
        >
          {!systems.some((system) => system.id === current) && (
            <option value={current}>{current} (current)</option>
          )}
          {systems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name} · {system.id}
              {system.id === current ? ' (current)' : ''}
            </option>
          ))}
        </select>
        {loading && <p role="status">Loading systems…</p>}
        {error && (
          <p role="alert" className="inline-error">
            {error}{' '}
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              Try again
            </button>
          </p>
        )}
        {!loading && !error && systems.length === 0 && <p>No systems are available.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            disabled={
              loading ||
              !!error ||
              selected === current ||
              !systems.some((system) => system.id === selected)
            }
          >
            Switch system
          </button>
        </div>
      </form>
    </dialog>
  )
}
