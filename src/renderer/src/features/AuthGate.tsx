import BrandLogo from '../components/BrandLogo'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMembershipSession } from '../lib/membership-session'
import { useQuery } from '../lib/data'
const App = lazy(() => import('../App'))

export default function AuthGate() {
  const session = useMembershipSession()
  if (session.switching)
    return (
      <div className="system-transition" role="status">
        <h1>Switching system…</h1>
        <p>Loading your selected system.</p>
      </div>
    )
  return session.reader ? (
    <Suspense fallback={<div className="empty">Opening workspace…</div>}>
      <App />
    </Suspense>
  ) : (
    <Login />
  )
}
function Login() {
  const session = useMembershipSession()
  const info = useQuery(() => window.desktop.getAppInfo(), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [support, setSupport] = useState(false)
  useEffect(() => {
    document.title = 'CERMS · Sign in'
    void window.desktop
      .setWindowMode('login')
      .catch(() => setError('Unable to resize the login window. Restart the app to try again.'))
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (reset) {
        const { requestPasswordReset } = await import('../../../data/firebase-membership')
        await requestPasswordReset(email)
        setMessage(
          'If this email belongs to an account, a password reset link has been sent. Check your inbox and spam folder.',
        )
      } else {
        await session.connect(email.trim(), password)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to connect. Please try again.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }
  return (
    <main className="login-screen">
      <div className="login-brand">
        <BrandLogo />
        <strong>CERMS</strong>
        <p>
          Club Entertainment Record
          <br />
          Management System
        </p>
      </div>
      {session.sessionError && (
        <p className="inline-error" role="alert">
          {session.sessionError}
        </p>
      )}
      <section className="login-panel" aria-labelledby="login-heading">
        <h1 id="login-heading">{reset ? 'Reset your password' : 'Sign in to CERMS'}</h1>
        <p>
          {reset
            ? 'Enter your account email to receive a reset link.'
            : 'Welcome back. Sign in with your staff account.'}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
          {!reset && (
            <>
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="login-confirmation" role="status">
              {message}
            </p>
          )}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? (reset ? 'Sending…' : 'Signing in…') : reset ? 'Send reset link' : 'Sign in'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setReset(!reset)
              setPassword('')
              setError('')
              setMessage('')
            }}
          >
            {reset ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </form>
      </section>
      <footer className="login-footer">
        <button
          className="text-button"
          type="button"
          onClick={() => setSupport(!support)}
          aria-expanded={support}
        >
          Support
        </button>
        {support && (
          <p role="status">
            Support is not implemented yet. For now, contact your club administrator.
          </p>
        )}
        <span>Version {info.data?.version ?? (info.loading ? 'loading…' : 'unavailable')}</span>
      </footer>
    </main>
  )
}
