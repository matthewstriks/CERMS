import { useState } from 'react'
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
            <dd>Read only</dd>
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
      </section>
      <section className="panel settings-card full-width">
        <SectionTitle title="Administration" />
        <div className="settings-roadmap">
          {['Staff & permissions', 'Club preferences', 'Integrations'].map((title) => (
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
