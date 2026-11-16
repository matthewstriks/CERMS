import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw, CalendarRange } from 'lucide-react'
import { useMembershipSession } from '../lib/membership-session'
import { createReports } from '../../../data/firebase-reports'
import {
  reportDate,
  reportPreset,
  reportRange,
  summarizeSales,
  type ReportData,
  type ReportRange,
} from '../../../domain/reports'
import { reportExports, exportReport, type ReportExport } from '../../../domain/report-export'
import type { SaleReceipt } from '../../../domain/pos'
import ReceiptDialog from './pos/ReceiptDialog'
import {
  SalesOverview,
  SalesDetail,
  MembershipReport,
  RentalReport,
  RegisterReport,
} from './reports/ReportViews'
import { ReportUnavailable } from './reports/ReportWidgets'
import './reports/Reports.css'
const views = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales & payments' },
  { id: 'members', label: 'Memberships' },
  { id: 'rentals', label: 'Rental activity' },
  { id: 'registers', label: 'Register closeouts' },
] as const
export default function Reports() {
  const { reader } = useMembershipSession()
  const client = useMemo(() => (reader ? createReports(reader) : null), [reader])
  const initialRange = useMemo(() => reportPreset('month'), [])
  const [from, setFrom] = useState(initialRange.from),
    [through, setThrough] = useState(initialRange.through)
  const [view, setView] = useState<(typeof views)[number]['id']>('overview')
  const [data, setData] = useState<ReportData | null>(null),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [exportKind, setExportKind] = useState<ReportExport>('summary')
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null)
  const request = useRef<AbortController | null>(null)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  async function load(range: ReportRange) {
    if (!client) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setData(null)
    setError('')
    setNotice('')
    setReceipt(null)
    try {
      const result = await client.load(range, controller.signal)
      if (!controller.signal.aborted) setData(result)
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Reports could not be loaded. Please retry.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  useEffect(() => {
    void load(initialRange)
    return () => request.current?.abort()
  }, [client])
  const financial = useMemo(() => {
    if (!data?.sales.rows) return { sales: null, error: data?.sales.error }
    try {
      return { sales: summarizeSales(data.sales.rows, data.range), error: undefined }
    } catch (e) {
      return {
        sales: null,
        error: e instanceof Error ? e.message : 'Sales could not be summarized.',
      }
    }
  }, [data])
  const availableExports = reportExports.filter(
    (e) => data?.[e.source].rows && (e.source !== 'sales' || financial.sales),
  )
  const selectedExport = availableExports.find((e) => e.kind === exportKind) ?? availableExports[0]
  if (!reader) return null
  return (
    <div className="reports-workspace">
      <form
        className="panel report-filters"
        onSubmit={(event) => {
          event.preventDefault()
          try {
            void load(reportRange(from, through))
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Check the selected dates.')
          }
        }}
      >
        <div className="report-filter-heading">
          <CalendarRange size={20} aria-hidden="true" />
          <div>
            <h2>Business performance</h2>
            <p>
              {reader.club} · Calendar dates use {timeZone}
            </p>
          </div>
        </div>
        <div className="report-presets" role="group" aria-label="Report date presets">
          {(
            [
              ['today', 'Today'],
              ['week', 'Last 7 days'],
              ['month', 'Last 30 days'],
              ['monthToDate', 'This month'],
            ] as const
          ).map(([kind, label]) => (
            <button
              type="button"
              disabled={loading}
              key={kind}
              onClick={() => {
                const range = reportPreset(kind)
                setFrom(range.from)
                setThrough(range.through)
                void load(range)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="report-range-inputs">
          <label>
            From
            <input
              aria-label="Report start date"
              type="date"
              value={from}
              max={through || reportDate(Date.now())}
              required
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Through
            <input
              aria-label="Report end date"
              type="date"
              value={through}
              min={from}
              max={reportDate(Date.now())}
              required
              onChange={(e) => setThrough(e.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />
            {data && data.range.from === from && data.range.through === through
              ? 'Refresh reports'
              : 'Apply dates'}
          </button>
          {loading && (
            <button
              type="button"
              onClick={() => {
                request.current?.abort()
                setLoading(false)
                setNotice('Loading canceled. Apply dates to try again.')
              }}
            >
              Cancel loading
            </button>
          )}
        </div>
        <p className="report-description">
          Up to 366 days. Sales compare with the immediately preceding equal number of calendar
          days.
        </p>
      </form>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" data-notification-sound>
          {notice}
        </p>
      )}
      {loading && (
        <div className="panel report-loading" role="status">
          <RefreshCw size={24} aria-hidden="true" />
          <h2>Preparing your reports</h2>
          <p>
            Loading complete date-range sales and closeouts, plus current business membership and
            rental records.
          </p>
        </div>
      )}
      {data && !loading && (
        <>
          <div className="report-context">
            <div>
              <strong>
                {data.range.from} through {data.range.through}
              </strong>
              <span>
                Previous: {reportDate(data.range.previousStart)} through{' '}
                {reportDate(data.range.start - 1)}
              </span>
              <span>Refreshed {new Date(data.loadedAt).toLocaleString()}</span>
            </div>
            <div className="report-export">
              <label className="sr-only" htmlFor="report-export-kind">
                Report to export
              </label>
              <select
                id="report-export-kind"
                disabled={!selectedExport}
                value={selectedExport?.kind ?? ''}
                onChange={(e) => setExportKind(e.target.value as ReportExport)}
              >
                {availableExports.length ? (
                  availableExports.map((e) => (
                    <option key={e.kind} value={e.kind}>
                      {e.label}
                    </option>
                  ))
                ) : (
                  <option value="">No reports available</option>
                )}
              </select>
              <button
                disabled={!selectedExport}
                onClick={() => {
                  if (!selectedExport) return
                  try {
                    const csv = exportReport(data, selectedExport.kind, timeZone)
                    const url = URL.createObjectURL(
                      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
                    )
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `cerms-${data.business}-${selectedExport.kind}-${data.range.from}-${data.range.through}.csv`
                    document.body.append(a)
                    a.click()
                    a.remove()
                    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
                    setNotice(`${selectedExport.label} CSV download started.`)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Report could not be exported.')
                  }
                }}
              >
                <Download size={15} aria-hidden="true" />
                Export CSV
              </button>
            </div>
          </div>
          {(data.range.from !== from || data.range.through !== through) && (
            <p role="status" className="report-scope-note">
              Dates changed. Apply dates to update these results; exports still use the displayed
              report period.
            </p>
          )}
          <div className="report-tabs" role="group" aria-label="Report views">
            {views.map((tab) => (
              <button
                key={tab.id}
                aria-pressed={view === tab.id}
                className={view === tab.id ? 'selected' : ''}
                onClick={() => setView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="report-view"
            aria-label={`${views.find((v) => v.id === view)?.label} report`}
          >
            {(view === 'overview' || view === 'sales') &&
              (financial.sales ? (
                view === 'overview' ? (
                  <SalesOverview sales={financial.sales} />
                ) : (
                  <SalesDetail sales={financial.sales} onReceipt={setReceipt} />
                )
              ) : (
                <ReportUnavailable
                  title="Sales report unavailable"
                  error={financial.error ?? 'Sales could not be loaded.'}
                />
              ))}
            {view === 'members' && <MembershipReport data={data} sales={financial.sales} />}
            {view === 'rentals' && <RentalReport data={data} />}
            {view === 'registers' && <RegisterReport data={data} />}
          </div>
          <p className="report-description report-footer-note">
            CERMS 5 records for this business only. Legacy database history is not included.
            Financial reports use completed receipts and recorded external payments; they are not
            profit or accounting statements. Membership and live-rental snapshots reflect the
            refresh time. CSV files open in Excel.
          </p>
        </>
      )}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
