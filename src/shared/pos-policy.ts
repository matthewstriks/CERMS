export const posEndpoints = {
  completeSale: 'https://us-central1-cerms-7af24.cloudfunctions.net/completeSale',
  savePosSettings: 'https://us-central1-cerms-7af24.cloudfunctions.net/savePosSettings',
} as const
export function isPosRequest(url: string, body?: string): boolean {
  try {
    if (!body || body.length > 100000) return false
    const p = JSON.parse(body),
      d = p.data
    if (
      Object.keys(p).join() !== 'data' ||
      !d ||
      typeof d.business !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(d.business)
    )
      return false
    if (url === posEndpoints.savePosSettings)
      return (
        Object.keys(d).sort().join() ===
          'business,receiptAddress,receiptFooter,receiptName,taxRateBps' &&
        Number.isInteger(d.taxRateBps) &&
        d.taxRateBps >= 0 &&
        d.taxRateBps <= 10000 &&
        ['receiptName', 'receiptAddress', 'receiptFooter'].every(
          (k) => typeof d[k] === 'string' && d[k].length <= 500,
        )
      )
    return (
      url === posEndpoints.completeSale &&
      Object.keys(d).sort().join() ===
        'business,customerName,lines,note,payments,registerId,requestId,taxRateBps' &&
      typeof d.requestId === 'string' &&
      /^[a-f0-9-]{36}$/.test(d.requestId) &&
      typeof d.registerId === 'string' &&
      /^[a-f0-9-]{36}$/.test(d.registerId) &&
      Array.isArray(d.lines) &&
      d.lines.length > 0 &&
      d.lines.length <= 100 &&
      Array.isArray(d.payments) &&
      d.payments.length <= 12
    )
  } catch {
    return false
  }
}
