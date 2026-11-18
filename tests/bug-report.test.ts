import { describe, expect, it } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { bugReportEndpoint, loginSupportEndpoint } from '../src/shared/bug-report-policy'
import { supportFileType } from '../src/shared/support-files'

describe('bug report request boundary', () => {
  it('allows only the bounded callable request on the named support endpoint', () => {
    const body = JSON.stringify({
      data: {
        requestId: '10000000-0000-0000-0000-000000000001',
      },
    })
    expect(allowFirebaseRequest(bugReportEndpoint, 'POST', body)).toBe(true)
    expect(allowFirebaseRequest(`${bugReportEndpoint}?extra=1`, 'POST', body)).toBe(false)
    expect(allowFirebaseRequest(bugReportEndpoint, 'GET', body)).toBe(false)
  })
})
it('keeps login support scoped and preserves image/document download media types', () => {
  const body = JSON.stringify({ data: { requestId: '10000000-0000-4000-8000-000000000001' } })
  expect(allowFirebaseRequest(loginSupportEndpoint, 'POST', body)).toBe(true)
  expect(allowFirebaseRequest(loginSupportEndpoint + '?extra=1', 'POST', body)).toBe(false)
  expect(supportFileType('photo.PNG')).toBe('image/png')
  expect(supportFileType('report.pdf')).toBe('application/pdf')
  expect(supportFileType('unknown.bin')).toBe('application/octet-stream')
})
