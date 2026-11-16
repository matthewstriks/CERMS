import { NotificationSoundProvider } from './lib/notification-sounds'
import AppUpdates from './components/AppUpdates'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuthGate from './features/AuthGate'
import { ErrorBoundary } from './components/ui'
import './styles.css'
import { MembershipSessionProvider } from './lib/membership-session'

const diagnosticLog: string[] = []
const addDiagnostic = (value: unknown) => {
  const text =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === 'string'
        ? value
        : (JSON.stringify(value) ?? String(value))
  diagnosticLog.push(text.slice(0, 2000))
  if (diagnosticLog.length > 100) diagnosticLog.shift()
}
const originalConsoleError = console.error.bind(console)
const originalConsoleWarn = console.warn.bind(console)
console.error = (...args) => {
  addDiagnostic(
    args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' '),
  )
  originalConsoleError(...args)
}
console.warn = (...args) => {
  addDiagnostic(
    args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' '),
  )
  originalConsoleWarn(...args)
}
window.addEventListener('error', (event) => addDiagnostic(event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => addDiagnostic(event.reason))
Object.defineProperty(window, '__cermsDiagnostics', {
  value: () => diagnosticLog.slice(),
  configurable: false,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MembershipSessionProvider>
        <NotificationSoundProvider>
          <AuthGate />
          <AppUpdates />
        </NotificationSoundProvider>
      </MembershipSessionProvider>
    </ErrorBoundary>
  </StrictMode>,
)
