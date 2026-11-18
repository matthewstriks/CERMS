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
  const [replyEmail, setReplyEmail] = useState('')
  const login = context?.mode === 'login'
  useEffect(() => {
    let active = true
    void window.desktop
      .getBugReportContext()
      .then((value) => {
        if (active) {
          setContext(value)
          setReplyEmail(value.email)
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : 'Bug report details could not load.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) void window.desktop.closeBugReport()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy])

  async function captureScreenshot() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (screenshots.length >= 5) throw new Error('Use at most five screenshots.')
      const screenshot = await window.desktop.captureMainWindow()
      if (
        [...screenshots, ...files, screenshot].reduce((sum, file) => sum + file.size, 0) >
        8 * 1024 * 1024
      )
        throw new Error('Screenshots and attachments must total no more than 8 MB.')
      setScreenshots((previous) => [...previous, screenshot])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Screenshot could not be captured.')
    } finally {
      setBusy(false)
    }
  }
  async function chooseFiles() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const selected = await window.desktop.chooseBugFiles()
      if (
        files.length + selected.length > 10 ||
        [...screenshots, ...files, ...selected].reduce((sum, file) => sum + file.size, 0) >
          8 * 1024 * 1024
      )
        throw new Error(
          'Use at most 10 files, with screenshots and attachments totaling no more than 8 MB.',
        )
      setFiles((previous) => [...previous, ...selected])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Files could not be attached.')
    } finally {
      setBusy(false)
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
      const attachments = [...files]

      if (
        attachments.length > 10 ||
        [...attachments, ...screenshots].reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024
      )
        throw new Error('Use at most 10 files and 8 MB combined.')
      await window.desktop.submitBugReport({
        requestId,
        subject: subject.trim(),
        priority,
        message: message.trim(),
        context,
        screenshots,
        files: attachments,
        ...(login ? { replyEmail: replyEmail.trim() } : {}),
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
          <h1>{login ? 'Contact support' : 'Report a bug'}</h1>
          <p>Send a support ticket with the details of the issue.</p>
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
            <strong>{login ? replyEmail.trim() : context?.email}</strong> for follow-up
            communication.
          </p>
          <button className="primary" onClick={() => void window.desktop.closeBugReport()}>
            Done
          </button>
        </section>
      ) : (
        <form
          id="support-ticket"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <p>
            Ticket descriptions may appear on public GitHub issues. Keep customer details out.
            Email, diagnostics and attachments stay private.
          </p>
          {login && (
            <label>
              Reply email
              <input
                type="email"
                required
                maxLength={254}
                value={replyEmail}
                disabled={busy}
                autoComplete="email"
                onChange={(event) => setReplyEmail(event.target.value)}
              />
            </label>
          )}
          <label>
            Subject
            <input
              id="ticket-subject"
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
                <p>Add up to five screenshots and 10 files, totaling no more than 8 MB.</p>
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
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove screenshot ${index + 1}`}
                      onClick={() =>
                        setScreenshots((previous) => previous.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </figure>
                ))}
              </div>
            )}
            {!!files.length && (
              <ul className="file-list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove file ${file.name}`}
                      onClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
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
                {login ? 'Login support · not signed in' : `Business ${context.business}`}
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
              {busy ? 'Sending…' : login ? 'Send support request' : 'Send bug report'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<BugReport />)
