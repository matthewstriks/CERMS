import { AlertTriangle, Clock3 } from 'lucide-react'
import { rentalUrgency } from '../../../domain/admissions'
import type { AdmissionsState } from '../../../domain/admissions'

export default function RentalAlerts({
  state,
  now,
  onFilter,
}: {
  state: AdmissionsState
  now: number
  onFilter(value: 'expired' | 'soon'): void
}) {
  const live = state.status === 'live'
  const alerts = [
    {
      id: 'expired' as const,
      label: 'Expired rentals',
      description: 'Review overdue rentals',
      icon: AlertTriangle,
    },
    {
      id: 'soon' as const,
      label: 'Ending within 5 minutes',
      description: 'Prepare for upcoming expirations',
      icon: Clock3,
    },
  ]
  return (
    <section className="rental-alerts" aria-labelledby="rental-alerts-title">
      <h2 id="rental-alerts-title">Rental alerts</h2>
      {!live && <p className="muted">Alerts will resume when live updates reconnect.</p>}
      <div className="rental-alert-grid">
        {alerts.map((alert) => {
          const count = state.rows.filter((visit) => rentalUrgency(visit, now) === alert.id).length
          return (
            <button
              key={alert.id}
              className={`rental-alert-card ${live && count ? `rental-alert-${alert.id}` : ''}`}
              disabled={!live}
              aria-label={`Show ${alert.id === 'expired' ? 'expired' : 'ending soon'} rentals`}
              onClick={() => onFilter(alert.id)}
            >
              <alert.icon size={22} aria-hidden="true" />
              <span className="rental-alert-copy">
                <strong>{alert.label}</strong>
                <small>{alert.description}</small>
              </span>
              <span className="rental-alert-count">{live ? count : '—'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
