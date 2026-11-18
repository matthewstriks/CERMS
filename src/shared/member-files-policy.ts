export const memberFilesEndpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/memberFiles'
export const memberFilesBucket = 'cerms-7af24-cerms5-member-files'
export const maxMemberFileBytes = 20 * 1024 * 1024
export interface MemberAttachment {
  id: string
  name: string
  size: number
  contentType: string
  viewable: boolean
  uploadedBy: string
  createdAt: number | null
}
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const uuid = (v: unknown) =>
  typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === keys.sort().join()
export function validMemberFilesData(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const d = v as Record<string, unknown>
  if (!id(d.business) || !id(d.memberId)) return false
  if (d.action === 'list')
    return (
      exact(d, ['action', 'business', 'memberId', ...('cursor' in d ? ['cursor'] : [])]) &&
      (!('cursor' in d) || uuid(d.cursor))
    )
  if (d.action === 'url')
    return (
      exact(d, ['action', 'business', 'memberId', 'fileId', 'download']) &&
      uuid(d.fileId) &&
      typeof d.download === 'boolean'
    )
  return (
    d.action === 'upload' &&
    exact(d, ['action', 'business', 'memberId', 'fileId', 'name', 'size', 'base64']) &&
    uuid(d.fileId) &&
    typeof d.name === 'string' &&
    !!d.name.trim() &&
    d.name.length <= 200 &&
    !/[\x00-\x1f\x7f]/.test(d.name) &&
    Number.isSafeInteger(d.size) &&
    Number(d.size) > 0 &&
    Number(d.size) <= maxMemberFileBytes &&
    typeof d.base64 === 'string' &&
    d.base64.length > 0 &&
    d.base64.length <= Math.ceil(maxMemberFileBytes / 3) * 4 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(d.base64)
  )
}
export function isMemberFilesRequest(body?: string): boolean {
  try {
    if (!body || body.length > Math.ceil(maxMemberFileBytes / 3) * 4 + 4096) return false
    const d = JSON.parse(body)
    return exact(d, ['data']) && validMemberFilesData(d.data)
  } catch {
    return false
  }
}
/** Only short-lived, read-only links from the isolated private member bucket. */
export function isSignedMemberFileUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'storage.googleapis.com' ||
      u.port ||
      u.username ||
      u.password ||
      u.hash
    )
      return false
    if (
      !new RegExp(
        `^/${memberFilesBucket}/cerms5/members/[a-zA-Z0-9_-]{1,128}/[a-zA-Z0-9_-]{1,128}/[a-f0-9-]{36}/[a-f0-9]{64}$`,
      ).test(u.pathname)
    )
      return false
    const q = u.searchParams,
      keys = [
        'X-Goog-Algorithm',
        'X-Goog-Credential',
        'X-Goog-Date',
        'X-Goog-Expires',
        'X-Goog-SignedHeaders',
        'X-Goog-Signature',
        'response-content-disposition',
        'response-content-type',
      ]
    return (
      [...q.keys()].every((k) => keys.includes(k) && q.getAll(k).length === 1) &&
      q.get('X-Goog-Algorithm') === 'GOOG4-RSA-SHA256' &&
      /^cerms5-support@cerms-7af24\.iam\.gserviceaccount\.com\/\d{8}\/auto\/storage\/goog4_request$/.test(
        q.get('X-Goog-Credential') ?? '',
      ) &&
      /^\d{8}T\d{6}Z$/.test(q.get('X-Goog-Date') ?? '') &&
      /^\d{1,3}$/.test(q.get('X-Goog-Expires') ?? '') &&
      Number(q.get('X-Goog-Expires')) > 0 &&
      Number(q.get('X-Goog-Expires')) <= 300 &&
      q.get('X-Goog-SignedHeaders') === 'host' &&
      /^[a-f0-9]{128,1024}$/.test(q.get('X-Goog-Signature') ?? '') &&
      /^(inline|attachment); filename=/.test(q.get('response-content-disposition') ?? '') &&
      [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/octet-stream',
      ].includes(q.get('response-content-type') ?? '')
    )
  } catch {
    return false
  }
}
