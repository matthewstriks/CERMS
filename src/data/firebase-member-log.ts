import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import { getFirebaseServices } from './firebase-membership'
import type { MembershipReader } from './membership-contracts'
import { canCreateDevMember } from '../shared/dev-member-policy'
import { memberViewCommit, isMemberViewCommit } from '../shared/member-log-policy'
import { timestampToMillis } from '../domain/legacy'
export interface MemberLogEntry {
  id: string
  type: string
  actorUid: string
  actorName: string
  occurredAt: number | null
}
export function createMemberLog(reader: MembershipReader, memberId: string) {
  const { auth, db } = getFirebaseServices()
  const path = ['system', reader.club, 'memberLogs', memberId, 'events']
  let cursor: QueryDocumentSnapshot | undefined
  async function session() {
    if (!canCreateDevMember(reader.uid, reader.club) || auth.currentUser?.uid !== reader.uid)
      throw new Error('Member logging is available in Dev System only.')
    const profile = await getDoc(doc(db, 'users', reader.uid))
    if (
      !profile.exists() ||
      profile.data().access !== reader.club ||
      auth.currentUser?.uid !== reader.uid
    )
      throw new Error('Your system changed. Reopen the member.')
    return profile.data()
  }
  return {
    async viewed(eventId: string) {
      const profile = await session()
      const body = JSON.stringify(memberViewCommit(memberId, eventId, profile.displayName))
      if (!isMemberViewCommit(body)) throw new Error('Your staff name is missing or invalid.')
      const ref = doc(db, path[0]!, ...path.slice(1), eventId)
      const confirm = async () => {
        const prior = await getDoc(ref)
        return (
          prior.exists() &&
          prior.data().type === 'member.viewed' &&
          prior.data().actorUid === reader.uid
        )
      }
      try {
        const response = await fetch(
          'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
              'Content-Type': 'application/json',
            },
            body,
          },
        )
        if (response.ok) return
      } catch {
        /* Verify an uncertain commit before reporting failure. */
      }
      if (await confirm()) return
      throw new Error(
        'This view could not be recorded. Check your connection and logging permissions, then retry.',
      )
    },
    async list(reset = false): Promise<{ entries: MemberLogEntry[]; more: boolean }> {
      await session()
      const result = await getDocs(
        query(
          collection(db, path[0]!, ...path.slice(1)),
          orderBy('occurredAt', 'desc'),
          ...(!reset && cursor ? [startAfter(cursor)] : []),
          limit(50),
        ),
      )
      await session()
      cursor = result.docs.at(-1)
      return {
        entries: result.docs.map((d) => ({
          id: d.id,
          type: String(d.data().type),
          actorUid: String(d.data().actorUid),
          actorName: String(d.data().actorName),
          occurredAt: timestampToMillis(d.data().occurredAt),
        })),
        more: result.size === 50,
      }
    },
  }
}
