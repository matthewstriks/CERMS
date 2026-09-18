import BrandLogo from './components/BrandLogo'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChevronRight, LogOut } from 'lucide-react'
import { modules } from './lib/modules'
import type { ModuleId } from './lib/modules'
import { Badge } from './components/ui'
import { useQuery } from './lib/data'
import SystemSwitcher from './components/SystemSwitcher'
import { canSwitchSystems } from '../../shared/firebase-policy'
import { useMembershipSession } from './lib/membership-session'
const Activity = lazy(() => import('./features/Activity'))
const Members = lazy(() => import('./features/Members'))
const Settings = lazy(() => import('./features/Settings'))

function readRoute(): ModuleId {
  const id = window.location.hash.slice(1)
  return modules.find((module) => module.id === id)?.id ?? 'overview'
}
export default function App() {
  const membership = useMembershipSession()
  const info = useQuery(() => window.desktop.getAppInfo(), [])
  const [route, setRoute] = useState<ModuleId>(readRoute)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const sync = () => setRoute(readRoute())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    title.current?.focus()
    document.title = `CERMS · ${modules.find((module) => module.id === route)?.label}`
  }, [route])
  const current = modules.find((module) => module.id === route) ?? modules[0]
  const readOnlyPage = route === 'members' || route === 'activity' || route === 'overview'
  return (
    <div className="app-layout">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          title.current?.focus()
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <BrandLogo />
          <div>
            CERMS<span>CLUB MANAGEMENT</span>
          </div>
        </div>
        <div className="club-switcher">
          <div className="club-avatar">{membership.reader?.club.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{membership.reader?.club}</strong>
            <span>Signed in</span>
          </div>
        </div>
        {canSwitchSystems(membership.reader?.uid) && <SystemSwitcher />}
        <nav aria-label="Main navigation">
          {['Workspace', 'Operations', 'Insights', 'Administration'].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-label">{group}</div>
              {modules
                .filter((module) => module.group === group)
                .map((module) => (
                  <a
                    key={module.id}
                    href={`#${module.id}`}
                    className={`nav-item ${route === module.id ? 'active' : ''}`}
                    aria-current={route === module.id ? 'page' : undefined}
                  >
                    <module.icon size={18} />
                    {module.label}
                    {route === module.id && <span className="active-dot" />}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar staff-avatar">
            {membership.reader?.staffName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <strong>{membership.reader?.staffName}</strong>
            <small>Staff account</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              void membership.disconnect().catch(() => window.location.reload())
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-layout">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <span>{current.label}</span>
          </div>
          <div className="topbar-right">CERMS {info.data?.version ?? '…'}</div>
        </header>
        <main id="main-content">
          {membership.sessionError && (
            <p className="inline-error" role="alert">
              {membership.sessionError}
            </p>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">CLUB ENTERTAINMENT RECORD MANAGEMENT SYSTEM</div>
              <h1 tabIndex={-1} ref={title}>
                {current.label}
              </h1>
              <p>{current.description}</p>
            </div>
            {readOnlyPage && <Badge>Read only</Badge>}
          </div>
          <Suspense
            fallback={
              <div className="empty" role="status">
                Loading workspace…
              </div>
            }
          >
            {route === 'overview' || route === 'activity' ? (
              <Activity showRentalAlerts={route === 'overview'} />
            ) : route === 'members' ? (
              <Members />
            ) : route === 'settings' ? (
              <Settings />
            ) : (
              <section className="panel unavailable-module">
                <current.icon size={28} aria-hidden="true" />
                <h2>Not implemented yet</h2>
                <p>{current.label} is not available yet.</p>
              </section>
            )}
          </Suspense>
          <footer className="content-footer">
            <span>CERMS · Club Entertainment Record Management System</span>
            <span>Version {info.data?.version ?? '…'}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
