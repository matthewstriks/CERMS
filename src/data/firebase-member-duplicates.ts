import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore/lite'
import type { QueryDocumentSnapshot } from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import { canCreateDevMember } from '../shared/dev-member-policy'
import { memberFromLegacy } from '../domain/legacy'
import {
  memberDuplicate,
  type MemberDuplicate,
  type MemberIdentity,
} from '../domain/member-duplicates'

/** Read every same-business record, including legacy records without search fields or dates.
 * No persisted cache, profile updates, index changes or desktop writes. */
export async function findMemberDuplicates(
  reader: { uid: string; club: string },
  input: MemberIdentity,
  signal?: AbortSignal,
): Promise<MemberDuplicate[]> {
  const { auth, db } = getFirebaseServices()
  function assertActive() {
    signal?.throwIfAborted()
    if (auth.currentUser?.uid !== reader.uid || !canCreateDevMember(reader.uid, reader.club))
      throw new Error('Sign in with permission to create members in this business.')
  }
  async function assertSession() {
    assertActive()
    const profile = await getDoc(doc(db, 'users', reader.uid))
    if (
      !profile.exists() ||
      profile.data().uid !== reader.uid ||
      profile.data().access !== reader.club
    )
      throw new Error('Your business access changed. Sign in again.')
    assertActive()
  }
  await assertSession()
  const matches: MemberDuplicate[] = []
  let cursor: QueryDocumentSnapshot | undefined
  for (;;) {
    assertActive()
    const page = await getDocs(
      query(
        collection(db, 'members'),
        where('access', '==', reader.club),
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(250),
      ),
    )
    assertActive()
    for (const record of page.docs) {
      const match = memberDuplicate(input, memberFromLegacy(record.id, record.data(), reader.club))
      if (match) matches.push(match)
    }
    if (page.size < 250) break
    cursor = page.docs.at(-1)
  }
  await assertSession()
  return matches.sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name))
}
