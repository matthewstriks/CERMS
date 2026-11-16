import { describe, expect, it } from 'vitest'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { bugReportEndpoint } from '../src/shared/bug-report-policy'

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
