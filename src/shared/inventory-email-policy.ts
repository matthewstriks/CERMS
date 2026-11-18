export const inventoryEmailEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/inventoryEmailSettings'
export interface InventoryEmailSettings {
  enabled: boolean
  recipients: string[]
  revision: number
}
export function inventoryRecipients(value: string | string[]): string[] {
  const raw = typeof value === 'string' ? value.split(/[,;\n]+/) : value
  if (!Array.isArray(raw) || !raw.every((v) => typeof v === 'string'))
    throw Error('Enter valid email addresses.')
  const recipients = [...new Set(raw.map((v) => v.trim().toLowerCase()).filter(Boolean))].sort()
  if (
    recipients.length > 20 ||
    recipients.some(
      (v) =>
        v.length > 254 ||
        v.includes('..') ||
        v.startsWith('.') ||
        v.includes('.@') ||
        v.split('@')[0]!.length > 64 ||
        v
          .split('@')[1]
          ?.split('.')
          .some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
        !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(v),
    )
  )
    throw Error('Enter up to 20 valid email addresses, separated by commas or new lines.')
  return recipients
}
export function validInventoryEmailData(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const d = value as Record<string, unknown>
  if (typeof d.business !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(d.business)) return false
  const keys = Object.keys(d).sort().join()
  if (d.action === 'get') return keys === 'action,business'
  if (
    d.action !== 'save' ||
    keys !== 'action,business,enabled,expectedRevision,recipients' ||
    typeof d.enabled !== 'boolean' ||
    !Number.isSafeInteger(d.expectedRevision) ||
    (d.expectedRevision as number) < 0 ||
    !Array.isArray(d.recipients)
  )
    return false
  try {
    const original = d.recipients
    const r = inventoryRecipients(original)
    return (
      (!d.enabled || r.length > 0) &&
      r.length === d.recipients.length &&
      r.every((v, i) => v === original[i])
    )
  } catch {
    return false
  }
}
export function isInventoryEmailRequest(body?: string): boolean {
  try {
    if (!body || body.length > 8192) return false
    const p = JSON.parse(body)
    return Object.keys(p).join() === 'data' && validInventoryEmailData(p.data)
  } catch {
    return false
  }
}
