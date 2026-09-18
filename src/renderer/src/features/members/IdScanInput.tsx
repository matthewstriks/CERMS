import { useEffect, useRef, useState } from 'react'
import {
  decodeMemberScan,
  maxScanLength,
  type MemberScan,
} from '../../../../domain/member-creation'

/** Keyboard capture: finish after input goes quiet, never on an embedded Enter/Tab. */
export default function IdScanInput({
  onDecoded,
  onCancel,
  actionLabel = 'Review scan',
  onBusyChange,
}: {
  onDecoded(scan: MemberScan): Promise<void> | void
  onCancel(): void
  actionLabel?: string
  onBusyChange?(busy: boolean): void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [incomplete, setIncomplete] = useState(false)
  const [quietMs, setQuietMs] = useState(2000)
  useEffect(() => {
    // Wait until the parent dialog is open and native select handling has finished.
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [quietMs])
  const pending = useRef(false)
  const mounted = useRef(true)
  const latestRaw = useRef('')
  const lastInput = useRef(0)
  const handlers = useRef({ onDecoded, onBusyChange })
  handlers.current = { onDecoded, onBusyChange }
  function capture(value: string) {
    latestRaw.current = value
    lastInput.current = Date.now()
    setRaw(value)
    setError('')
    setIncomplete(false)
  }
  async function submit(value: string, automatic: boolean) {
    if (pending.current || !mounted.current || value !== latestRaw.current) return
    let decoded: MemberScan
    try {
      if (value.length >= maxScanLength)
        throw new Error('Scan is too long. Clear it and scan one ID at a time.')
      decoded = decodeMemberScan(value)
    } catch (failure) {
      if (automatic) {
        setIncomplete(true)
        return
      }
      capture('')
      setError(failure instanceof Error ? failure.message : 'Unable to read this ID.')
      return
    }
    pending.current = true
    setBusy(true)
    handlers.current.onBusyChange?.(true)
    capture('')
    try {
      await handlers.current.onDecoded(decoded)
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error ? failure.message : 'Unable to search this ID. Try again.',
        )
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
      handlers.current.onBusyChange?.(false)
    }
  }
  const submitLatest = useRef(submit)
  submitLatest.current = submit
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      latestRaw.current = ''
    }
  }, [])
  useEffect(() => {
    if (!raw || busy) return
    let timer: ReturnType<typeof setTimeout>
    const finish = () => {
      const remaining = quietMs - (Date.now() - lastInput.current)
      if (remaining > 0) {
        timer = setTimeout(finish, remaining)
        return
      }
      void submitLatest.current(raw, true)
    }
    timer = setTimeout(finish, quietMs)
    return () => clearTimeout(timer)
  }, [raw, busy, quietMs])
  return (
    <div className="scan-panel">
      <label>
        Scanned ID data
        <textarea
          ref={input}
          autoFocus
          value={raw}
          maxLength={maxScanLength}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(event) => capture(event.target.value)}
          onKeyDown={(event) => {
            lastInput.current = Date.now()
            if (event.key === 'Tab') {
              event.preventDefault()
              const { selectionStart: start, selectionEnd: end } = event.currentTarget
              capture(
                (latestRaw.current.slice(0, start) + '\n' + latestRaw.current.slice(end)).slice(
                  0,
                  maxScanLength,
                ),
              )
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              capture('')
              onCancel()
            }
          }}
        />
      </label>
      <p role="status">
        {busy
          ? 'Searching members…'
          : incomplete
            ? 'Waiting for a complete, supported ID scan. Continue scanning or clear and try again.'
            : raw
              ? 'Receiving scan… Waiting for the scanner to finish.'
              : 'Ready to scan. Search starts automatically when scanning finishes.'}
      </p>
      <label>
        Scanner finish delay
        <select
          value={quietMs}
          disabled={busy}
          onChange={(event) => {
            lastInput.current = Date.now()
            setQuietMs(Number(event.target.value))
          }}
        >
          <option value={2000}>2 seconds after last character</option>
          <option value={4000}>4 seconds — slower scanners</option>
        </select>
      </label>
      <button type="button" disabled={busy} onClick={() => void submit(raw, false)}>
        {busy ? 'Searching members…' : actionLabel}
      </button>
      <button type="button" disabled={busy || !raw} onClick={() => capture('')}>
        Clear scan
      </button>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <p>Scan the PDF417 barcode on the back of the ID. Scanning never saves a member.</p>
    </div>
  )
}
