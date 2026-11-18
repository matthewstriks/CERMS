import { expect, it } from 'vitest'
import {
  isSignedMemberFileUrl,
  isMemberFilesRequest,
  memberFilesEndpoint,
  memberFilesBucket,
} from '../src/shared/member-files-policy'
import { allowFirebaseRequest, isMemberFileUrl } from '../src/shared/firebase-policy'
function url() {
  const u = new URL(
    `https://storage.googleapis.com/${memberFilesBucket}/cerms5/members/dev/member/10000000-0000-4000-8000-000000000001/${'a'.repeat(64)}`,
  )
  for (const [k, v] of Object.entries({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential':
      'cerms5-support@cerms-7af24.iam.gserviceaccount.com/20261117/auto/storage/goog4_request',
    'X-Goog-Date': '20261117T120000Z',
    'X-Goog-Expires': '300',
    'X-Goog-SignedHeaders': 'host',
    'X-Goog-Signature': 'a'.repeat(512),
    'response-content-disposition': 'attachment; filename="photo.png"',
    'response-content-type': 'image/png',
  }))
    u.searchParams.set(k, v)
  return u
}
it('narrows file requests and keeps direct Storage writes blocked', () => {
  const body = JSON.stringify({
    data: {
      action: 'upload',
      business: 'dev',
      memberId: 'member',
      fileId: '10000000-0000-4000-8000-000000000001',
      name: 'photo.png',
      size: 1,
      base64: 'YQ==',
    },
  })
  expect(isMemberFilesRequest(body)).toBe(true)
  expect(allowFirebaseRequest(memberFilesEndpoint, 'POST', body)).toBe(true)
  expect(
    allowFirebaseRequest(
      'https://storage.googleapis.com/' + memberFilesBucket + '/file',
      'PUT',
      'bytes',
    ),
  ).toBe(false)
  expect(
    isMemberFilesRequest(
      JSON.stringify({
        data: {
          action: 'url',
          business: 'dev',
          memberId: 'member',
          fileId: '../foreign',
          download: true,
        },
      }),
    ),
  ).toBe(false)
})
it('permits only short signed GET-file links from the isolated bucket; legacy links remain scoped', () => {
  const u = url()
  expect(isSignedMemberFileUrl(u.href)).toBe(true)
  expect(isMemberFileUrl(u.href)).toBe(true)
  u.searchParams.set('X-Goog-Expires', '3600')
  expect(isSignedMemberFileUrl(u.href)).toBe(false)
  u.searchParams.set('X-Goog-Expires', '300')
  u.hostname = 'example.com'
  expect(isMemberFileUrl(u.href)).toBe(false)
  expect(isMemberFileUrl('https://storage.googleapis.com/cerms-7af24.appspot.com/legacy.pdf')).toBe(
    true,
  )
})
