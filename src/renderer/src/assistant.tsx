import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUp, Check, CircleHelp, Download, Plus, Square, X } from 'lucide-react'
import { assistantName, supportModelDownload, type AiSupportState } from '../../shared/ai-support'
import './assistant.css'

function Assistant() {
  const [state, setState] = useState<AiSupportState | null>(null)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const [userName, setUserName] = useState('')
  const feed = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true)
  const busy = !!state?.busy
  const pending = state?.turns.at(-1)?.role === 'user' ? state.turns.at(-1)?.text : undefined
  async function action(run: () => Promise<AiSupportState>) {
    setError('')
    try {
      setState(await run())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.')
    }
  }
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
        if (active) setError('Could not check setup. Try again.')
      })
    void window.desktop
      .getAssistantContext()
      .then((value) => {
        if (active) setUserName(value.user?.name ?? '')
      })
      .catch(() => {})
    return () => {
      active = false
      stop()
    }
  }, [])
  useEffect(() => {
    if (stick.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [state?.turns, state?.busy])
  async function send(text = question) {
    if (!text.trim() || busy || !state?.modelReady) return
    stick.current = true
    setQuestion('')
    await action(() => window.desktop.askAiSupport(text.trim()))
    input.current?.focus()
  }
  const hasTurns = !!state?.turns.length
  return (
    <main className="assistant-window">
      <header className="assistant-header">
        <div className="assistant-brand">
          <span className="assistant-mark">
            <CircleHelp size={24} />
          </span>
          <div>
            <h1>{assistantName}</h1>
            <p>Your CERMS guide{state?.modelReady ? ' · On this device' : ''}</p>
          </div>
        </div>
        <div className="assistant-header-actions">
          {hasTurns && (
            <button
              title="New chat"
              aria-label="New chat"
              disabled={busy}
              onClick={() => void action(() => window.desktop.resetAiSupport())}
            >
              <Plus size={19} />
            </button>
          )}
          <button
            title="Close assistant"
            aria-label="Close assistant"
            onClick={() =>
              void window.desktop
                .closeAssistant()
                .catch(() => setError('Use the window close control.'))
            }
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div
        className="assistant-feed"
        ref={feed}
        role="log"
        aria-label="CERMS Assistant conversation"
        aria-live="polite"
        onScroll={() => {
          const n = feed.current
          if (n) stick.current = n.scrollHeight - n.scrollTop - n.clientHeight < 96
        }}
      >
        {!hasTurns && (
          <section className="assistant-welcome">
            <span className="assistant-welcome-mark">
              <CircleHelp size={34} />
            </span>
            <h2>How can I help?</h2>
            <p>Ask about members, checkout, rentals, or anything CERMS.</p>
          </section>
        )}
        {(!state || state.busy === 'checking') && !hasTurns && (
          <p className="assistant-setup-status" role="status">
            Checking setup…
          </p>
        )}
        {state && !state.modelReady && state.busy !== 'checking' && (
          <section className="assistant-setup" aria-label="Set up CERMS Assistant">
            <h2>{state.runtime === 'missing' ? 'One quick setup' : 'Download CERMS Assistant'}</h2>
            <p>
              {state.runtime === 'missing'
                ? 'Install and open Ollama, then come back here.'
                : 'Free local answers. One download.'}
            </p>
            {state.runtime === 'missing' ? (
              <div className="assistant-buttons">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void action(() => window.desktop.setupAiSupport())}
                >
                  Download Ollama
                </button>
                <button
                  disabled={busy}
                  onClick={() => void action(() => window.desktop.getAiSupportState())}
                >
                  I installed Ollama
                </button>
              </div>
            ) : state.runtime === 'unsupported' ? (
              <p>Setup is available on Windows and Mac.</p>
            ) : (
              <>
                <p className="assistant-small">{supportModelDownload}</p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void action(() => window.desktop.setupAiSupport())}
                >
                  <Download size={17} />
                  Download CERMS Assistant
                </button>
              </>
            )}
            {state.busy === 'download' && (
              <div className="assistant-download" role="status">
                <progress
                  aria-label="CERMS Assistant download progress"
                  max={100}
                  {...(state.percent !== undefined ? { value: state.percent } : {})}
                />
                <span>
                  {state.percent !== undefined ? `${state.percent}%` : 'Preparing download…'}
                </span>
                <button onClick={() => void action(() => window.desktop.cancelAiSupport())}>
                  Pause download
                </button>
              </div>
            )}
          </section>
        )}
        {state?.turns.map((turn, index) => (
          <article key={index} className={`assistant-message assistant-message-${turn.role}`}>
            <span className="assistant-speaker">
              {turn.role === 'user' ? 'You' : assistantName}
            </span>
            <div className="assistant-bubble">
              <div className="assistant-message-text">{turn.text}</div>
              {!!turn.sources?.length && (
                <details className="assistant-sources">
                  <summary>Help articles · {turn.sources.length}</summary>
                  {turn.sources.map((source) => (
                    <section key={source.id}>
                      <h3>{source.title}</h3>
                      <p>{source.text}</p>
                    </section>
                  ))}
                </details>
              )}
            </div>
          </article>
        ))}
        {state?.busy === 'answer' && (
          <div className="assistant-message assistant-message-assistant">
            <span className="assistant-speaker">{assistantName}</span>
            <div
              className="assistant-bubble assistant-thinking"
              role="status"
              aria-label="CERMS Assistant is thinking"
            >
              <span>Thinking</span>
              <span className="thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
        {!busy && pending && (
          <button className="assistant-retry" onClick={() => void send(pending)}>
            Retry answer
          </button>
        )}
      </div>
      {(error || state?.error || state?.emailError) && (
        <p className="assistant-error" role="alert">
          {error || state?.error || state?.emailError}
        </p>
      )}
      <footer className="assistant-footer">
        {hasTurns && (
          <div className="assistant-chat-actions">
            <span>{userName ? `Chatting as ${userName}` : 'Signed-out chat'}</span>
            <button
              disabled={busy}
              onClick={() => void action(() => window.desktop.finishAiSupport())}
            >
              <Check size={15} />
              Finish chat
            </button>
          </div>
        )}
        <form
          className="assistant-composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <textarea
            ref={input}
            aria-label="Message CERMS Assistant"
            placeholder={
              state?.modelReady ? 'Ask CERMS Assistant…' : 'Complete setup to start chatting'
            }
            rows={2}
            maxLength={2000}
            disabled={!state?.modelReady || busy}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
          />
          {state?.busy === 'answer' ? (
            <button
              type="button"
              aria-label="Stop answer"
              title="Stop answer"
              onClick={() => void action(() => window.desktop.cancelAiSupport())}
            >
              <Square size={17} />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send message"
              title="Send message"
              disabled={!state?.modelReady || busy || !question.trim()}
            >
              <ArrowUp size={21} />
            </button>
          )}
        </form>
        <p className="assistant-notice">
          Chats may be monitored for quality assurance. Answers can be incorrect.
        </p>
      </footer>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Assistant />)
