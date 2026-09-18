import { describe, expect, it } from 'vitest'
import { memberViewCommit, isMemberViewCommit } from '../src/shared/member-log-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
const event = '11111111-1111-4111-8111-111111111111'
const url = 'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents'
describe('append-only member log guard', () => {
  it('allows only a single server-timestamped Dev view event', () => {
    const body = JSON.stringify(memberViewCommit('test-member', event, 'Synthetic Staff'))
    expect(isMemberViewCommit(body)).toBe(true)
    expect(allowFirebaseRequest(url + ':commit', 'POST', body)).toBe(true)
    expect(
      allowFirebaseRequest(url.replace('/cerms/', '/(default)/') + ':commit', 'POST', body),
    ).toBe(false)
    expect(allowFirebaseRequest(url + '/system/dev/memberLogs/test-member:runQuery', 'POST')).toBe(
      true,
    )
    expect(
      allowFirebaseRequest(url + '/system/other/memberLogs/test-member:runQuery', 'POST'),
    ).toBe(false)
  })
  it.each([
    (p: any) => (p.writes[0].currentDocument.exists = true),
    (p: any) => (p.writes[0].update.fields.type.stringValue = 'member.created'),
    (p: any) => (p.writes[0].update.fields.actorUid.stringValue = 'other'),
    (p: any) => (p.writes[0].update.fields.actorName.stringValue = ''),
    (p: any) => (p.writes[0].update.fields.extra = { stringValue: 'unbounded' }),
    (p: any) => (p.writes[0].update.name = p.writes[0].update.name.replace('/dev/', '/other/')),
    (p: any) => (p.writes[0].updateTransforms[0].fieldPath = 'other'),
    (p: any) => p.writes.push(p.writes[0]),
  ])('rejects malformed or expanded writes', (mutate) => {
    const p = memberViewCommit('test-member', event, 'Synthetic Staff')
    mutate(p)
    expect(isMemberViewCommit(JSON.stringify(p))).toBe(false)
  })
})
