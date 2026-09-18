import { validCategory, validProduct } from '../domain/catalog'
import { devCreatorUid } from './dev-member-policy'
// Temporary owner gate until the business-admin rank/permission mapping is defined.
export const canManageCatalog = (uid: string, club: string, _rank?: unknown) =>
  uid === devCreatorUid && /^[a-zA-Z0-9_-]{1,128}$/.test(club)
export const catalogBase = 'projects/cerms-7af24/databases/cerms/documents'
export type CatalogKind = 'products' | 'categories'
export function catalogCommit(
  club: string,
  kind: CatalogKind,
  id: string,
  data: Record<string, unknown>,
  version: number,
  uid: string,
) {
  const field = (v: unknown): unknown =>
    v === null
      ? { nullValue: null }
      : Array.isArray(v)
        ? { arrayValue: { values: v.map(field) } }
        : typeof v === 'boolean'
          ? { booleanValue: v }
          : typeof v === 'number'
            ? Number.isInteger(v)
              ? { integerValue: String(v) }
              : { doubleValue: v }
            : { stringValue: v }
  return {
    writes: [
      {
        update: {
          name: `${catalogBase}/system/${club}/${kind}/${id}`,
          fields: Object.fromEntries(
            Object.entries({ ...data, version, updatedBy: uid }).map(([k, v]) => [k, field(v)]),
          ),
        },
        currentDocument: { exists: version > 1 },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  }
}
export function isCatalogCommit(body?: string): boolean {
  try {
    const p = JSON.parse(body ?? '{}'),
      w = p.writes?.[0]
    const prefix = `${catalogBase}/system/`
    if (typeof w?.update?.name !== 'string' || !w.update.name.startsWith(prefix)) return false
    const [club, kind, id, extra] = w.update.name.slice(prefix.length).split('/')
    if (
      !canManageCatalog(devCreatorUid, club ?? '') ||
      !['products', 'categories'].includes(kind) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(id ?? '') ||
      extra !== undefined
    )
      return false
    const fields = w.update.fields
    const decode = (f: any): any => {
      if (!f || Object.keys(f).length !== 1) throw new Error('Invalid field')
      if ('stringValue' in f && typeof f.stringValue === 'string') return f.stringValue
      if ('booleanValue' in f && typeof f.booleanValue === 'boolean') return f.booleanValue
      if ('nullValue' in f && f.nullValue === null) return null
      if ('integerValue' in f && typeof f.integerValue === 'string' && /^\d+$/.test(f.integerValue))
        return Number(f.integerValue)
      if ('doubleValue' in f && typeof f.doubleValue === 'number') return f.doubleValue
      if (
        'arrayValue' in f &&
        Object.keys(f.arrayValue).join() === 'values' &&
        Array.isArray(f.arrayValue.values)
      )
        return f.arrayValue.values.map(decode)
      throw new Error('Invalid field')
    }
    const decoded = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]))
    const { version, updatedBy, ...data } = decoded
    if (
      !Number.isSafeInteger(version) ||
      version < 1 ||
      updatedBy !== devCreatorUid ||
      !(kind === 'products' ? validProduct(data) : validCategory(data))
    )
      return false
    const normalize = (v: any): any =>
      Array.isArray(v)
        ? v.map(normalize)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, normalize(v[k])]),
            )
          : v
    return (
      JSON.stringify(normalize(p)) ===
      JSON.stringify(normalize(catalogCommit(club, kind, id, data, version, updatedBy)))
    )
  } catch {
    return false
  }
}
