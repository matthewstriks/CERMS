import { requestNotificationSound } from '../lib/notification-audio'
import ReleaseNotesDialog from './ReleaseNotesDialog'
import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import type { UpdateState } from '../../../shared/updates'
import './AppUpdates.css'
export function useAppUpdates() {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    let active = true,
      received = false
    const unsubscribe = window.desktop.onUpdateState((next) => {
      received = true
      if (active) setState(next)
    })
    void window.desktop
      .getUpdateState()
      .then((next) => {
        if (active && !received) setState(next)
      })
      .catch(() => {})
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  return state
}
export default function AppUpdates() {
  const state = useAppUpdates()
  const [dismissed, setDismissed] = useState('')
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [notesVersion, setNotesVersion] = useState<string | null>(null)
  const key = state ? `${state.phase}:${state.version ?? ''}:${state.message}` : ''
  if (
    !state ||
    key === dismissed ||
    (!['downloading', 'ready'].includes(state.phase) && !state.manual)
  )
    return null
  return (
    <>
      <aside
        className="app-update-notice"
        aria-label="Application updates"
        data-notification-sound={`update:${state.phase}:${state.version ?? ''}`}
      >
        <div role="status">
          <strong>{state.phase === 'ready' ? 'Update ready' : 'Application updates'}</strong>
          <p>
            {state.message}
            {state.phase === 'downloading' ? ` ${state.percent ?? 0}%` : ''}
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="app-update-actions">
          {state.version && (
            <button onClick={() => setNotesVersion(state.version!)}>What's new</button>
          )}
          {state.phase === 'ready' && (
            <button
              className="primary"
              disabled={installing}
              onClick={async () => {
                requestNotificationSound()
                setInstalling(true)
                setError('')
                try {
                  await window.desktop.installUpdate()
                } catch {
                  setError(
                    'The update could not be installed. Try again or quit normally to install it.',
                  )
                } finally {
                  setInstalling(false)
                }
              }}
            >
              <Download size={15} />
              Install and restart
            </button>
          )}
          {state.phase === 'error' && (
            <button
              onClick={() =>
                void window.desktop
                  .checkForUpdates()
                  .catch(() => setError('Update check could not be started.'))
              }
            >
              <RefreshCw size={15} />
              Try again
            </button>
          )}
          <button
            aria-label="Dismiss update notice"
            disabled={installing}
            onClick={() => setDismissed(key)}
          >
            <X size={16} />
            {state.phase === 'ready' ? 'Later' : 'Dismiss'}
          </button>
        </div>
      </aside>
      {notesVersion && notesVersion === state.version && (
        <ReleaseNotesDialog
          key={notesVersion}
          version={notesVersion}
          notes={state.releaseNotes}
          onClose={() => setNotesVersion(null)}
        />
      )}
    </>
  )
}
export function UpdateSettings() {
  const state = useAppUpdates()
  const [notesVersion, setNotesVersion] = useState<string | null>(null)
  const [error, setError] = useState('')
  return (
    <div className="app-update-settings">
      <h3>Software updates</h3>
      {state?.version && (
        <button onClick={() => setNotesVersion(state.version!)}>What's new</button>
      )}
      {notesVersion && notesVersion === state?.version && (
        <ReleaseNotesDialog
          key={notesVersion}
          version={notesVersion}
          notes={state.releaseNotes}
          onClose={() => setNotesVersion(null)}
        />
      )}
      <p role="status">{state?.message ?? 'Loading update information…'}</p>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={!state || ['disabled', 'checking', 'downloading', 'ready'].includes(state.phase)}
        onClick={() =>
          void window.desktop
            .checkForUpdates()
            .catch(() => setError('Update check could not be started.'))
        }
      >
        <RefreshCw size={15} />
        Check for updates
      </button>
    </div>
  )
}
