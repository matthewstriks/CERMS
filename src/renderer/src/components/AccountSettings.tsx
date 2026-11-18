import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAccountSettings,
  accountError,
  type AccountDetails,
} from '../../../data/firebase-account'
import { useMembershipSession } from '../lib/membership-session'
import './AccountSettings.css'
export default function AccountSettings() {
  const { reader, refreshProfile } = useMembershipSession()
  const client = useMemo(() => (reader ? createAccountSettings(reader.uid) : null), [reader?.uid])
  const [account, setAccount] = useState<AccountDetails | null>(null),
    [name, setName] = useState(''),
    [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState(''),
    [currentPassword, setCurrentPassword] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [cooldown, setCooldown] = useState(0)
  const pending = useRef(false),
    mounted = useRef(true),
    cooldownEnd = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function apply(value: AccountDetails) {
    setAccount(value)
    setName(value.displayName)
    setEmail(value.email)
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    if (client)
      void client
        .get()
        .then((value) => {
          if (active) apply(value)
        })
        .catch((failure) => {
          if (active) setError(accountError(failure))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    return () => {
      active = false
    }
  }, [client])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(
      () => setCooldown(() => Math.max(0, Math.ceil((cooldownEnd.current - Date.now()) / 1000))),
      1000,
    )
    return () => clearTimeout(timer)
  }, [cooldown])
  function startCooldown() {
    cooldownEnd.current = Date.now() + 60000
    setCooldown(60)
  }
  async function run(action: () => Promise<void>) {
    if (pending.current || !client) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (failure) {
      if (mounted.current) setError(accountError(failure))
    } finally {
      pending.current = false
      if (mounted.current) {
        setBusy(false)
        setEmailPassword('')
        setCurrentPassword('')
        setPassword('')
        setConfirm('')
      }
    }
  }
  if (!reader || !client) return null
  return (
    <section
      className="panel settings-card full-width account-settings"
      aria-labelledby="account-settings-title"
    >
      <h2 id="account-settings-title">Account settings</h2>
      <p>Email and password changes also apply to your legacy CERMS login.</p>
      {loading && <p role="status">Loading account…</p>}
      {account && (
        <fieldset disabled={busy || loading}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                await client.saveName(name, account.version)
                apply(await client.get())
                setNotice('Display name saved.')
                await refreshProfile()
              })
            }}
          >
            <label>
              Display name
              <input
                required
                maxLength={200}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button type="submit">Save display name</button>
          </form>
          <div className="account-verification">
            <p>
              <strong>{account.email}</strong> ·{' '}
              {account.emailVerified ? 'Verified' : 'Not verified'}
            </p>
            <div className="account-actions">
              {!account.emailVerified && (
                <button
                  type="button"
                  disabled={cooldown > 0}
                  onClick={() =>
                    void run(async () => {
                      await client.verify()
                      startCooldown()
                      setNotice(`Verification email sent to ${account.email}.`)
                    })
                  }
                >
                  {cooldown ? `Resend in ${cooldown}s` : 'Send verification email'}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const value = await client.refreshVerification()
                    apply(value)
                    setNotice(
                      value.emailVerified
                        ? 'Email verified. Profile email is up to date.'
                        : 'Email is not verified yet. Check your inbox.',
                    )
                    await refreshProfile()
                  })
                }
              >
                Refresh verification
              </button>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                if (email.trim().toLowerCase() === account.email.toLowerCase())
                  throw Error('Enter a different email address.')
                await client.changeEmail(email, emailPassword)
                startCooldown()
                setNotice(
                  `Confirm the link sent to ${email.trim()}. Your login email changes after verification, then click Refresh verification.`,
                )
              })
            }}
          >
            <h3>Change email</h3>
            <label>
              New email
              <input
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Current password for email change
              <input
                type="password"
                required
                autoComplete="current-password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
              />
            </label>
            <button type="submit" disabled={cooldown > 0}>
              Send email change link
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                if (password !== confirm) throw Error('New passwords do not match.')
                await client.changePassword(currentPassword, password)
                setNotice('Password changed.')
              })
            }}
          >
            <h3>Change password</h3>
            <label>
              Current password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <small>Use 12–128 characters.</small>
            <button type="submit">Change password</button>
          </form>
        </fieldset>
      )}
      {busy && <p role="status">Saving…</p>}
      {error && (
        <>
          <p role="alert">{error}</p>
          {account && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  apply(await client.get())
                })
              }
            >
              Reload account
            </button>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loading && !account && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              apply(await client.get())
            })
          }
        >
          Retry account settings
        </button>
      )}
    </section>
  )
}
