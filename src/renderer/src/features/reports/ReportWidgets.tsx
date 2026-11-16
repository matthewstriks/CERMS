import { useEffect, useState, type ReactNode } from 'react'
import { comparison } from '../../../../domain/reports'
import { money } from '../../lib/data'

export function ReportMetric({
  label,
  value,
  detail,
  previous,
  current,
}: {
  label: string
  value: ReactNode
  detail?: string
  previous?: number
  current?: number
}) {
  return (
    <div className="report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {previous !== undefined && current !== undefined ? comparison(current, previous) : detail}
      </small>
    </div>
  )
}
export function ReportTable({
  label,
  headings,
  rows,
  empty = 'No records in this report.',
  pageSize = 15,
}: {
  label: string
  headings: string[]
  rows: { key: string; cells: ReactNode[] }[]
  empty?: string
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [rows])
  const pages = Math.ceil(rows.length / pageSize),
    current = Math.min(page, Math.max(0, pages - 1))
  return (
    <div className="report-table-block">
      <div className="table-scroll">
        <table>
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {headings.map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * pageSize, (current + 1) * pageSize).map((r) => (
              <tr key={r.key}>
                {r.cells.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="report-empty">{empty}</p>}
      {pages > 1 && (
        <div className="report-pagination" role="group" aria-label={`${label} pages`}>
          <span>
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, rows.length)} of{' '}
            {rows.length}
          </span>
          <button disabled={current === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button disabled={current + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
export function ReportChart({
  label,
  points,
  currency = false,
}: {
  label: string
  points: { label: string; value: number }[]
  currency?: boolean
}) {
  const width = 900,
    height = 220,
    baseline = 178,
    top = 16
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value))),
    negative = points.some((p) => p.value < 0)
  const zero = negative ? 110 : baseline,
    span = negative ? 82 : baseline - top
  const step = (width - 32) / Math.max(1, points.length),
    bar = Math.max(1, step * 0.65)
  const format = (v: number) => (currency ? money(v / 100) : v.toLocaleString())
  const labels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].filter(
    (i) => i >= 0,
  )
  return (
    <figure className="report-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        <desc>{points.length} intervals. Exact values are in the data table below.</desc>
        <line x1={16} x2={width - 16} y1={zero} y2={zero} className="report-chart-axis" />
        {points.map((p, i) => {
          const h = (Math.abs(p.value) / max) * span
          return (
            <rect
              key={`${p.label}:${i}`}
              x={16 + step * i + (step - bar) / 2}
              y={p.value >= 0 ? zero - h : zero}
              width={bar}
              height={h}
              rx={Math.min(3, bar / 3)}
              className={p.value < 0 ? 'negative' : ''}
            >
              <title>
                {p.label}: {format(p.value)}
              </title>
            </rect>
          )
        })}
        {labels.map((i) => (
          <text key={i} x={16 + step * (i + 0.5)} y={210} textAnchor="middle">
            {points[i]?.label}
          </text>
        ))}
        <text x={16} y={12}>
          {format(max)}
        </text>
      </svg>
      <details>
        <summary>View chart data</summary>
        <ReportTable
          label={label}
          headings={['Interval', currency ? 'Net sales before tax' : 'Rental starts']}
          rows={points.map((p, i) => ({ key: String(i), cells: [p.label, format(p.value)] }))}
        />
      </details>
    </figure>
  )
}
export function ReportPanel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="panel report-panel">
      <h2>{title}</h2>
      {description && <p className="report-description">{description}</p>}
      {children}
    </section>
  )
}
export function ReportUnavailable({ title, error }: { title: string; error: string }) {
  return (
    <ReportPanel title={title}>
      <p className="inline-error" role="alert">
        {error}
      </p>
      <p>Refresh reports to retry. Other available reports remain usable.</p>
    </ReportPanel>
  )
}
