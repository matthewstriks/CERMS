import BrandLogo from './components/BrandLogo'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, Copy, ArrowUpRight } from 'lucide-react'
import type { AboutInfo } from '../../shared/desktop'
import './about.css'

function About() {
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void window.desktop
          .closeAbout()
          .catch(() => setError('Use the window close button to close this window.'))
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])
  useEffect(() => {
    void window.desktop
      .getAboutInfo()
      .then(setInfo)
      .catch(() => setError('Application details could not be loaded.'))
  }, [])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])
  const platform = info
    ? (({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[
        info.platform
      ] ?? info.platform)
    : 'Desktop'
  return (
    <main className="about-window">
      <section className="about-hero" aria-labelledby="about-title">
        <div className="about-orbit orbit-one" aria-hidden="true" />
        <div className="about-orbit orbit-two" aria-hidden="true" />
        <div className="about-kicker">CLUB OPERATIONS</div>
        <BrandLogo className="about-mark" />
        <h1 id="about-title">
          CERMS<span className="about-period">.</span>
        </h1>
        <p>
          Club Entertainment
          <br />
          Record Management System
        </p>
        <span className="about-version">Version {info?.version ?? '…'}</span>
        <span className="about-edition">
          DESKTOP APPLICATION <ArrowUpRight size={13} aria-hidden="true" />
        </span>
      </section>
      <section className="about-information" aria-label="Application information">
        <dl>
          <div>
            <dt>Developed by</dt>
            <dd>{info?.author ?? 'Loading…'}</dd>
          </div>
          <div>
            <dt>Made for</dt>
            <dd>{platform}</dd>
          </div>
        </dl>
        <div className="about-rule" />
        <div className="about-footer">
          <button
            className="about-copy"
            disabled={!info}
            onClick={async () => {
              try {
                await window.desktop.copyAboutInfo()
                setCopied(true)
                setError('')
              } catch {
                setError('Unable to copy application details.')
              }
            }}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            <span aria-live="polite">{copied ? 'Details copied' : 'Copy app details'}</span>
          </button>
          <button
            className="about-done"
            autoFocus
            onClick={() => {
              void window.desktop
                .closeAbout()
                .catch(() => setError('Use the window close button to close this window.'))
            }}
          >
            Done
          </button>
        </div>
        {error && (
          <p className="about-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<About />)
