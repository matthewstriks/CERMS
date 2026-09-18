import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  doc,
  initializeFirestore,
  memoryLocalCache,
  memoryEagerGarbageCollector,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import type { Firestore, Unsubscribe } from 'firebase/firestore'
import { firebaseDatabaseId } from '../shared/firebase-policy'
import { getFirebaseServices } from './firebase-membership'
import { memberFromLegacy } from '../domain/legacy'
import { admissionFromLegacy } from '../domain/admissions'
import type { Admission, AdmissionRow, AdmissionsState } from '../domain/admissions'

let liveDb: Firestore | undefined
/** Separate full-SDK reader; the existing Lite SDK remains responsible for one-shot reads. */
function database(): Firestore {
  const { auth } = getFirebaseServices()
  liveDb ??= initializeFirestore(
    auth.app,
    { localCache: memoryLocalCache({ garbageCollector: memoryEagerGarbageCollector() }) },
    firebaseDatabaseId,
  )
  return liveDb
}
export function subscribeAdmissions(
  session: { uid: string; club: string },
  receive: (state: AdmissionsState) => void,
): Unsubscribe {
  const { auth } = getFirebaseServices()
  const db = database()
  let stopped = false,
    accessConfirmed = false,
    activityFresh = false
  let visits: Admission[] = []
  let stopAuth: Unsubscribe = () => {},
    stopProfile: Unsubscribe = () => {},
    stopActivity: Unsubscribe | undefined
  type MemberEntry = {
    stop: Unsubscribe
    fresh: boolean
    fields: Pick<
      AdmissionRow,
      'memberName' | 'memberNumber' | 'membershipType' | 'memberStatus' | 'dna' | 'tagged'
    >
  }
  const members = new Map<string, MemberEntry>()
  const emptyMember = (
    status: AdmissionRow['memberStatus'],
    name: string,
  ): MemberEntry['fields'] => ({
    memberName: name,
    memberNumber: '',
    membershipType: '',
    memberStatus: status,
    dna: false,
    tagged: false,
  })
  function stop() {
    if (stopped) return
    stopped = true
    stopAuth()
    stopProfile()
    stopActivity?.()
    for (const entry of members.values()) entry.stop()
    members.clear()
    visits = []
  }
  function fail(message: string) {
    if (stopped) return
    stop()
    receive({ rows: [], status: 'error', error: message })
  }
  function emit() {
    if (stopped) return
    if (!accessConfirmed) {
      receive({ rows: [], status: 'reconnecting' })
      return
    }
    const rows = visits
      .map((visit) => ({
        ...visit,
        ...(visit.removedMember
          ? emptyMember('removed', 'Removed member')
          : (members.get(visit.memberId)?.fields ?? emptyMember('missing', 'Member not found'))),
      }))
      .sort((a, b) => (b.enteredAt ?? 0) - (a.enteredAt ?? 0) || a.id.localeCompare(b.id))
    receive({
      rows,
      status:
        activityFresh && [...members.values()].every((entry) => entry.fresh)
          ? 'live'
          : 'reconnecting',
    })
  }
  function reconcileMembers() {
    const ids = new Set(
      visits
        .filter((visit) => !visit.removedMember && visit.memberId && !visit.memberId.includes('/'))
        .map((visit) => visit.memberId),
    )
    for (const [id, entry] of members)
      if (!ids.has(id)) {
        entry.stop()
        members.delete(id)
      }
    for (const id of ids) {
      if (members.has(id)) continue
      const entry: MemberEntry = {
        stop: () => {},
        fresh: false,
        fields: emptyMember('loading', 'Loading member…'),
      }
      members.set(id, entry)
      entry.stop = onSnapshot(
        doc(db, 'members', id),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (stopped || members.get(id) !== entry) return
          entry.fresh = !snapshot.metadata.fromCache
          if (entry.fresh) {
            if (!snapshot.exists()) entry.fields = emptyMember('missing', 'Member not found')
            else if (snapshot.data().access !== session.club)
              entry.fields = emptyMember('unavailable', 'Member unavailable')
            else {
              const member = memberFromLegacy(snapshot.id, snapshot.data(), session.club)
              entry.fields = {
                memberName: member.name,
                memberNumber: member.number,
                membershipType: member.membership,
                memberStatus: 'ready',
                dna: member.dna,
                tagged: member.tagged,
              }
            }
          }
          emit()
        },
        () => {
          if (stopped || members.get(id) !== entry) return
          entry.fresh = true
          entry.fields = emptyMember('unavailable', 'Member unavailable')
          emit()
        },
      )
    }
  }
  receive({ rows: [], status: 'connecting' })
  if (auth.currentUser?.uid !== session.uid) {
    fail('Your session has ended. Sign in again.')
    return stop
  }
  stopAuth = onAuthStateChanged(auth, (user) => {
    if (!stopped && user?.uid !== session.uid) fail('Your session has ended. Sign in again.')
  })
  stopProfile = onSnapshot(
    doc(db, 'users', session.uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (stopped) return
      if (snapshot.metadata.fromCache) {
        accessConfirmed = false
        emit()
        return
      }
      if (!snapshot.exists() || snapshot.data().access !== session.club) {
        fail('Your system access has changed. Sign out and sign in again.')
        return
      }
      accessConfirmed = true
      if (!stopActivity) {
        stopActivity = onSnapshot(
          query(
            collection(db, 'activity'),
            where('active', '==', true),
            where('access', '==', session.club),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (stopped) return
            activityFresh = !snapshot.metadata.fromCache
            // Cached snapshots are never used as a new source of club data.
            if (activityFresh) {
              try {
                visits = snapshot.docs
                  .map((record) => admissionFromLegacy(record.id, record.data(), session.club))
                  .filter((visit) => visit.active)
              } catch {
                fail('An admission record could not be verified for this system.')
                return
              }
              reconcileMembers()
            }
            emit()
          },
          () =>
            fail(
              'Admissions could not be loaded. Check your connection and Firebase access, then try again.',
            ),
        )
      }
      emit()
    },
    () => fail('Your system access could not be verified. Check your connection and try again.'),
  )
  return stop
}
