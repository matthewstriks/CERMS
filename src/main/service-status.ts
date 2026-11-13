import { statusServices, type ServiceStatus, type ServiceStatusRow } from '../shared/service-status'

// Public, credential-free, read-only endpoints. Never probe business data, sign-ins,
// password resets, Storage objects or callable mutations for health checks.
export const statusUrls = {
  internet: 'https://www.gstatic.com/generate_204',
  firebase: 'https://status.firebase.google.com/incidents.json',
  cloud: 'https://status.cloud.google.com/incidents.json',
} as const
interface Incident {
  begin: string
  end?: string | null
  service_name?: string
  affected_products?: { title: string; current_title?: string }[]
  most_recent_update?: { status?: string }
  status_impact?: string
}
function parseIncidents(value: unknown): Incident[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (v) =>
        v &&
        typeof v === 'object' &&
        typeof v.begin === 'string' &&
        Number.isFinite(Date.parse(v.begin)) &&
        (v.end == null || (typeof v.end === 'string' && Number.isFinite(Date.parse(v.end)))) &&
        (typeof v.service_name === 'string' || Array.isArray(v.affected_products)) &&
        (v.affected_products === undefined ||
          (Array.isArray(v.affected_products) &&
            v.affected_products.every(
              (p: { title?: unknown }) => p && typeof p.title === 'string',
            ))),
    )
  )
    throw new Error('Status report unavailable')
  return value
}
const services: Record<string, RegExp> = {
  auth: /authentication|identity platform/i,
  database: /firestore/i,
  backend: /cloud functions|cloud run/i,
  storage: /cloud storage|storage for firebase/i,
}
interface Probe {
  ok: boolean
  elapsed: number
  status?: number
  incidents?: Incident[]
}
export async function checkServiceStatus(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ServiceStatus> {
  async function probe(key: keyof typeof statusUrls): Promise<Probe> {
    const started = now()
    try {
      const response = await fetcher(statusUrls[key], {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
        headers: { Accept: key === 'internet' ? '*/*' : 'application/json' },
      })
      const elapsed = now() - started
      if (key === 'internet') {
        await response.body?.cancel()
        return { ok: response.status === 204, elapsed, status: response.status }
      }
      if (!response.ok) {
        await response.body?.cancel()
        return { ok: false, elapsed }
      }
      const incidents = parseIncidents(await response.json())
      return { ok: true, elapsed, incidents }
    } catch {
      return { ok: false, elapsed: now() - started }
    }
  }
  const [internet, firebase, cloud] = await Promise.all([
    probe('internet'),
    probe('firebase'),
    probe('cloud'),
  ])
  const checkedAt = now(),
    anyReachable = internet.ok || firebase.ok || cloud.ok
  const rows: ServiceStatusRow[] = [
    {
      ...statusServices[0],
      tone: internet.ok
        ? internet.elapsed > 2500
          ? 'yellow'
          : 'green'
        : anyReachable || internet.status !== undefined
          ? 'yellow'
          : 'red',
      detail: internet.ok
        ? internet.elapsed > 2500
          ? 'Connected, but responding slowly'
          : 'Connected'
        : anyReachable
          ? 'Connected; connectivity check was limited'
          : internet.status !== undefined
            ? 'Connection may require network sign-in'
            : 'No internet response; check your connection',
    },
  ]
  const active = [...(firebase.incidents ?? []), ...(cloud.incidents ?? [])].filter(
    (i) =>
      Date.parse(i.begin) <= checkedAt &&
      (i.end == null || Date.parse(i.end) > checkedAt) &&
      i.most_recent_update?.status !== 'AVAILABLE',
  )
  for (const service of statusServices.slice(1)) {
    const incidents = active.filter((i) =>
      [
        i.service_name ?? '',
        ...(i.affected_products ?? []).flatMap((p) => [p.title, p.current_title ?? '']),
      ].some((title) => services[service.id]!.test(title) || /firebase platform/i.test(title)),
    )
    const outage = incidents.some(
      (i) => (i.most_recent_update?.status ?? i.status_impact) === 'SERVICE_OUTAGE',
    )
    rows.push({
      ...service,
      tone: outage ? 'red' : incidents.length || !firebase.ok || !cloud.ok ? 'yellow' : 'green',
      detail: outage
        ? 'Provider reports an outage'
        : incidents.length
          ? 'Provider reports a disruption or advisory'
          : !firebase.ok || !cloud.ok
            ? 'Provider status could not be fully checked'
            : 'No reported incidents',
    })
  }
  return { checkedAt, rows }
}
export function createServiceStatusMonitor(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  let cached: ServiceStatus | undefined
  let pending: Promise<ServiceStatus> | undefined
  return () => {
    if (pending) return pending
    if (cached && now() - cached.checkedAt < 10000) return Promise.resolve(cached)
    pending = checkServiceStatus(fetcher, now)
      .then((value) => {
        cached = value
        return value
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }
}
