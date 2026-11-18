import AccountSettings from '../components/AccountSettings'
import AssistantSettings from '../components/AssistantSettings'
import NotificationSoundSettings from '../components/NotificationSoundSettings'
import { UpdateSettings } from '../components/AppUpdates'
import { ownerUid } from '../../../domain/staff-permissions'
import { useEffect, useState } from 'react'
import { createInventoryEmailSettings } from '../../../data/firebase-inventory-email'
import type { MembershipReader } from '../../../data/membership-contracts'
import {
  inventoryRecipients,
  type InventoryEmailSettings,
} from '../../../shared/inventory-email-policy'
import { useQuery } from '../lib/data'
import { QueryState, SectionTitle } from '../components/ui'
import { useMembershipSession } from '../lib/membership-session'

export default function Settings() {
  const [aboutError, setAboutError] = useState('')
  const { reader } = useMembershipSession()
  const { data, loading, error } = useQuery(() => window.desktop.getAppInfo(), [])
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <SectionTitle title="Your account" />
        <dl className="details">
          <div>
            <dt>Staff member</dt>
            <dd>{reader?.staffName}</dd>
          </div>
          <div>
            <dt>Club</dt>
            <dd>{reader?.club}</dd>
          </div>
          <div>
            <dt>Membership access</dt>
            <dd>{reader?.uid === ownerUid ? 'Owner · Full access' : 'See Users & permissions'}</dd>
          </div>
        </dl>
      </section>
      <section className="panel settings-card">
        <SectionTitle title="Application" />
        <QueryState loading={loading} error={error} />
        {data && (
          <dl className="details">
            <div>
              <dt>Name</dt>
              <dd>CERMS</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{data.version}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>
                {({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[
                  data.platform
                ] ?? data.platform}
              </dd>
            </div>
          </dl>
        )}
        <button
          onClick={() => {
            void window.desktop
              .openAbout()
              .catch(() => setAboutError('Unable to open About CERMS. Please try again.'))
          }}
        >
          About CERMS
        </button>
        {aboutError && <p role="alert">{aboutError}</p>}
        <UpdateSettings />
      </section>
      <AccountSettings key={reader?.uid} />
      <NotificationSoundSettings />
      <AssistantSettings />
      {reader?.uid === ownerUid && (
        <InventoryEmailPreferences key={`${reader.uid}:${reader.club}`} reader={reader} />
      )}
      <section className="panel settings-card full-width">
        <SectionTitle title="Administration" />
        <p>
          <a href="#staff">Manage users & permissions</a>
        </p>
        <div className="settings-roadmap">
          {['Club preferences', 'Integrations'].map((title) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>Not implemented yet.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function InventoryEmailPreferences({ reader }: { reader: MembershipReader }) {
  const [saved, setSaved] = useState<InventoryEmailSettings | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [recipients, setRecipients] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setNotice('')
    void createInventoryEmailSettings(reader)
      .get()
      .then((value) => {
        if (!active) return
        setSaved(value)
        setEnabled(value.enabled)
        setRecipients(value.recipients.join('\n'))
      })
      .catch((failure) => {
        if (active)
          setError(failure instanceof Error ? failure.message : 'Unable to load inventory emails.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reader.uid, reader.club, reload])
  async function save() {
    if (!saved || saving) return
    setError('')
    setNotice('')
    try {
      const addresses = inventoryRecipients(recipients)
      if (enabled && !addresses.length)
        throw Error('Add at least one recipient before enabling alerts.')
      setSaving(true)
      const value = await createInventoryEmailSettings(reader).save(
        enabled,
        addresses,
        saved.revision,
      )
      setSaved(value)
      setEnabled(value.enabled)
      setRecipients(value.recipients.join('\n'))
      setNotice(
        value.enabled
          ? 'Inventory alerts saved. Current low stock will be checked in the background.'
          : 'Inventory email alerts are off.',
      )
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Inventory settings could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="panel settings-card full-width" aria-labelledby="inventory-email-title">
      <SectionTitle title="Low inventory emails" />
      <h3 id="inventory-email-title">Recipients for {reader.club}</h3>
      <p>
        Use each product's Inventory warning level in Products. Active products with tracked stock
        alert at or below that level, including zero. A blank warning level disables that product's
        alerts.
      </p>
      {loading ? (
        <p role="status">Loading inventory email settings…</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="checkbox">
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving || !saved}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable low inventory emails
          </label>
          <label htmlFor="inventory-email-recipients">Email recipients</label>
          <textarea
            id="inventory-email-recipients"
            rows={4}
            maxLength={5200}
            value={recipients}
            disabled={saving || !saved}
            onChange={(event) => setRecipients(event.target.value)}
            placeholder="manager@example.com\nstock@example.com"
          />
          <p>
            Enter up to 20 email addresses, separated by commas or new lines. Each receives a
            separate email. Further sales while a product stays low do not repeat alerts;
            replenishing above the warning level rearms them.
          </p>
          <div className="button-row">
            <button className="primary" type="submit" disabled={saving || !saved}>
              {saving ? 'Saving…' : 'Save inventory alerts'}
            </button>
            <button type="button" disabled={saving} onClick={() => setReload((v) => v + 1)}>
              Reload settings
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!loading && !saved && (
        <button onClick={() => setReload((v) => v + 1)}>Retry loading inventory emails</button>
      )}
    </section>
  )
}
