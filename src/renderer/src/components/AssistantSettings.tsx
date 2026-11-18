import { useEffect, useState } from 'react'
import type { AiSupportState } from '../../../shared/ai-support'
import './AssistantSettings.css'

export default function AssistantSettings() {
  const [state, setState] = useState<AiSupportState | null>(null)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  useEffect(() => {
    let active = true
    const stop = window.desktop.onAiSupportState((value) => {
      if (active) setState(value)
    })
    void window.desktop
      .getAiSupportState()
      .then((value) => {
        if (active) setState(value)
      })
      .catch(() => {
        if (active) setError('Could not check the assistant download.')
      })
    return () => {
      active = false
      stop()
    }
  }, [])
  return (
    <section className="panel settings-card" aria-labelledby="assistant-settings-title">
      <h2 id="assistant-settings-title">CERMS Assistant</h2>
      <p>
        {!state || state.busy === 'checking'
          ? 'Checking download…'
          : state.modelReady
            ? 'Local download installed.'
            : state.runtime === 'missing'
              ? 'Open Ollama to check the local download.'
              : 'Local download not installed.'}
      </p>
      <p>Remove the assistant model from this computer. Ollama and other models stay installed.</p>
      <div className="assistant-settings-actions">
        <button
          disabled={!!state?.busy || removing}
          onClick={() => {
            setError('')
            void window.desktop
              .getAiSupportState()
              .then(setState)
              .catch(() => setError('Open Ollama and try again.'))
          }}
        >
          Check download
        </button>
        <button
          onClick={() =>
            void window.desktop
              .openAssistant()
              .catch(() => setError('Could not open CERMS Assistant.'))
          }
        >
          Open CERMS Assistant
        </button>
        <button
          disabled={!state?.modelReady || !!state.busy || removing}
          onClick={async () => {
            setRemoving(true)
            setError('')
            try {
              const value = await window.desktop.removeAiSupport()
              setState(value)
              if (value.error) setError(value.error)
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Removal could not be confirmed. Retry after opening Ollama.',
              )
            } finally {
              setRemoving(false)
            }
          }}
        >
          {removing ? 'Removing…' : 'Remove assistant download'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
