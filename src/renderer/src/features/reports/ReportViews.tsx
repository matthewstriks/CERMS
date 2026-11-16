import { useMemo, useState } from 'react'
import {
  type ReportData,
  summarizeSales,
  summarizeMembers,
  summarizeRentals,
} from '../../../../domain/reports'
import { displayReference, matchesDisplayReference } from '../../../../domain/display-reference'
import { paymentMethods, type SaleReceipt } from '../../../../domain/pos'
import { money } from '../../lib/data'
import {
  ReportPanel,
  ReportMetric,
  ReportTable,
  ReportChart,
  ReportUnavailable,
} from './ReportWidgets'
export type SalesSummary = ReturnType<typeof summarizeSales>
export function SalesOverview({ sales }: { sales: SalesSummary }) {
  return (
    <>
      <div className="report-metrics">
        <ReportMetric
          label="Net sales before tax"
          value={money(sales.net / 100)}
          current={sales.net}
          previous={sales.previous.net}
        />
        <ReportMetric
          label="Completed transactions"
          value={sales.orders.toLocaleString()}
          current={sales.orders}
          previous={sales.previous.orders}
        />
        <ReportMetric
          label="Collected after payouts"
          value={money(sales.collected / 100)}
          current={sales.collected}
          previous={sales.previous.collected}
        />
        <ReportMetric
          label="Average transaction"
          value={money(sales.average / 100)}
          detail="Includes tax and payouts"
        />
      </div>
      <ReportPanel
        title="Daily sales"
        description="Net sales before tax. Payouts reduce sales; negative days appear below the baseline."
      >
        <ReportChart
          label="Daily net sales before tax"
          currency
          points={sales.days.map((d) => ({ label: d.day, value: d.net }))}
        />
      </ReportPanel>
      <div className="report-two-col">
        <ReportPanel title="Sales reconciliation">
          <dl className="report-totals">
            <dt>Gross sales before payouts and tax</dt>
            <dd>{money(sales.gross / 100)}</dd>
            <dt>Payouts before tax</dt>
            <dd>{money(sales.payouts / 100)}</dd>
            <dt>Net sales before tax</dt>
            <dd>{money(sales.net / 100)}</dd>
            <dt>Net tax recorded</dt>
            <dd>{money(sales.tax / 100)}</dd>
            <dt>Collected after payouts</dt>
            <dd>{money(sales.collected / 100)}</dd>
            <dt>Cash handed over</dt>
            <dd>{money(sales.cashReceived / 100)}</dd>
            <dt>Change given</dt>
            <dd>{money(sales.change / 100)}</dd>
          </dl>
        </ReportPanel>
        <ReportPanel
          title="Membership and rental sales"
          description="Units fulfilled by completed orders in this period. These are purchases, not a historical member headcount."
        >
          <dl className="report-totals">
            <dt>New memberships</dt>
            <dd>{sales.newMemberships}</dd>
            <dt>Membership renewal units</dt>
            <dd>{sales.renewals}</dd>
            <dt>New rental units</dt>
            <dd>{sales.rentalUnits}</dd>
            <dt>Rental renewal units</dt>
            <dd>{sales.rentalRenewals}</dd>
          </dl>
        </ReportPanel>
      </div>
    </>
  )
}
export function SalesDetail({
  sales,
  onReceipt,
}: {
  sales: SalesSummary
  onReceipt(r: SaleReceipt): void
}) {
  const [search, setSearch] = useState('')
  const products = useMemo(
    () =>
      sales.products.map((p) => ({
        key: p.id,
        cells: [
          p.name,
          p.kind,
          p.units,
          money(p.net / 100),
          money(p.tax / 100),
          money(p.collected / 100),
        ],
      })),
    [sales],
  )
  const staff = useMemo(
    () =>
      sales.cashiers.map((p) => ({
        key: p.id,
        cells: [p.name, p.orders, money(p.net / 100), money(p.tax / 100), money(p.collected / 100)],
      })),
    [sales],
  )
  const receipts = useMemo(
    () =>
      sales.selected
        .filter(
          (r) =>
            !search.trim() ||
            matchesDisplayReference('order', r.receiptNumber, search) ||
            `${r.cashierName} ${r.customerName} ${r.id}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        )
        .map((r) => ({
          key: r.id,
          cells: [
            new Date(r.createdAt).toLocaleString(),
            displayReference('order', r.receiptNumber),
            r.cashierName,
            money(r.totalCents / 100),
            <button
              key={r.id}
              onClick={() => onReceipt(r)}
              aria-label={`View receipt ${displayReference('order', r.receiptNumber)}`}
            >
              View receipt
            </button>,
          ],
        })),
    [sales, search, onReceipt],
  )
  return (
    <>
      <ReportPanel
        title="Payment methods"
        description="Incoming amounts are applied payments, excluding cash change. Card payments are recorded external payments."
      >
        <ReportTable
          label="Payment methods"
          headings={['Method', 'Incoming', 'Outgoing', 'Net collected']}
          rows={sales.methods.map((p) => ({
            key: p.method,
            cells: [
              paymentMethods[p.method],
              money(p.incoming / 100),
              money(p.outgoing / 100),
              money(p.net / 100),
            ],
          }))}
        />
      </ReportPanel>
      <ReportPanel
        title="Product performance"
        description="Saved receipt names and product types; retained even when a product has been deleted. Payout units are shown separately by type."
      >
        <ReportTable
          label="Product performance"
          headings={['Product', 'Type', 'Units', 'Net before tax', 'Tax', 'Total']}
          rows={products}
        />
      </ReportPanel>
      <ReportPanel
        title="Cashier performance"
        description="Completed transactions and recorded collections, including payouts. Staff names come from saved receipts."
      >
        <ReportTable
          label="Cashier performance"
          headings={['Cashier', 'Transactions', 'Net before tax', 'Tax', 'Collected']}
          rows={staff}
        />
      </ReportPanel>
      <ReportPanel title="Receipt detail">
        <label className="report-search">
          Find a receipt
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order reference, cashier or customer"
          />
        </label>
        <ReportTable
          label="Receipt detail"
          headings={['Completed', 'Order', 'Cashier', 'Collected', 'Details']}
          rows={receipts}
        />
      </ReportPanel>
    </>
  )
}
export function MembershipReport({
  data,
  sales,
}: {
  data: ReportData
  sales: SalesSummary | null
}) {
  const rows = data.members.rows
  const stats = useMemo(
    () => (rows ? summarizeMembers(rows, data.loadedAt, data.range) : null),
    [rows, data.loadedAt, data.range],
  )
  const expiryRows = useMemo(
    () =>
      (stats?.expiring ?? []).map((m) => ({
        key: m.id,
        cells: [m.name, m.number || '—', m.plan, new Date(m.expiresAt!).toLocaleString()],
      })),
    [stats],
  )
  if (!stats)
    return <ReportUnavailable title="Membership snapshot unavailable" error={data.members.error!} />
  return (
    <>
      <div className="report-metrics">
        <ReportMetric
          label="Active memberships now"
          value={stats.active}
          detail="Future expiration; excludes DNA"
        />
        <ReportMetric
          label="Expired memberships now"
          value={stats.expired}
          detail="Excludes DNA and unknown expirations"
        />
        <ReportMetric label="Expiring in 7 days" value={stats.next7} detail="Active members only" />
        <ReportMetric
          label="New memberships sold"
          value={sales?.newMemberships ?? 'Unavailable'}
          detail="Completed orders in selected dates"
        />
      </div>
      <ReportPanel
        title="Current member base"
        description={`Snapshot at ${new Date(data.loadedAt).toLocaleString()}. These counts are current, regardless of the selected historical dates.`}
      >
        <dl className="report-totals">
          <dt>Total current member records</dt>
          <dd>{stats.total}</dd>
          <dt>Active</dt>
          <dd>{stats.active}</dd>
          <dt>Expired</dt>
          <dd>{stats.expired}</dd>
          <dt>Do not admit</dt>
          <dd>{stats.dna}</dd>
          <dt>Unknown expiration (excluding DNA)</dt>
          <dd>{stats.unknown}</dd>
          <dt>Current records created in selected dates</dt>
          <dd>{stats.created}</dd>
          <dt>Renewal units sold in selected dates</dt>
          <dd>{sales?.renewals ?? 'Unavailable'}</dd>
        </dl>
        <p className="report-description">
          Deleted members are absent from the current base. An expired membership may still check in
          after optional renewal is offered.
        </p>
      </ReportPanel>
      <ReportPanel
        title="Memberships expiring in 30 days"
        description="A current follow-up list, ordered by expiration. Do not admit members are excluded."
      >
        <ReportTable
          label="Memberships expiring in 30 days"
          headings={['Member', 'Number', 'Membership', 'Expires']}
          rows={expiryRows}
          empty="No active memberships expire in the next 30 days."
        />
      </ReportPanel>
    </>
  )
}
export function RentalReport({ data }: { data: ReportData }) {
  const rows = data.rentals.rows
  const stats = useMemo(
    () => (rows ? summarizeRentals(rows, data.loadedAt, data.range) : null),
    [rows, data.loadedAt, data.range],
  )
  const typeRows = useMemo(
    () => (stats?.types ?? []).map((r) => ({ key: r.name, cells: [r.name, r.starts] })),
    [stats],
  )
  if (!stats)
    return <ReportUnavailable title="Rental activity unavailable" error={data.rentals.error!} />
  return (
    <>
      <div className="report-metrics">
        <ReportMetric
          label="Rental starts"
          value={stats.starts}
          current={stats.starts}
          previous={stats.priorStarts}
        />
        <ReportMetric
          label="Unique visiting members"
          value={stats.uniqueMembers}
          detail="Members with a recorded rental start"
        />
        <ReportMetric
          label="Active rentals now"
          value={stats.active}
          detail={`${stats.inside} inside · ${stats.waiting} waiting`}
        />
        <ReportMetric
          label="Overdue rentals now"
          value={stats.overdue}
          detail="Active rentals past their expiry"
        />
      </div>
      <ReportPanel
        title="Rental demand by day"
        description="Each rental activity record is one start; several rentals for the same member count separately. Paid extensions do not create another start."
      >
        <ReportChart
          label="Daily rental starts"
          points={stats.days.map((d) => ({ label: d.day, value: d.starts }))}
        />
      </ReportPanel>
      <ReportPanel
        title="Arrival hours"
        description="Rental starts by local hour, useful for staffing. This measures arrivals, not occupancy or capacity utilization."
      >
        <ReportChart
          label="Rental starts by hour"
          points={stats.hours.map((h) => ({
            label: `${String(h.hour).padStart(2, '0')}:00`,
            value: h.starts,
          }))}
        />
      </ReportPanel>
      <ReportPanel title="Rental type demand">
        <ReportTable
          label="Rental type demand"
          headings={['Rental type', 'Starts']}
          rows={typeRows}
        />
      </ReportPanel>
      {!!stats.missingDates && (
        <p className="report-description">
          {stats.missingDates} rental records have no usable arrival time and are excluded from
          date-based totals.
        </p>
      )}
      <p className="report-description">
        Current active, inside, waiting and overdue counts use the refresh time, rather than
        historical occupancy. Only rental activity stored in CERMS 5 is included.
      </p>
    </>
  )
}
export function RegisterReport({ data }: { data: ReportData }) {
  const rows = data.registers.rows
  const tableRows = useMemo(
    () =>
      (rows ?? []).map(({ record: r, totals: t, hasLedger }) => ({
        key: r.id,
        cells: [
          displayReference('register', r.id),
          r.ownerName,
          new Date(r.closedAt!).toLocaleString(),
          money(r.openingTotalCents / 100),
          money(t.expectedCashCents / 100),
          money(r.closingTotalCents! / 100),
          <span
            key="variance"
            className={r.closingTotalCents! - t.expectedCashCents === 0 ? '' : 'report-variance'}
          >
            {money((r.closingTotalCents! - t.expectedCashCents) / 100)}
          </span>,
          r.closedByName || 'Not recorded',
          hasLedger ? t.saleCount : 'No POS ledger',
        ],
      })),
    [rows],
  )
  if (!rows)
    return (
      <ReportUnavailable title="Register closeouts unavailable" error={data.registers.error!} />
    )
  const variance = rows.reduce(
    (sum, r) => sum + r.record.closingTotalCents! - r.totals.expectedCashCents,
    0,
  )
  const discrepancies = rows.filter(
    (r) => r.record.closingTotalCents !== r.totals.expectedCashCents,
  ).length
  return (
    <>
      <div className="report-metrics">
        <ReportMetric
          label="Registers closed"
          value={rows.length}
          detail="Closed during selected dates"
        />
        <ReportMetric
          label="Net cash over / short"
          value={money(variance / 100)}
          detail="Counted cash less expected cash"
        />
        <ReportMetric
          label="Registers with a variance"
          value={discrepancies}
          detail="Nonzero over or short"
        />
      </div>
      <ReportPanel
        title="Register closeout reconciliation"
        description="Registers closed in the selected dates. Cash and transaction totals cover each entire shift, including sales before the start date. Positive variance is over; negative is short."
      >
        <ReportTable
          label="Register closeout reconciliation"
          headings={[
            'Register',
            'Opened by',
            'Closed',
            'Opening cash',
            'Expected cash',
            'Counted cash',
            'Over / short',
            'Closed by',
            'Transactions',
          ]}
          rows={tableRows}
        />
        <p className="report-description">
          If no POS ledger exists, expected cash is the saved opening cash. Open registers are
          excluded. Review individual drawers in Registers.
        </p>
      </ReportPanel>
    </>
  )
}
