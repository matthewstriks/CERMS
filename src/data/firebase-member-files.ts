import { getFirebaseServices } from './firebase-membership'
import {
  memberFilesEndpoint,
  isMemberFilesRequest,
  isSignedMemberFileUrl,
  maxMemberFileBytes,
  type MemberAttachment,
} from '../shared/member-files-policy'
export function createMemberFiles(reader: { uid: string; club: string }, memberId: string) {
  const { auth } = getFirebaseServices()
  async function call<T>(data: Record<string, unknown>): Promise<T> {
    if (auth.currentUser?.uid !== reader.uid) throw Error('Sign in again to access member files.')
    const body = JSON.stringify({ data: { business: reader.club, memberId, ...data } })
    if (!isMemberFilesRequest(body)) throw Error('Choose a non-empty file up to 20 MB.')
    const response = await fetch(memberFilesEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body,
      signal: AbortSignal.timeout(180000),
    })
    const p = await response.json().catch(() => ({}))
    if (!response.ok || p.error || !p.result)
      throw Error(
        p.error?.message ||
          'File request was not confirmed. Refresh files or retry the same upload.',
      )
    if (auth.currentUser?.uid !== reader.uid) throw Error('Your session changed. Sign in again.')
    return p.result
  }
  return {
    list: (cursor?: string) =>
      call<{ rows: MemberAttachment[]; more: boolean; cursor: string | null }>({
        action: 'list',
        ...(cursor ? { cursor } : {}),
      }),
    async upload(file: File, fileId: string) {
      if (!file.size || file.size > maxMemberFileBytes)
        throw Error('Choose a non-empty file up to 20 MB.')
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
        r.onerror = () => reject(Error('The selected file could not be read.'))
        r.readAsDataURL(file)
      })
      return call<{ fileId: string }>({
        action: 'upload',
        fileId,
        name: file.name,
        size: file.size,
        base64,
      })
    },
    async url(fileId: string, download: boolean) {
      const result = await call<{ url: string }>({ action: 'url', fileId, download })
      if (!isSignedMemberFileUrl(result.url)) throw Error('The file link could not be verified.')
      return result.url
    },
  }
}
