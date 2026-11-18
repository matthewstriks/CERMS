export const bugReportEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/submitBugReport'
export const loginSupportEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/submitLoginSupport'

export function isBugReportRequest(body?: string): boolean {
  try {
    if (!body || body.length > 12 * 1024 * 1024) return false
    const payload = JSON.parse(body)
    return (
      Object.keys(payload).length === 1 &&
      Object.hasOwn(payload, 'data') &&
      !!payload.data &&
      typeof payload.data === 'object' &&
      !Array.isArray(payload.data) &&
      typeof payload.data.requestId === 'string' &&
      /^[a-f0-9-]{36}$/.test(payload.data.requestId)
    )
  } catch {
    return false
  }
}
