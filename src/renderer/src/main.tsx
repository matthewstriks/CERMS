import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuthGate from './features/AuthGate'
import { ErrorBoundary } from './components/ui'
import './styles.css'
import { MembershipSessionProvider } from './lib/membership-session'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MembershipSessionProvider>
        <AuthGate />
      </MembershipSessionProvider>
    </ErrorBoundary>
  </StrictMode>,
)
