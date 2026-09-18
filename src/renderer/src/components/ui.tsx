import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'amber' | 'red'
}) {
  return <span className={`badge ${tone}`}>{children}</span>
}
export function QueryState({ loading, error }: { loading: boolean; error?: string }) {
  if (error)
    return (
      <div className="empty" role="alert">
        <AlertCircle size={24} />
        <p>{error}</p>
        <button onClick={() => location.reload()}>Reload application</button>
      </div>
    )
  return loading ? (
    <div className="empty" role="status">
      Loading records…
    </div>
  ) : null
}
export function SectionTitle({
  title,
  description,
  action,
  onAction,
}: {
  title: string
  description?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  )
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* No member data or credentials are logged. */
  }
  render() {
    return this.state.failed ? (
      <main className="empty">
        <h1>This view could not be loaded.</h1>
        <p>Reload CERMS to try again.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    )
  }
}
