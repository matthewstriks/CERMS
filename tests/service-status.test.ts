import { describe, expect, it, vi } from 'vitest'
import {
  checkServiceStatus,
  createServiceStatusMonitor,
  statusUrls,
} from '../src/main/service-status'
import { overallServiceTone } from '../src/shared/service-status'
const now = Date.parse('2026-11-13T18:00:00Z')
const incident = (title: string, status = 'SERVICE_DISRUPTION', extra = {}) => ({
  begin: '2026-11-13T17:00:00Z',
  end: null,
  service_name: 'Multiple Products',
  affected_products: [{ title }],
  status_impact: status,
  most_recent_update: { status },
  ...extra,
})
function fetcher(cloud: unknown = [], firebase: unknown = [], internet = 204) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('GET')
    expect(init?.redirect).toBe('error')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.body).toBeUndefined()
    expect(init?.credentials).toBeUndefined()
    expect(Object.keys(init?.headers ?? {})).toEqual(['Accept'])
    if (input === statusUrls.internet)
      return new Response(internet === 204 ? null : 'network login', { status: internet })
    if (input === statusUrls.cloud) return Response.json(cloud)
    if (input === statusUrls.firebase) return Response.json(firebase)
    throw new Error('Unexpected destination')
  }) as unknown as typeof fetch
}
describe('login service status', () => {
  it('checks only fixed public read-only URLs and reports no incidents without implying account validation', async () => {
    const f = fetcher(),
      result = await checkServiceStatus(f, () => now)
    expect(f).toHaveBeenCalledTimes(3)
    expect(result.rows.map((r) => r.tone)).toEqual(['green', 'green', 'green', 'green', 'green'])
    expect(result.rows[1]!.detail).toBe('No reported incidents')
    expect(overallServiceTone(result.rows)).toBe('green')
  })
  it('maps multi-product outages/advisories to the services used by CERMS and ignores resolved/future incidents', async () => {
    const result = await checkServiceStatus(
      fetcher([
        incident('Cloud Firestore', 'SERVICE_OUTAGE'),
        incident('Cloud Run functions'),
        incident('Cloud Storage', 'SERVICE_INFORMATION'),
        incident('Identity Platform', 'SERVICE_OUTAGE', { end: '2026-11-13T17:30:00Z' }),
        incident('Firebase Authentication', 'SERVICE_OUTAGE', { begin: '2026-11-14T00:00:00Z' }),
        incident('Authentication', 'SERVICE_OUTAGE', {
          most_recent_update: { status: 'AVAILABLE' },
        }),
      ]),
      () => now,
    )
    expect(result.rows.map((r) => r.tone)).toEqual(['green', 'green', 'red', 'yellow', 'yellow'])
    expect(overallServiceTone(result.rows)).toBe('red')
  })
  it('includes Firebase Authentication incidents and platform-wide incidents', async () => {
    const r = await checkServiceStatus(
      fetcher([], [incident('Authentication', 'SERVICE_OUTAGE')]),
      () => now,
    )
    expect(r.rows[1]!.tone).toBe('red')
    const platform = await checkServiceStatus(
      fetcher([], [incident('Firebase Platform')]),
      () => now,
    )
    expect(platform.rows.slice(1).every((r) => r.tone === 'yellow')).toBe(true)
  })
  it('never reports unknown, malformed or unreachable status sources as healthy', async () => {
    for (const value of [
      { not: 'a report' },
      [{}],
      [{ begin: 'bad', service_name: 'Authentication' }],
    ]) {
      const r = await checkServiceStatus(fetcher(value), () => now)
      expect(r.rows[0]!.tone).toBe('green')
      expect(r.rows.slice(1).every((r) => r.tone === 'yellow')).toBe(true)
    }
    const offline = await checkServiceStatus(
      vi.fn().mockRejectedValue(new Error('offline')),
      () => now,
    )
    expect(offline.rows.map((r) => r.tone)).toEqual(['red', 'yellow', 'yellow', 'yellow', 'yellow'])
    expect(overallServiceTone(offline.rows)).toBe('red')
  })
  it('treats a blocked or captive connectivity check as limited when provider reports remain reachable', async () => {
    const result = await checkServiceStatus(fetcher([], [], 200), () => now)
    expect(result.rows[0]!.tone).toBe('yellow')
    expect(overallServiceTone(result.rows)).toBe('yellow')
  })
  it('keeps a known provider outage red even when the other status source fails', async () => {
    const base = fetcher([incident('Cloud Firestore', 'SERVICE_OUTAGE')])
    const f = (async (url, init) =>
      url === statusUrls.firebase
        ? new Response(null, { status: 503 })
        : base(url, init)) as typeof fetch
    const result = await checkServiceStatus(f, () => now)
    expect(result.rows[2]!.tone).toBe('red')
    expect(result.rows[1]!.tone).toBe('yellow')
  })
  it('deduplicates concurrent IPC requests and expires its short cache', async () => {
    let time = now
    const f = fetcher(),
      monitor = createServiceStatusMonitor(f, () => time)
    const [a, b] = await Promise.all([monitor(), monitor()])
    expect(a).toEqual(b)
    expect(f).toHaveBeenCalledTimes(3)
    await monitor()
    expect(f).toHaveBeenCalledTimes(3)
    time += 10001
    await monitor()
    expect(f).toHaveBeenCalledTimes(6)
  })
})
