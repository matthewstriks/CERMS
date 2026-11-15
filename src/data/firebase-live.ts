import {
  initializeFirestore,
  memoryLocalCache,
  memoryEagerGarbageCollector,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseServices } from './firebase-membership'
import { firebaseDatabaseId } from '../shared/firebase-policy'
let liveDb: Firestore | undefined
/** Shared in-memory, read-only streaming client, fixed to named cerms. */
export function getLiveDatabase(): Firestore {
  const { auth } = getFirebaseServices()
  liveDb ??= initializeFirestore(
    auth.app,
    { localCache: memoryLocalCache({ garbageCollector: memoryEagerGarbageCollector() }) },
    firebaseDatabaseId,
  )
  return liveDb
}
