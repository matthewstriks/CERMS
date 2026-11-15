import { getFirebaseServices } from './firebase-membership'
import { isMemberNotesRequest, memberNotesEndpoint } from '../shared/member-notes-policy'
import type { MembershipReader } from './membership-contracts'
export interface MemberNote {
  id: string
  text: string
  kind: 'note' | 'dna' | 'dna-cleared' | 'legacy'
  actorName: string
  actorUid: string
  createdAt: number | null
}
export interface MemberNotesState {
  name: string
  dna: boolean
  tagged: boolean
  revision: number
  notes: MemberNote[]
  nextCursor: string | null
}
export function createMemberNotes(
  reader: Pick<MembershipReader, 'uid' | 'club'>,
  memberId: string,
) {
  const { auth } = getFirebaseServices()
  async function call<T>(action: string, data: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ data: { business: reader.club, memberId, action, ...data } })
    if (!isMemberNotesRequest(body)) throw new Error('Check the member note details.')
    if (auth.currentUser?.uid !== reader.uid) throw new Error('Sign in again.')
    const r = await fetch(memberNotesEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body,
    })
    const p = await r.json()
    if (!r.ok || p.error)
      throw Object.assign(
        new Error(p.error?.message || 'Note save not confirmed. Retry the same note.'),
        {
          definitive: [
            'INVALID_ARGUMENT',
            'FAILED_PRECONDITION',
            'PERMISSION_DENIED',
            'ALREADY_EXISTS',
          ].includes(p.error?.status),
        },
      )
    return p.result ?? p.data
  }
  return {
    async list(): Promise<MemberNotesState> {
      const first = await call<MemberNotesState>('list', { cursor: null })
      let cursor = first.nextCursor
      while (cursor) {
        const page = await call<MemberNotesState>('list', { cursor })
        if (
          page.revision !== first.revision ||
          page.tagged !== first.tagged ||
          page.dna !== first.dna
        )
          throw new Error('Notes changed while loading. Reload to read the latest notes.')
        first.notes.push(...page.notes)
        cursor = page.nextCursor
      }
      return { ...first, nextCursor: null }
    },
    add: (requestId: string, text: string) => call('add', { requestId, text }),
    remove: (noteId: string) => call('remove', { noteId }),
    dna: (requestId: string, enabled: boolean, reason: string, expectedDna: boolean) =>
      call('dna', { requestId, enabled, reason, expectedDna }),
  }
}
