import { requestNotificationSound } from './lib/notification-audio'
import { hasStaffPermission } from '../../domain/staff-permissions'
import BrandLogo from './components/BrandLogo'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, LogOut, Moon, Sun } from 'lucide-react'
import { modules } from './lib/modules'
import type { ModuleId } from './lib/modules'
import { Badge } from './components/ui'
import { useQuery } from './lib/data'
import SystemSwitcher from './components/SystemSwitcher'
import { canSwitchSystems } from '../../shared/firebase-policy'
import { canManageMembers } from '../../shared/member-management-policy'
import { canCreateDevMember } from '../../shared/dev-member-policy'
import { useMembershipSession } from './lib/membership-session'
const Activity = lazy(() => import('./features/Activity'))
const Members = lazy(() => import('./features/Members'))
const Products = lazy(() => import('./features/Products'))
const Registers = lazy(() => import('./features/Registers'))
const PointOfSale = lazy(() => import('./features/PointOfSale'))
const Staff = lazy(() => import('./features/Staff'))
const Reports = lazy(() => import('./features/Reports'))
const Messages = lazy(() => import('./features/Messages'))
const Settings = lazy(() => import('./features/Settings'))

function readRoute(): ModuleId {
  const id = window.location.hash.slice(1)
  return modules.find((module) => module.id === id)?.id ?? 'overview'
}
export default function App() {
  const membership = useMembershipSession()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const messagingUid = membership.reader?.uid
  const messagingBusiness = membership.reader?.club
  useEffect(() => {
    let active = true
    let stop: (() => void) | undefined
    setUnreadMessages(0)
    if (messagingUid && messagingBusiness && !membership.switching) {
      void import('../../data/firebase-messaging')
        .then((m) => {
          if (active)
            stop = m
              .createMessaging({ uid: messagingUid, club: messagingBusiness })
              .subscribeUnreadCount(
                (count) => {
                  if (active) setUnreadMessages(count)
                },
                () => {
                  if (active) requestNotificationSound('message')
                },
              )
        })
        .catch(() => {
          if (active) setUnreadMessages(0)
        })
    }
    return () => {
      active = false
      stop?.()
    }
  }, [messagingUid, messagingBusiness, membership.switching])
  const info = useQuery(() => window.desktop.getAppInfo(), [])
  const [route, setRoute] = useState<ModuleId>(readRoute)
  const [newMemberRequested, setNewMemberRequested] = useState(false)
  const consumeNewMember = useCallback(() => setNewMemberRequested(false), [])
  const canCreateMember = canCreateDevMember(
    membership.reader?.uid ?? '',
    membership.reader?.club ?? '',
  )
  useEffect(() => {
    const unsubscribe = window.desktop.onNewMember(() => {
      // Keep an open form's draft intact, and never stack native dialogs.
      if (!canCreateMember || membership.switching || document.querySelector('dialog[open]')) return
      setNewMemberRequested(true)
      window.location.hash = 'members'
      setRoute('members')
    })
    void window.desktop.setNewMemberAvailable(canCreateMember && !membership.switching)
    return () => {
      unsubscribe()
      void window.desktop.setNewMemberAvailable(false)
    }
  }, [canCreateMember, membership.switching])
  const canUsePos =
    !!membership.reader &&
    hasStaffPermission(membership.reader.uid, 'processSales', membership.reader.permissions)
  useEffect(() => {
    const unsubscribe = window.desktop.onNewOrder(() => {
      if (!canUsePos || membership.switching || document.querySelector('dialog[open]')) return
      window.location.hash = 'sales'
      setRoute('sales')
    })
    void window.desktop.setNewOrderAvailable(canUsePos && !membership.switching)
    return () => {
      unsubscribe()
      void window.desktop.setNewOrderAvailable(false)
    }
  }, [canUsePos, membership.switching])
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
  const staffNameParts = (membership.reader?.staffName ?? '').trim().split(/\s+/)
  const staffInitials = (
    (staffNameParts[0]?.[0] ?? '') +
    (staffNameParts.length > 1 ? (staffNameParts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase()
  const readOnlyPage =
    (route === 'members' &&
      !canManageMembers(
        membership.reader?.uid ?? '',
        membership.reader?.club ?? '',
        membership.reader?.permissions,
      )) ||
    ((route === 'activity' || route === 'overview') && !canUsePos)
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
                    {module.id === 'messages' && unreadMessages > 0 ? (
                      <span
                        className="nav-unread-badge"
                        title={`${unreadMessages} unread messages`}
                      >
                        <span aria-hidden="true">
                          {unreadMessages > 99 ? '99+' : unreadMessages}
                        </span>
                        <span className="sr-only">
                          {unreadMessages} unread {unreadMessages === 1 ? 'message' : 'messages'}
                        </span>
                      </span>
                    ) : route === module.id ? (
                      <span className="active-dot" />
                    ) : null}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar staff-avatar">{staffInitials}</div>
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
          <div className="topbar-right">
            <span>CERMS {info.data?.version ?? '…'}</span>
            <button
              className="theme-toggle"
              aria-label={
                membership.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              title={membership.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={membership.theme === 'dark'}
              disabled={membership.savingTheme || membership.switching}
              onClick={() => void membership.toggleTheme()}
            >
              {membership.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main id="main-content">
          {membership.themeError && (
            <p className="inline-error" role="alert">
              {membership.themeError}
            </p>
          )}
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
              <Members createRequested={newMemberRequested} onCreateHandled={consumeNewMember} />
            ) : route === 'sales' || route === 'history' ? (
              <PointOfSale
                key={`${membership.reader?.uid}:${membership.reader?.club}:${route}`}
                historyOnly={route === 'history'}
              />
            ) : route === 'products' ? (
              <Products key={`${membership.reader?.uid}:${membership.reader?.club}`} />
            ) : route === 'registers' ? (
              <Registers key={`${membership.reader?.uid}:${membership.reader?.club}`} />
            ) : route === 'staff' ? (
              <Staff key={`${membership.reader?.uid}:${membership.reader?.club}`} />
            ) : route === 'reports' ? (
              <Reports key={`${membership.reader?.uid}:${membership.reader?.club}`} />
            ) : route === 'messages' ? (
              <Messages key={`${membership.reader?.uid}:${membership.reader?.club}`} />
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
