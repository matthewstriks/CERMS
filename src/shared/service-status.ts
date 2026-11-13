export type ServiceTone = 'green' | 'yellow' | 'red'
export interface ServiceStatusRow {
  id: string
  name: string
  tone: ServiceTone
  detail: string
}
export interface ServiceStatus {
  checkedAt: number
  rows: ServiceStatusRow[]
}
export const statusServices = [
  { id: 'internet', name: 'Internet' },
  { id: 'auth', name: 'Auth' },
  { id: 'database', name: 'Database' },
  { id: 'backend', name: 'API' },
  { id: 'storage', name: 'Storage' },
] as const
export function overallServiceTone(rows: readonly ServiceStatusRow[]): ServiceTone {
  return rows.some((r) => r.tone === 'red')
    ? 'red'
    : !rows.length || rows.some((r) => r.tone === 'yellow')
      ? 'yellow'
      : 'green'
}
export function pendingServiceStatus(detail = 'Checking…'): ServiceStatusRow[] {
  return statusServices.map((s) => ({ ...s, tone: 'yellow', detail }))
}
