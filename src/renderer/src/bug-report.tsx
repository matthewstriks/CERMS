import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { BugReportContext, BugReportFile, BugReportPayload } from '../../shared/desktop'
import './bug-report.css'

const priorities: BugReportPayload['priority'][] = ['low', 'normal', 'high', 'urgent']
const fileUrl = (file: BugReportFile) => `data:${file.contentType};base64,${file.base64}`

function BugReport() {
  const [context, setContext] = useState<BugReportContext | null>(null)
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState<BugReportPayload['priority']>('normal')
  const [message, setMessage] = useState('')
  const [screenshots, setScreenshots] = useState<BugReportFile[]>([])
  const [files, setFiles] = useState<BugReportFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    void window.desktop
      .getBugReportContext()
      .then(setContext)
      .catch((failure) =>
        setError(failure instanceof Error ? failure.message : 'Bug report details could not load.'),
      )
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) void window.desktop.closeBugReport()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy])

  async function captureScreenshot() {
    if (busy) return
    setError('')
    try {
      const screenshot = await window.desktop.captureMainWindow()
      setScreenshots((previous) => [...previous, screenshot])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Screenshot could not be captured.')
    }
  }
  async function chooseFiles() {
    if (busy) return
    setError('')
    try {
      const selected = await window.desktop.chooseBugFiles()
      setFiles((previous) => [...previous, ...selected])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Files could not be attached.')
    }
  }
  async function submit() {
    if (busy || !context) return
    if (!subject.trim() || !message.trim()) {
      setError('Enter a subject and describe what happened.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await window.desktop.submitBugReport({
        requestId,
        subject: subject.trim(),
        priority,
        message: message.trim(),
        context,
        screenshots,
        files,
      })
      setSent(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Bug report could not be sent.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="bug-report-window">
      <header>
        <div>
          <span className="bug-kicker">CERMS 5 SUPPORT</span>
          <h1>Report a bug</h1>
          <p>
            Tell us what went wrong. Your report includes the diagnostic information shown below.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void window.desktop.closeBugReport()}
        >
          Close
        </button>
      </header>
      {sent ? (
        <section className="bug-success" role="status">
          <h2>Report sent</h2>
          <p>
            Thank you. Your report was emailed to support. Keep an eye on{' '}
            <strong>{context?.email}</strong> for follow-up communication.
          </p>
          <button className="primary" onClick={() => void window.desktop.closeBugReport()}>
            Done
          </button>
        </section>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label>
            Subject
            <input
              required
              maxLength={200}
              value={subject}
              disabled={busy}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Short description of the problem"
            />
          </label>
          <label>
            Priority
            <select
              value={priority}
              disabled={busy}
              onChange={(event) => setPriority(event.target.value as BugReportPayload['priority'])}
            >
              {priorities.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            What happened?
            <textarea
              required
              maxLength={10000}
              rows={8}
              value={message}
              disabled={busy}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the steps, what you expected, and what you saw."
            />
          </label>
          <section className="bug-attachments" aria-labelledby="attachments-heading">
            <div className="section-heading">
              <div>
                <h2 id="attachments-heading">Evidence</h2>
                <p>
                  Capture the main CERMS window as many times as needed or attach supporting files.
                </p>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void captureScreenshot()}
                >
                  Capture screenshot
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void chooseFiles()}
                >
                  Attach files
                </button>
              </div>
            </div>
            {!!screenshots.length && (
              <div className="screenshot-grid">
                {screenshots.map((file, index) => (
                  <figure key={`${file.name}-${index}`}>
                    <img src={fileUrl(file)} alt={`Captured main window ${index + 1}`} />
                    <figcaption>{file.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {!!files.length && (
              <ul className="file-list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                  </li>
                ))}
              </ul>
            )}
          </section>
          {context && (
            <details>
              <summary>Included diagnostic information</summary>
              <p>
                CERMS {context.version} · {context.platform} · Electron {context.electron} ·
                Business {context.business}
              </p>
              <pre>
                {context.logs.length ? context.logs.join('\n') : 'No renderer errors recorded.'}
              </pre>
            </details>
          )}
          {error && (
            <p className="bug-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void window.desktop.closeBugReport()}
            >
              Cancel
            </button>
            <button className="primary" type="submit" disabled={busy || !context}>
              {busy ? 'Sending…' : 'Send bug report'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<BugReport />)
