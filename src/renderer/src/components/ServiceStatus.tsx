import { useEffect, useState } from 'react'
import { Activity, RefreshCw, X } from 'lucide-react'
import {
  overallServiceTone,
  pendingServiceStatus,
  type ServiceStatus as Snapshot,
} from '../../../shared/service-status'
import './ServiceStatus.css'

export default function ServiceStatus() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(true)
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let active = true,
      running = false
    async function check() {
      setNow(Date.now())
      if (!navigator.onLine) {
        setSnapshot({
          checkedAt: Date.now(),
          rows: pendingServiceStatus('Cannot check while offline').map((r, i) =>
            i === 0 ? { ...r, tone: 'red', detail: 'This device is offline' } : r,
          ),
        })
        setBusy(false)
        return
      }
      if (running) return
      running = true
      setBusy(true)
      try {
        const next = await window.desktop.getServiceStatus()
        if (active && navigator.onLine) setSnapshot(next)
      } catch {
        if (active && navigator.onLine)
          setSnapshot({
            checkedAt: Date.now(),
            rows: pendingServiceStatus('Status check unavailable; try again'),
          })
      } finally {
        running = false
        if (active) {
          setBusy(false)
          setNow(Date.now())
        }
      }
    }
    void check()
    const timer = setInterval(() => void check(), 60000)
    const clock = setInterval(() => setNow(Date.now()), 15000)
    const changed = () => void check()
    window.addEventListener('online', changed)
    window.addEventListener('offline', changed)
    window.addEventListener('focus', changed)
    return () => {
      active = false
      clearInterval(timer)
      clearInterval(clock)
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
      window.removeEventListener('focus', changed)
    }
  }, [revision])
  const stale = !!snapshot && now - snapshot.checkedAt > 120000
  const rows = stale
    ? pendingServiceStatus('Last check is out of date; refresh to verify')
    : (snapshot?.rows ?? pendingServiceStatus())
  const tone = overallServiceTone(rows)
  const label = !snapshot
    ? 'Checking services'
    : tone === 'red'
      ? 'Connection or service issue'
      : tone === 'yellow'
        ? 'Some services need attention'
        : 'No reported issues'
  return (
    <div className="login-services">
      <button
        className={`service-status-trigger service-${tone}`}
        popoverTarget="login-service-status"
        aria-label={`Service status: ${label}`}
        title={label}
      >
        <Activity size={16} aria-hidden="true" />
        <span>Services</span>
        <span className={`service-dot service-${tone}`} aria-hidden="true" />
      </button>
      <div
        id="login-service-status"
        popover="auto"
        role="dialog"
        aria-labelledby="service-status-heading"
        className="service-status-panel"
      >
        <div className="service-status-heading">
          <h2 id="service-status-heading">Service status</h2>
          <button
            className="icon-button"
            popoverTarget="login-service-status"
            popoverTargetAction="hide"
            aria-label="Close service status"
          >
            <X size={18} />
          </button>
        </div>
        <p className="service-status-summary" role="status">
          {busy ? 'Checking services…' : label}
        </p>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <span className={`service-dot service-${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.name}</strong>
                <span>{row.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="service-status-note">
          Internet is checked from this device. Other indicators use public, global provider
          reports; account access is checked when you sign in.
        </p>
        <div className="service-status-footer">
          <small>
            {snapshot
              ? `Checked ${new Date(snapshot.checkedAt).toLocaleTimeString()}`
              : 'Waiting for first check'}
          </small>
          <button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </div>
        <p className="service-status-key">
          <span className="service-green">Green: no reported issue</span> ·{' '}
          <span className="service-yellow">Yellow: limited or checking</span> ·{' '}
          <span className="service-red">Red: offline or outage</span>
        </p>
      </div>
    </div>
  )
}
